import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const PlatformAnalytics = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-analytics-full'],
    queryFn: () => adminService.analyticsOverview(),
  });

  if (isLoading) return <LoadingSpinner text="Loading platform analytics..." />;
  if (isError || !data) {
    return (
      <Card><p className="text-center text-red-600 py-8">Failed to load analytics. Admin access required.</p></Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-serif text-[#1F2421]">Platform <span className="italic text-[#C4612F]">Analytics</span></h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-medium text-[#1F2421]">Users</h3>
          <p className="text-2xl font-serif">{data.users.total}</p>
          <ul className="text-xs text-[#5C635D]">
            {(data.users.byRole ?? []).map((r: any) => (
              <li key={r.role}>{r.role}: {r.count}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="font-medium text-[#1F2421]">Enrollments</h3>
          <p className="text-2xl font-serif">{data.enrollments.total}</p>
          <p className="text-xs text-[#5C635D]">Last 7 days: {data.enrollments.last7Days}</p>
          <p className="text-xs text-[#5C635D]">Completions: {data.enrollments.completions}</p>
          <p className="text-xs text-[#5C635D]">Completion rate: {Math.round((data.enrollments.completionRate ?? 0) * 100)}%</p>
        </Card>
        <Card>
          <h3 className="font-medium text-[#1F2421]">Activity</h3>
          <p className="text-2xl font-serif">{data.dau.last24hActiveUsers}</p>
          <p className="text-xs text-[#5C635D]">DAU estimate (24h)</p>
          <p className="text-xs text-[#5C635D]">Certificates: {data.certificates.total}</p>
        </Card>
      </div>
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-1">Courses by status</h3>
        <ul className="text-sm text-[#5C635D]">
          {(data.courses.byStatus ?? []).map((r: any) => (
            <li key={r.status}>{r.status}: {r.count}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-1">Revenue</h3>
        {data.revenue?.recorded > 0 ? (
          <div>
            <ul className="text-sm text-[#1F2421]">
              {(data.revenue.totals ?? []).map((t: any) => (
                <li key={t.currency}>
                  {(t.total_cents / 100).toFixed(2)} {t.currency} (completed payments)
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#5C635D] mt-1">{data.revenue.recorded} payment record(s) on file.</p>
          </div>
        ) : (
          <p className="text-sm text-[#5C635D]">
            No recorded revenue — {data.revenue?.reason ?? 'no payment records exist.'}
          </p>
        )}
      </Card>
    </div>
  );
};
