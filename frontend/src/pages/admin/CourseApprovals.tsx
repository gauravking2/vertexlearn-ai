import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiErrorMessage } from '@/components/common/apiError';
import { BookMarked, Check, X, UserRound } from 'lucide-react';

export const CourseApprovals = () => {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => adminService.pendingCourses({ pageSize: 50 }),
  });

  const decision = useMutation({
    mutationFn: ({ id, d }: { id: string; d: 'approved' | 'rejected' }) =>
      adminService.decideCourse(id, d, d === 'approved' ? 'Approved by admin' : 'Rejected by admin'),
    onSuccess: () => {
      setNotice('Decision recorded and instructor notified.');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-pending'] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Decision failed'),
  });

  if (isLoading) return <LoadingSpinner text="Loading approval queue..." />;
  if (isError) {
    return (
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">Failed to load pending courses ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }

  const courses = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
          Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Approvals</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Review and decide on submitted courses</p>
      </div>
      {error && <Card><p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p></Card>}
      {notice && <Card><p className="text-sm text-green-700 dark:text-green-400" role="status">{notice}</p></Card>}
      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookMarked}
            title="No pending courses"
            description="The approval queue is empty — new submissions will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3 vl-stagger">
          {courses.map((c: any) => (
            <Card key={c.id} variant="elevated" className="relative overflow-hidden">
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600" />
              <div className="pl-2">
                <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{c.title}</h3>
                <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-2">{c.description}</p>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-3 flex items-center gap-1.5">
                  <UserRound size={12} aria-hidden="true" />
                  Instructor: {c.instructor_name} ({c.instructor_email})
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decision.mutate({ id: c.id, d: 'approved' })} loading={decision.isPending}>
                    <Check size={14} aria-hidden="true" /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => decision.mutate({ id: c.id, d: 'rejected' })}>
                    <X size={14} aria-hidden="true" /> Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
