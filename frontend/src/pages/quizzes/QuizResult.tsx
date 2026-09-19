import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { quizService } from '@/services/quizService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Award, CheckCircle2, XCircle } from 'lucide-react';
import { getApiErrorMessage } from '@/components/common/apiError';

/** Real server-side attempt result (GET /attempts/:id, owner-enforced). */
export const QuizResult = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['attemptResult', id],
    queryFn: () => quizService.getAttemptById(id!),
    enabled: !!id,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!id) {
    return (
      <Card>
        <EmptyState icon={Award} title="No attempt selected" description="Start a quiz to see your result here." />
      </Card>
    );
  }

  if (isLoading) return <LoadingSpinner text="Loading result..." />;

  if (isError || !data) {
    return (
      <Card>
        <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          <Button size="sm" variant="ghost" as={Link} to="/quizzes">My quizzes</Button>
        </div>
      </Card>
    );
  }

  const score = data.score ?? 0;
  const max = data.maxScore ?? 0;
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Quiz Result
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">{data.quizTitle}</p>
      </div>

      <Card>
        <div className="text-center py-8">
          <div className="relative inline-flex items-center justify-center mb-4">
            <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.14),transparent_70%)]" />
            <CheckCircle2 className="relative text-green-600 dark:text-green-400" size={48} aria-hidden="true" />
          </div>
          <p className="text-3xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">
            {score} / {max}
          </p>
          <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">{pct}% • {data.status}</p>
          <div className="max-w-xs mx-auto mt-4 h-2 bg-[#FBF9F5] dark:bg-[#23261f] rounded-full overflow-hidden ring-1 ring-inset ring-[#E7E1D7]/60 dark:ring-[#2c2f2a]">
            <div
              className="h-full bg-gradient-to-r from-[#10B981] to-[#059669] rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          {data.submittedAt && (
            <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-3">Submitted {new Date(data.submittedAt).toLocaleString()}</p>
          )}
        </div>
      </Card>

      {data.answers.length > 0 && (
        <Card>
          <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3">Your answers</h2>
          <ul className="space-y-3">
            {data.answers.map((a: any, i: number) => (
              <li key={a.question_id ?? i} className="border-b border-[#E7E1D7] dark:border-[#2c2f2a] last:border-b-0 pb-3 last:pb-0">
                <p className="font-medium text-[#1F2421] dark:text-[#ece9e2] text-sm mb-1">{a.prompt}</p>
                {a.answer_text ? (
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Your answer: {a.answer_text}</p>
                ) : (
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
                    {Array.isArray(a.selected_option_ids) ? `${a.selected_option_ids.length} option(s) selected` : 'No answer'}
                  </p>
                )}
                <p className={`text-xs mt-1 flex items-center gap-1 ${a.is_correct ? 'text-green-700 dark:text-green-400' : 'text-[#5C635D] dark:text-[#b9beb4]'}`}>
                  {a.is_correct ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                  {a.is_correct ? 'Correct' : 'Needs review'} • {a.points_earned ?? 0} pts
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-2">
        {data.courseId && (
          <Button variant="outline" as={Link} to={`/courses/${data.courseId}`}>
            Back to course
          </Button>
        )}
        <Button variant="ghost" as={Link} to="/quizzes">My quizzes</Button>
      </div>
    </div>
  );
};
