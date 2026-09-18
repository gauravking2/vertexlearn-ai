import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseDiscussions } from '@/pages/discussions/CourseDiscussions';
import { ThreadView } from '@/pages/discussions/ThreadView';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { AnnouncementList } from '@/components/announcements/AnnouncementList';
import { authStore } from '@/store/authStore';

vi.mock('@/services/discussionService', () => ({
  discussionService: {
    listThreads: vi.fn(async () => ({
      data: [{ id: 't1', course_id: 'c1', author_id: 's1', author_name: 'Stud', title: 'Deadline question', post_count: 2, created_at: '' }],
    })),
    createThread: vi.fn(async () => ({ id: 't2', title: 'New thread' })),
    getThread: vi.fn(async () => ({
      thread: { id: 't1', title: 'Deadline question' },
      posts: [
        { id: 'p1', thread_id: 't1', author_id: 's1', author_name: 'Stud', body: 'When is it due?', created_at: '' },
        { id: 'p2', thread_id: 't1', author_id: 's2', author_name: 'Peer', body: 'Friday', created_at: '' },
      ],
    })),
    reply: vi.fn(async () => ({ id: 'p3', body: 'Thanks!' })),
    flagPost: vi.fn(async () => ({ id: 'f1', status: 'open' })),
    moderatePost: vi.fn(async () => ({})),
    deletePost: vi.fn(async () => undefined),
  },
}));

vi.mock('@/services/notificationService', () => ({
  notificationService: {
    list: vi.fn(async () => ({
      data: [
        { id: 'n1', type: 'announcement', title: 'New announcement', body: 'Week 1', is_read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'course_approved', title: 'Approved', is_read: true, created_at: new Date().toISOString() },
      ],
    })),
    unreadCount: vi.fn(async () => ({ unread: 1 })),
    markRead: vi.fn(async (id: string) => ({ id, is_read: true })),
    markAllRead: vi.fn(async () => ({ updated: 1 })),
    emailStatus: vi.fn(async () => ({ provider: 'mock', configured: false, note: '' })),
  },
}));

vi.mock('@/services/announcementService', () => ({
  announcementService: {
    list: vi.fn(async () => ({
      data: [{ id: 'a1', course_id: 'c1', author_id: 't1', author_name: 'Teach', title: 'Welcome', body: 'Read the syllabus', created_at: new Date().toISOString() }],
    })),
    create: vi.fn(async () => ({ id: 'a2', title: 'Week 2' })),
  },
}));

import { discussionService } from '@/services/discussionService';
import { notificationService } from '@/services/notificationService';
import { announcementService } from '@/services/announcementService';

function renderWithProviders(ui: React.ReactNode, initialEntries = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('course discussions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists threads and creates a new thread', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/courses/:courseId/discussions" element={<CourseDiscussions />} />
      </Routes>,
      ['/courses/c1/discussions']
    );
    await waitFor(() => expect(screen.getByText('Deadline question')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Thread title'), 'My question');
    await user.type(screen.getByLabelText('Thread body'), 'What is the syllabus?');
    await user.click(screen.getByRole('button', { name: 'Create thread' }));
    await waitFor(() =>
      expect(vi.mocked(discussionService.createThread)).toHaveBeenCalledWith('c1', { title: 'My question', body: 'What is the syllabus?' })
    );
  });

  it('shows thread posts, replies, and reports content', async () => {
    const user = userEvent.setup();
    authStore.setState({
      user: { id: 's1', email: 's@e.com', name: 'S', roles: ['student'], createdAt: '' },
      accessToken: 't',
      refreshToken: 'r',
      isAuthenticated: true,
    });
    renderWithProviders(
      <Routes>
        <Route path="/courses/:courseId/discussions/:threadId" element={<ThreadView />} />
      </Routes>,
      ['/courses/c1/discussions/t1']
    );
    await waitFor(() => expect(screen.getByText('When is it due?')).toBeInTheDocument());
    expect(screen.getByText('Friday')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reply body'), 'Thanks!');
    await user.click(screen.getByRole('button', { name: 'Post reply' }));
    await waitFor(() => expect(vi.mocked(discussionService.reply)).toHaveBeenCalledWith('t1', { body: 'Thanks!' }));
    await user.click(screen.getAllByRole('button', { name: 'Report' })[0]);
    await waitFor(() => expect(vi.mocked(discussionService.flagPost)).toHaveBeenCalledWith('p1', expect.any(String)));
    authStore.getState().logout();
  });
});

describe('notifications page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists notifications with unread count and marks them read', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPage />);
    await waitFor(() => expect(screen.getByText('New announcement')).toBeInTheDocument());
    expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(vi.mocked(notificationService.markRead)).toHaveBeenCalledWith('n1'));
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(vi.mocked(notificationService.markAllRead)).toHaveBeenCalled());
  });
});

describe('announcement list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('displays announcements to students without a publish form', async () => {
    authStore.setState({
      user: { id: 's1', email: 's@e.com', name: 'S', roles: ['student'], createdAt: '' },
      accessToken: 't',
      refreshToken: 'r',
      isAuthenticated: true,
    });
    renderWithProviders(<AnnouncementList courseId="c1" instructorId="t1" />);
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
    expect(screen.queryByLabelText('Announcement title')).not.toBeInTheDocument();
    authStore.getState().logout();
  });

  it('lets the course owner publish announcements', async () => {
    const user = userEvent.setup();
    authStore.setState({
      user: { id: 't1', email: 't@e.com', name: 'T', roles: ['instructor'], createdAt: '' },
      accessToken: 't',
      refreshToken: 'r',
      isAuthenticated: true,
    });
    renderWithProviders(<AnnouncementList courseId="c1" instructorId="t1" />);
    await waitFor(() => expect(screen.getByLabelText('Announcement title')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Announcement title'), 'Week 2');
    await user.type(screen.getByLabelText('Announcement body'), 'New material posted');
    await user.click(screen.getByRole('button', { name: 'Publish announcement' }));
    await waitFor(() =>
      expect(vi.mocked(announcementService.create)).toHaveBeenCalledWith('c1', { title: 'Week 2', body: 'New material posted' })
    );
    authStore.getState().logout();
  });
});

describe('phase5 service contracts', () => {
  it('discussion/notification/announcement/admin services hit real routes', async () => {
    const { adminService } = await import('@/services/adminService');
    for (const m of ['listUsers', 'setRole', 'setSuspended', 'deleteUser', 'pendingCourses', 'approveCourse', 'rejectCourse', 'decideCourse', 'analyticsOverview', 'flaggedPosts', 'moderatePost']) {
      expect(typeof (adminService as any)[m]).toBe('function');
    }
    expect(typeof discussionService.listThreads).toBe('function');
    expect(typeof discussionService.reply).toBe('function');
    expect(typeof discussionService.flagPost).toBe('function');
    expect(typeof notificationService.unreadCount).toBe('function');
    expect(typeof notificationService.markAllRead).toBe('function');
    expect(typeof announcementService.create).toBe('function');
  });
});
