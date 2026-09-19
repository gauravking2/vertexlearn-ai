import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useEnrollments } from '@/hooks/useLearning';
import { quizService } from '@/services/quizService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { FileQuestion, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { validId, getAttemptLedger } from '@/utils/model';

/**
 * Student quizzes across all enrolled courses (real data only) plus your
 * recent attempt history (per-user local ledger + deep links to real
 * server-side attempt results).
 */
export const MyQuizzesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: enrollments, isLoading: loadingEnrollments, isError, error, refetch } = useEnrollments();
  const courses = (enrollments?.data ?? []).filter((e: any) => validId(e.courseId));

  const quizQueries = useQueries({
    queries: courses.map((e: any) => ({
      queryKey: ['quizzes', 'course', e.courseId],
      queryFn: () => quizService.listCourseQuizzes(e.courseId),
      staleTime: 60 * 1000,
    })),
  });

  const loadingLists = quizQueries.some((q) => q.isLoading);
  const listError = quizQueries.find((q) => q.isError)?.error;

  if (loadingEnrollments || loadingLists) return <LoadingSpinner text="Loading quizzes..." />;

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }

  const rows = courses.flatMap((e: any, i: number) => {
    const list = (quizQueries[i]?.data as any)?.data ?? [];
    return list.filter((q: any) => validId(q.id)).map((q: any) => ({ ...q, courseTitle: e.courseTitle, courseId: e.courseId }));
  });
  const history = getAttemptLedger(user?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          My <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Quizzes</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Test your knowledge across your courses</p>
      </div>

      {listError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">{getApiErrorMessage(listError)}</p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="No quizzes available yet"
            description={courses.length === 0 ? 'Enroll in a course to see its quizzes here.' : 'Quizzes will appear here once your instructor publishes them.'}
            actionLabel={courses.length === 0 ? 'Browse Courses' : undefined}
            onAction={courses.length === 0 ? () => navigate('/courses') : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 vl-stagger">
          {rows.map((quiz: any) => (
            <Card key={quiz.id}>
              <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-1">{quiz.courseTitle}</p>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-[#F2E3D6] dark:bg-[#2c241c] flex items-center justify-center shrink-0" aria-hidden="true">
                    <FileQuestion className="text-[#C4612F] dark:text-[#e8a06f]" size={18} />
                  </span>
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] truncate">{quiz.title}</h3>
                </div>
                {quiz.isAiGenerated && <Badge variant="primary">AI</Badge>}
              </div>
              {quiz.description && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-2 line-clamp-2">{quiz.description}</p>}
              <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-3">{quiz.questionCount ?? 0} questions</p>
              <Button as={Link} to={`/quizzes/${quiz.id}/attempt`} fullWidth>
                Start quiz
              </Button>
            </Card>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <Card>
          <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3 flex items-center gap-2">
            <History size={18} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
            Recent attempts
          </h2>
          <ul className="space-y-1">
            {history.slice(0, 10).map((h) => (
              <li key={h.attemptId} className="flex items-center justify-between gap-2 text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] transition-colors">
                <span className="text-[#1F2421] dark:text-[#ece9e2] truncate">{h.quizTitle}</span>
                <span className="text-[#5C635D] dark:text-[#b9beb4] shrink-0 tabular-nums">
                  {h.score} / {h.maxScore} •{' '}
                  <Link to={`/quiz-attempts/${h.attemptId}/result`} className="text-[#C4612F] dark:text-[#e8a06f] hover:underline">
                    View result
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};
