import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';

export const ModerationQueue = () => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-flagged'],
    queryFn: () => adminService.flaggedPosts(),
  });

  const moderate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resolve' | 'dismiss' | 'hide' | 'unhide' | 'delete' }) =>
      adminService.moderatePost(id, action),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-flagged'] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Moderation failed'),
  });

  if (isLoading) return <LoadingSpinner text="Loading moderation queue..." />;
  if (isError) {
    return (
      <Card>
        <p className="text-center text-red-600 py-8">Failed to load flagged posts ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }
  if (data?.unavailable) {
    return (
      <Card><p className="text-center text-[#5C635D] py-8">{data.unavailable}</p></Card>
    );
  }

  const posts = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-serif text-[#1F2421]">Moderation <span className="italic text-[#C4612F]">Queue</span></h1>
      {error && <Card><p className="text-sm text-red-600" role="alert">{error}</p></Card>}
      {posts.length === 0 ? (
        <Card><p className="text-center text-[#5C635D] py-8">No flagged posts. Nothing to review.</p></Card>
      ) : (
        posts.map((p: any) => (
          <Card key={p.id}>
            <p className="text-sm text-[#1F2421]">{p.body}</p>
            <p className="text-xs text-[#5C635D] mt-1">Thread: {p.thread_title} • Flags: {p.open_flags ?? p.flag_count}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'resolve' })}>Resolve</Button>
              <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'dismiss' })}>Dismiss</Button>
              <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'hide' })}>Hide</Button>
              <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'unhide' })}>Unhide</Button>
              <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: p.id, action: 'delete' })}>Delete</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
