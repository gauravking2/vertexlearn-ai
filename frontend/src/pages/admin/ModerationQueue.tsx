import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Flag } from 'lucide-react';

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
        <p className="text-center text-red-600 dark:text-red-400 py-8">Failed to load flagged posts ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }
  if (data?.unavailable) {
    return (
      <Card><p className="text-center text-[#5C635D] dark:text-[#b9beb4] py-8">{data.unavailable}</p></Card>
    );
  }

  const posts = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
          Moderation <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Queue</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Flagged discussion posts awaiting review</p>
      </div>
      {error && <Card><p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p></Card>}
      {posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Flag}
            title="No flagged posts"
            description="Nothing to review — the community is behaving."
          />
        </Card>
      ) : (
        <div className="space-y-3 vl-stagger">
          {posts.map((p: any) => (
            <Card key={p.id} variant="elevated" className="relative overflow-hidden">
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 to-red-700" />
              <div className="pl-2">
                <p className="text-sm text-[#1F2421] dark:text-[#ece9e2]">{p.body}</p>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1.5 flex items-center gap-2">
                  Thread: {p.thread_title}
                  <Badge variant="error">{p.open_flags ?? p.flag_count} flags</Badge>
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => moderate.mutate({ id: p.id, action: 'resolve' })} loading={moderate.isPending}>Resolve</Button>
                  <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'dismiss' })}>Dismiss</Button>
                  <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'hide' })}>Hide</Button>
                  <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: p.id, action: 'unhide' })}>Unhide</Button>
                  <Button size="sm" variant="danger" onClick={() => moderate.mutate({ id: p.id, action: 'delete' })}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
