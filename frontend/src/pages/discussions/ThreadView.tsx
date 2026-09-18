import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionService } from '@/services/discussionService';
import { authStore } from '@/store/authStore';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const ThreadView = () => {
  const { courseId, threadId } = useParams<{ courseId: string; threadId: string }>();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = authStore();
  const canModerate = user?.roles.includes('instructor') || user?.roles.includes('admin');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => discussionService.getThread(threadId!),
    enabled: !!threadId,
  });

  const postReply = useMutation({
    mutationFn: () => discussionService.reply(threadId!, { body: reply }),
    onSuccess: () => {
      setReply('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Reply failed'),
  });

  const flag = useMutation({
    mutationFn: (postId: string) => discussionService.flagPost(postId, 'Inappropriate content'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', threadId] }),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Flag failed'),
  });

  const moderate = useMutation({
    mutationFn: ({ postId, action }: { postId: string; action: 'hide' | 'unhide' | 'delete' }) =>
      action === 'delete' ? discussionService.deletePost(postId) : discussionService.moderatePost(postId, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', threadId] }),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Moderation failed'),
  });

  if (isLoading) return <LoadingSpinner text="Loading thread..." />;
  if (isError || !data) {
    return (
      <Card><p className="text-center text-red-600 py-8">Thread unavailable. Enrollment may be required.</p></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Link to={`/courses/${courseId}/discussions`} className="text-sm text-[#A94E22] dark:text-[#e8a06f] hover:underline">← Back to discussions</Link>
      <h1 className="text-2xl font-serif text-[#1F2421]">{data.thread.title}</h1>
      {error && <Card><p className="text-sm text-red-600" role="alert">{error}</p></Card>}
      {(data.posts ?? []).map((p) => (
        <Card key={p.id}>
          <p className="text-sm text-[#1F2421]">{p.body}</p>
          <p className="text-xs text-[#5C635D] mt-1">By {p.author_name ?? p.author_id}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => flag.mutate(p.id)}>Report</Button>
            {canModerate && (
              <>
                <Button size="sm" variant="outline" onClick={() => moderate.mutate({ postId: p.id, action: 'hide' })}>Hide</Button>
                <Button size="sm" variant="outline" onClick={() => moderate.mutate({ postId: p.id, action: 'unhide' })}>Unhide</Button>
                <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ postId: p.id, action: 'delete' })}>Delete</Button>
              </>
            )}
          </div>
        </Card>
      ))}
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-2">Reply</h3>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          aria-label="Reply body"
          className="w-full border border-[#E7E1D7] rounded-lg px-3 py-2 text-sm mb-2"
          rows={3}
        />
        <Button size="sm" disabled={!reply.trim()} onClick={() => postReply.mutate()}>Post reply</Button>
      </Card>
    </div>
  );
};
