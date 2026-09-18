import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionService } from '@/services/discussionService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const CourseDiscussions = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
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
        <p className="text-center text-red-600 py-8">Discussions unavailable. Enrollment may be required.</p>
        <div className="text-center"><Button as={Link} to={`/courses/${courseId}`} variant="outline">Back to course</Button></div>
      </Card>
    );
  }

  const threads = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-serif text-[#1F2421]">Course <span className="italic text-[#C4612F]">Discussions</span></h1>
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-2">Start a thread</h3>
        {error && <p className="text-sm text-red-600 mb-2" role="alert">{error}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title (min 3 chars)"
          aria-label="Thread title"
          className="w-full border border-[#E7E1D7] rounded-lg px-3 py-2 text-sm mb-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want to discuss?"
          aria-label="Thread body"
          className="w-full border border-[#E7E1D7] rounded-lg px-3 py-2 text-sm mb-2"
          rows={3}
        />
        <Button size="sm" disabled={!title.trim() || !body.trim()} onClick={() => create.mutate()}>Create thread</Button>
      </Card>

      {threads.length === 0 ? (
        <Card><p className="text-center text-[#5C635D] py-8">No threads yet. Start the first discussion!</p></Card>
      ) : (
        threads.map((t) => (
          <Card key={t.id} hover>
            <Link to={`/courses/${courseId}/discussions/${t.id}`}>
              <h3 className="font-medium text-[#1F2421] hover:text-[#C4612F]">{t.title}</h3>
              <p className="text-xs text-[#5C635D]">By {t.author_name ?? t.author_id} • {t.post_count ?? 0} posts</p>
            </Link>
          </Card>
        ))
      )}
    </div>
  );
};
