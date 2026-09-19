import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Users, GraduationCap, Activity, TrendingUp } from 'lucide-react';

export const PlatformAnalytics = () => {
  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-analytics-full'],
    queryFn: () => adminService.analyticsOverview(),
  });

  if (isLoading) return <LoadingSpinner text="Loading platform analytics..." />;
  if (isError || !data) {
    return (
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">Failed to load analytics ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
          Platform <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Analytics</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Users, enrollments, activity, and revenue across the platform</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 vl-stagger">
        <Card variant="elevated" className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] flex items-center gap-2 mb-1">
            <Users size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" /> Users
          </h3>
          <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{data.users.total}</p>
          <ul className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-2 space-y-0.5">
            {(data.users.byRole ?? []).map((r: any) => (
              <li key={r.role} className="capitalize">{r.role}: {r.count}</li>
            ))}
          </ul>
        </Card>
        <Card variant="elevated" className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] flex items-center gap-2 mb-1">
            <GraduationCap size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" /> Enrollments
          </h3>
          <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{data.enrollments.total}</p>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-2">Last 7 days: {data.enrollments.last7Days}</p>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Completions: {data.enrollments.completions}</p>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Completion rate: {Math.round((data.enrollments.completionRate ?? 0) * 100)}%</p>
        </Card>
        <Card variant="elevated" className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] flex items-center gap-2 mb-1">
            <Activity size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" /> Activity
          </h3>
          <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{data.dau.last24hActiveUsers}</p>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-2">DAU estimate (24h)</p>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Certificates: {data.certificates.total}</p>
        </Card>
      </div>
      <Card>
        <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1">Courses by status</h3>
        <ul className="text-sm text-[#5C635D] dark:text-[#b9beb4] space-y-1">
          {(data.courses.byStatus ?? []).map((r: any) => (
            <li key={r.status} className="capitalize flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C4612F] dark:bg-[#e8a06f]" aria-hidden="true" />
              {r.status}: {r.count}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1 flex items-center gap-2">
          <TrendingUp size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" /> Revenue
        </h3>
        {data.revenue?.recorded > 0 ? (
          <div>
            <ul className="text-sm text-[#1F2421] dark:text-[#ece9e2]">
              {(data.revenue.totals ?? []).map((t: any) => (
                <li key={t.currency}>
                  {(t.total_cents / 100).toFixed(2)} {t.currency} (completed payments)
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1">{data.revenue.recorded} payment record(s) on file.</p>
          </div>
        ) : (
          <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
            No recorded revenue — {data.revenue?.reason ?? 'no payment records exist.'}
          </p>
        )}
      </Card>
    </div>
  );
};
