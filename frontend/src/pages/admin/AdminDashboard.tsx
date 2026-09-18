import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const AdminDashboard = () => {
  const { data: analytics, isLoading, isError } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => adminService.analyticsOverview(),
  });
  const { data: pending } = useQuery({
    queryKey: ['admin-pending-count'],
    queryFn: () => adminService.pendingCourses({ pageSize: 1 }),
  });
  const { data: flagged } = useQuery({
    queryKey: ['admin-flagged-count'],
    queryFn: () => adminService.flaggedPosts(),
  });

  if (isLoading) return <LoadingSpinner text="Loading admin dashboard..." />;
  if (isError) {
    return (
      <Card>
        <p className="text-center text-red-600 py-8">Failed to load platform analytics. Check your admin access.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-[#1F2421] mb-2">
          Admin <span className="italic text-[#C4612F]">Dashboard</span>
        </h1>
        <p className="text-[#5C635D]">Real platform data — no demo metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-2xl font-serif text-[#1F2421]">{analytics?.users?.total ?? 0}</p>
          <p className="text-xs text-[#5C635D]">Total users</p>
        </Card>
        <Card>
          <p className="text-2xl font-serif text-[#1F2421]">{analytics?.enrollments?.total ?? 0}</p>
          <p className="text-xs text-[#5C635D]">Enrollments</p>
        </Card>
        <Card>
          <p className="text-2xl font-serif text-[#1F2421]">{pending?.total ?? 0}</p>
          <p className="text-xs text-[#5C635D]">Courses pending review</p>
        </Card>
        <Card>
          <p className="text-2xl font-serif text-[#1F2421]">{flagged?.data?.length ?? 0}</p>
          <p className="text-xs text-[#5C635D]">Flagged posts</p>
        </Card>
      </div>

      {analytics?.revenue && (
        <Card>
          <h3 className="font-medium text-[#1F2421] mb-1">Revenue</h3>
          <p className="text-sm text-[#5C635D]">
            {analytics.revenue.recorded > 0
              ? (analytics.revenue.totals ?? []).map((t: any) => `${(t.total_cents / 100).toFixed(2)} ${t.currency}`).join(', ')
              : `Not available — ${analytics.revenue.reason ?? 'no payment records'} (showing $0 safe empty-state).`}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-medium text-[#1F2421] mb-2">Manage</h3>
          <div className="space-y-2">
            <Button as={Link} to="/admin/users" variant="outline" fullWidth>User management</Button>
            <Button as={Link} to="/admin/courses/pending" variant="outline" fullWidth>Course approval queue</Button>
            <Button as={Link} to="/admin/analytics" variant="outline" fullWidth>Platform analytics</Button>
            <Button as={Link} to="/admin/moderation" variant="outline" fullWidth>Moderation queue</Button>
          </div>
        </Card>
        <Card>
          <h3 className="font-medium text-[#1F2421] mb-2">Completion</h3>
          <p className="text-sm text-[#5C635D]">
            {analytics?.enrollments?.completions ?? 0} completions of {analytics?.enrollments?.total ?? 0} enrollments
            ({Math.round((analytics?.enrollments?.completionRate ?? 0) * 100)}%).
          </p>
          <p className="text-sm text-[#5C635D] mt-1">
            DAU (24h estimate): {analytics?.dau?.last24hActiveUsers ?? 0}
          </p>
        </Card>
      </div>
    </div>
  );
};
