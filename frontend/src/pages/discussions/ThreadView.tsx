import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionService } from '@/services/discussionService';
import { authStore } from '@/store/authStore';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Flag, EyeOff, Eye, Trash2, Reply } from 'lucide-react';

export const ThreadView = () => {
  const { courseId, threadId } = useParams<{ courseId: string; threadId: string }>();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = authStore();
  const canModerate = user?.roles.includes('instructor') || user?.roles.includes('admin');

  const { data, isLoading, isError, error: queryError } = useQuery({
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
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">{getApiErrorMessage(queryError) ?? 'Thread unavailable. Enrollment may be required.'}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to={`/courses/${courseId}/discussions`} className="text-sm text-[#A94E22] dark:text-[#e8a06f] hover:underline inline-flex items-center gap-1">
        ← Back to discussions
      </Link>
      <h1 className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2]">{data.thread.title}</h1>
      {error && (
        <Card><p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p></Card>
      )}
      {(data.posts ?? []).map((p) => (
        <Card key={p.id}>
          <div className="flex gap-3.5">
            <span
              className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F2E3D6] to-[#EAD3BE] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center text-sm font-semibold text-[#8A3E1C] dark:text-[#e8a06f] shrink-0"
              aria-hidden="true"
            >
              {(p.author_name ?? p.author_id ?? '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-1.5">
                <span className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{p.author_name ?? p.author_id}</span>
              </p>
              <p className="text-sm text-[#1F2421] dark:text-[#ece9e2] leading-relaxed">{p.body}</p>
              <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-[#E7E1D7]/70 dark:border-[#2c2f2a]">
                <Button size="sm" variant="ghost" onClick={() => flag.mutate(p.id)} loading={flag.isPending}>
                  <Flag size={13} aria-hidden="true" /> Report
                </Button>
                {canModerate && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => moderate.mutate({ postId: p.id, action: 'hide' })}>
                      <EyeOff size={13} aria-hidden="true" /> Hide
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => moderate.mutate({ postId: p.id, action: 'unhide' })}>
                      <Eye size={13} aria-hidden="true" /> Unhide
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ postId: p.id, action: 'delete' })}>
                      <Trash2 size={13} aria-hidden="true" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Card>
        <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-2 flex items-center gap-2">
          <Reply size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
          Reply
        </h3>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          aria-label="Reply body"
          className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-3 resize-none"
          rows={3}
        />
        <Button size="sm" disabled={!reply.trim()} onClick={() => postReply.mutate()} loading={postReply.isPending}>
          Post reply
        </Button>
      </Card>
    </div>
  );
};
