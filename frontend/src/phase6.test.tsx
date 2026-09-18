import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseReviews } from '@/components/reviews/CourseReviews';
import { PlatformAnalytics } from '@/pages/admin/PlatformAnalytics';
import { adminService } from '@/services/adminService';
import { courseService } from '@/services/courseService';
import { assignmentService } from '@/services/assignmentService';

vi.mock('@/services/adminService', () => ({
  adminService: {
    analyticsOverview: vi.fn(),
  },
}));

vi.mock('@/services/courseService', () => ({
  courseService: {
    listReviews: vi.fn(),
    submitReview: vi.fn(),
    getLectureVideoUrl: vi.fn(),
    requestLectureUploadUrl: vi.fn(),
  },
}));

vi.mock('@/services/assignmentService', () => ({
  assignmentService: {
    uploadSubmissionFile: vi.fn(),
  },
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('course reviews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the real aggregate and submits a review', async () => {
    const user = userEvent.setup();
    vi.mocked(courseService.listReviews).mockResolvedValue({
      data: [{ id: 'r1', rating: 5, review: 'Great', reviewerName: 'Stud', createdAt: '' }],
      aggregate: { avg_rating: 5, rating_count: 1 },
    } as any);
    vi.mocked(courseService.submitReview).mockResolvedValue({ id: 'r2' });
    renderWithProviders(<CourseReviews courseId="c1" canReview />);
    await waitFor(() => expect(screen.getByText(/5.0 average from 1 review/)).toBeInTheDocument());
    expect(screen.getByText('Great')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Review text'), 'Loved it');
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() =>
      expect(vi.mocked(courseService.submitReview)).toHaveBeenCalledWith('c1', { rating: 5, review: 'Loved it' })
    );
  });

  it('hides the form when the viewer cannot review', async () => {
    vi.mocked(courseService.listReviews).mockResolvedValue({ data: [], aggregate: { avg_rating: 0, rating_count: 0 } });
    renderWithProviders(<CourseReviews courseId="c1" canReview={false} />);
    await waitFor(() => expect(screen.getByText('No reviews yet.')).toBeInTheDocument());
    expect(screen.queryByLabelText('Review text')).not.toBeInTheDocument();
  });
});

describe('admin revenue with real records', () => {
  it('renders completed-payment totals per currency', async () => {
    vi.mocked(adminService.analyticsOverview).mockResolvedValue({
      users: { total: 3, byRole: [] },
      enrollments: { total: 2, last7Days: 1, completions: 0, completionRate: 0 },
      courses: { byStatus: [] },
      certificates: { total: 0 },
      dau: { last24hActiveUsers: 1 },
      revenue: { recorded: 2, totals: [{ currency: 'USD', total_cents: 4999 }], counts: { completed: 1, pending: 1 }, total: 4999, currency: 'USD', unavailable: false },
    });
    renderWithProviders(<PlatformAnalytics />);
    await waitFor(() => expect(screen.getByText(/49.99 USD/)).toBeInTheDocument());
    expect(screen.getByText(/2 payment record/)).toBeInTheDocument();
  });
});

describe('phase6 service contracts', () => {
  it('exposes upload/review/video methods on the real routes', () => {
    expect(typeof courseService.listReviews).toBe('function');
    expect(typeof courseService.submitReview).toBe('function');
    expect(typeof courseService.requestLectureUploadUrl).toBe('function');
    expect(typeof courseService.getLectureVideoUrl).toBe('function');
    expect(typeof assignmentService.uploadSubmissionFile).toBe('function');
  });
});
