import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionService } from '@/services/discussionService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiErrorMessage } from '@/components/common/apiError';
import { MessagesSquare, MessageCircle, ArrowRight } from 'lucide-react';

export const CourseDiscussions = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['threads', courseId],
    queryFn: () => discussionService.listThreads(courseId!),
    enabled: !!courseId,
  });

  const create = useMutation({
    mutationFn: () => discussionService.createThread(courseId!, { title, body }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['threads', courseId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to create thread'),
  });

  if (!courseId) return <Card><p>Missing course id.</p></Card>;
  if (isLoading) return <LoadingSpinner text="Loading discussions..." />;
  if (isError) {
    return (
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">{getApiErrorMessage(queryError) ?? 'Discussions unavailable. Enrollment may be required.'}</p>
        <div className="text-center"><Button as={Link} to={`/courses/${courseId}`} variant="outline">Back to course</Button></div>
      </Card>
    );
  }

  const threads = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
          Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Discussions</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Ask questions and share insights with your classmates</p>
      </div>

      <Card>
        <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3 flex items-center gap-2">
          <MessagesSquare size={18} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
          Start a thread
        </h3>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2" role="alert">{error}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title (min 3 chars)"
          aria-label="Thread title"
          className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want to discuss?"
          aria-label="Thread body"
          className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-3 resize-none"
          rows={3}
        />
        <Button size="sm" disabled={!title.trim() || !body.trim()} onClick={() => create.mutate()} loading={create.isPending}>
          Create thread
        </Button>
      </Card>

      {threads.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessagesSquare}
            title="No threads yet"
            description="Start the first discussion — your classmates and instructor will see it here."
          />
        </Card>
      ) : (
        <div className="space-y-3 vl-stagger">
          {threads.map((t) => (
            <Card key={t.id} hover>
              <Link to={`/courses/${courseId}/discussions/${t.id}`} className="flex items-center gap-3.5">
                <span
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F2E3D6] to-[#EAD3BE] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center text-sm font-semibold text-[#8A3E1C] dark:text-[#e8a06f] shrink-0"
                  aria-hidden="true"
                >
                  {(t.author_name ?? t.author_id ?? '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] group-hover:text-[#C4612F] dark:group-hover:text-[#e8a06f] transition-colors truncate">
                    {t.title}
                  </h3>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] flex items-center gap-1.5 mt-0.5">
                    <MessageCircle size={12} aria-hidden="true" />
                    {t.post_count ?? 0} posts · By {t.author_name ?? t.author_id}
                  </p>
                </div>
                <ArrowRight size={16} className="text-[#C4612F] dark:text-[#e8a06f] shrink-0" aria-hidden="true" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
