import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { authStore } from '@/store/authStore';
import { UserManagement } from '@/pages/admin/UserManagement';
import { CourseApprovals } from '@/pages/admin/CourseApprovals';
import { PlatformAnalytics } from '@/pages/admin/PlatformAnalytics';
import { ModerationQueue } from '@/pages/admin/ModerationQueue';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';

vi.mock('@/services/adminService', () => ({
  adminService: {
    listUsers: vi.fn(async () => ({
      data: [
        { id: 'u1', email: 'stud@example.com', name: 'Stud', roles: ['student'], is_suspended: false, created_at: '' },
        { id: 'u2', email: 'teach@example.com', name: 'Teach', roles: ['instructor'], is_suspended: false, created_at: '' },
      ],
      total: 2,
    })),
    setRole: vi.fn(async () => ({ id: 'u1', roles: ['student', 'instructor'] })),
    setSuspended: vi.fn(async () => ({ id: 'u1', is_suspended: true })),
    deleteUser: vi.fn(async () => undefined),
    pendingCourses: vi.fn(async () => ({
      data: [{ id: 'c1', title: 'Pending Course', description: 'desc', instructor_name: 'Teach', instructor_email: 'teach@example.com' }],
      total: 1,
    })),
    decideCourse: vi.fn(async () => ({ id: 'c1', status: 'published' })),
    approveCourse: vi.fn(async () => ({ id: 'c1', status: 'published' })),
    rejectCourse: vi.fn(async () => ({ id: 'c1', status: 'rejected' })),
    analyticsOverview: vi.fn(async () => ({
      users: { total: 10, byRole: [{ role: 'student', count: 8 }] },
      enrollments: { total: 5, last7Days: 2, completions: 1, completionRate: 0.2 },
      courses: { byStatus: [{ status: 'published', count: 3 }] },
      certificates: { total: 1 },
      dau: { last24hActiveUsers: 4 },
      revenue: { total: 0, recorded: 0, totals: [], unavailable: true, reason: 'No payment data exists; revenue cannot be calculated.' },
    })),
    flaggedPosts: vi.fn(async () => ({
      data: [{ id: 'p1', body: 'flagged content', thread_title: 'T1', open_flags: 1, flag_count: 1 }],
    })),
    moderatePost: vi.fn(async () => ({ id: 'p1', action: 'resolve' })),
  },
}));

import { adminService } from '@/services/adminService';

const mockedAdmin = vi.mocked(adminService);

function renderWithProviders(ui: React.ReactNode, initialEntries = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const adminUser = { id: 'a1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] as const, createdAt: '' };
const studentUser = { id: 's1', email: 'stud@example.com', name: 'Stud', roles: ['student'] as const, createdAt: '' };

describe('admin route protection', () => {
  beforeEach(() => {
    authStore.getState().logout();
    vi.clearAllMocks();
  });

  it('blocks students from /admin (redirects to /unauthorized)', () => {
    authStore.setState({ user: { ...studentUser, roles: ['student'] }, accessToken: 't', refreshToken: 'r', isAuthenticated: true });
    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<ProtectedRoute requiredRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/unauthorized" element={<div>Unauthorized</div>} />
      </Routes>,
      ['/admin']
    );
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('allows admins into /admin', async () => {
    authStore.setState({ user: { ...adminUser, roles: ['admin'] }, accessToken: 't', refreshToken: 'r', isAuthenticated: true });
    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<ProtectedRoute requiredRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
      </Routes>,
      ['/admin']
    );
    await waitFor(() => expect(screen.getByText(/Admin/)).toBeInTheDocument());
  });
});

describe('user management', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders real user list with search', async () => {
    renderWithProviders(<UserManagement />);
    await waitFor(() => expect(screen.getByText(/stud@example.com/)).toBeInTheDocument());
    expect(screen.getByText(/teach@example.com/)).toBeInTheDocument();
    expect(screen.getByLabelText('Search users')).toBeInTheDocument();
  });

  it('searches users via the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserManagement />);
    await waitFor(() => expect(screen.getByText(/stud@example.com/)).toBeInTheDocument());
    await user.type(screen.getByLabelText('Search users'), 'stud');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mockedAdmin.listUsers).toHaveBeenCalledWith(expect.objectContaining({ q: 'stud' })));
  });

  it('assigns a role and suspends/restores a user', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserManagement />);
    await waitFor(() => expect(screen.getByText(/stud@example.com/)).toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: 'Make instructor' })[0]);
    await waitFor(() => expect(mockedAdmin.setRole).toHaveBeenCalledWith('u1', 'instructor', 'assign'));
    await user.click(screen.getAllByRole('button', { name: 'Suspend' })[0]);
    await waitFor(() => expect(mockedAdmin.setSuspended).toHaveBeenCalledWith('u1', true));
  });
});

describe('course approval', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the pending queue and approves/rejects', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CourseApprovals />);
    await waitFor(() => expect(screen.getByText('Pending Course')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mockedAdmin.decideCourse).toHaveBeenCalledWith('c1', 'approved', expect.any(String)));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(mockedAdmin.decideCourse).toHaveBeenCalledWith('c1', 'rejected', expect.any(String)));
  });
});

describe('platform analytics', () => {
  it('renders real metrics and the explicit revenue gap', async () => {
    renderWithProviders(<PlatformAnalytics />);
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    expect(screen.getByText(/No recorded revenue/)).toBeInTheDocument();
  });
});

describe('moderation queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders flagged posts and resolves them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModerationQueue />);
    await waitFor(() => expect(screen.getByText('flagged content')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(mockedAdmin.moderatePost).toHaveBeenCalledWith('p1', 'resolve'));
  });
});
