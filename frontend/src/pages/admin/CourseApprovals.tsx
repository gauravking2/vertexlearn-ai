import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';

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
        <p className="text-center text-red-600 py-8">Failed to load pending courses ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }

  const courses = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-serif text-[#1F2421]">Course <span className="italic text-[#C4612F]">Approvals</span></h1>
      {error && <Card><p className="text-sm text-red-600" role="alert">{error}</p></Card>}
      {notice && <Card><p className="text-sm text-green-700" role="status">{notice}</p></Card>}
      {courses.length === 0 ? (
        <Card><p className="text-center text-[#5C635D] py-8">No pending courses. The queue is empty.</p></Card>
      ) : (
        courses.map((c: any) => (
          <Card key={c.id}>
            <h3 className="font-medium text-[#1F2421]">{c.title}</h3>
            <p className="text-sm text-[#5C635D] mb-2">{c.description}</p>
            <p className="text-xs text-[#5C635D] mb-3">Instructor: {c.instructor_name} ({c.instructor_email})</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decision.mutate({ id: c.id, d: 'approved' })}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => decision.mutate({ id: c.id, d: 'rejected' })}>Reject</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
