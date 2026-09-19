import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Users, GraduationCap, BookMarked, Flag, TrendingUp, Activity } from 'lucide-react';

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
        <p className="text-center text-red-600 dark:text-red-400 py-8">Failed to load platform analytics. Check your admin access.</p>
      </Card>
    );
  }

  const metrics = [
    { icon: Users, label: 'Total users', value: analytics?.users?.total ?? 0 },
    { icon: GraduationCap, label: 'Enrollments', value: analytics?.enrollments?.total ?? 0 },
    { icon: BookMarked, label: 'Courses pending review', value: pending?.total ?? 0 },
    { icon: Flag, label: 'Flagged posts', value: flagged?.data?.length ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Admin <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Dashboard</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Real platform data — no demo metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 vl-stagger">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} variant="elevated" className="relative overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]"
              />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center mb-3" aria-hidden="true">
                  <Icon className="text-[#C4612F] dark:text-[#e8a06f]" size={18} />
                </div>
                <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums leading-none mb-1">{m.value}</p>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{m.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {analytics?.revenue && (
        <Card>
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1 flex items-center gap-2">
            <TrendingUp size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
            Revenue
          </h3>
          <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
            {analytics.revenue.recorded > 0
              ? (analytics.revenue.totals ?? []).map((t: any) => `${(t.total_cents / 100).toFixed(2)} ${t.currency}`).join(', ')
              : `Not available — ${analytics.revenue.reason ?? 'no payment records'} (showing $0 safe empty-state).`}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card variant="inset">
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">Manage</h3>
          <div className="space-y-2">
            <Button as={Link} to="/admin/users" variant="outline" fullWidth>User management</Button>
            <Button as={Link} to="/admin/courses/pending" variant="outline" fullWidth>Course approval queue</Button>
            <Button as={Link} to="/admin/analytics" variant="outline" fullWidth>Platform analytics</Button>
            <Button as={Link} to="/admin/moderation" variant="outline" fullWidth>Moderation queue</Button>
          </div>
        </Card>
        <Card>
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3 flex items-center gap-2">
            <Activity size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
            Completion
          </h3>
          <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
            {analytics?.enrollments?.completions ?? 0} completions of {analytics?.enrollments?.total ?? 0} enrollments
            ({Math.round((analytics?.enrollments?.completionRate ?? 0) * 100)}%).
          </p>
          <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mt-1">
            DAU (24h estimate): {analytics?.dau?.last24hActiveUsers ?? 0}
          </p>
        </Card>
      </div>
    </div>
  );
};
