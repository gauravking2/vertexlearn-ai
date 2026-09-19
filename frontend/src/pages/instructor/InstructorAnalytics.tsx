import { useParams, Link } from 'react-router-dom';
import { useCourseAnalytics } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiErrorMessage } from '@/components/common/apiError';
import { BarChart3, ArrowLeft } from 'lucide-react';
import type { CourseAnalytics } from '@/types';

/**
 * Real instructor analytics page backed by GET /api/v1/courses/:id/analytics.
 * Renders only what the backend returns:
 * - per-lecture enrolled/completed/drop-off + avg watched seconds
 * - quiz avg score / attempts
 * - time-on-task totals + active students
 */
export const InstructorAnalytics = () => {
  const { id: courseId } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useCourseAnalytics(courseId);

  if (isLoading) return <LoadingSpinner text="Loading analytics..." />;

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </Button>
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Analytics unavailable"
            description={getApiErrorMessage(error)}
          />
          <div className="flex justify-center">
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  const analytics = data as CourseAnalytics;
  const perLecture = analytics?.perLecture ?? [];
  const quizzes = analytics?.quizzes ?? [];
  const timeOnTask = analytics?.timeOnTask;

  const isEmpty = perLecture.length === 0 && quizzes.length === 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} aria-hidden="true" /> Back to courses
      </Button>
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Analytics</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Lecture progress and drop-off, quiz averages, and time on task.</p>
      </div>

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No analytics data yet"
            description="Enrollments, lecture progress, and quiz attempts will populate this dashboard."
          />
        </Card>
      ) : (
        <>
          {timeOnTask && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card variant="elevated" className="relative overflow-hidden">
                <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
                <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Total watched</p>
                <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">
                  {Math.round(timeOnTask.total_watched_seconds / 60)} min
                </p>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{timeOnTask.total_watched_seconds}s total</p>
              </Card>
              <Card variant="elevated" className="relative overflow-hidden">
                <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
                <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Active students</p>
                <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{timeOnTask.active_students}</p>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">with recorded watch time</p>
              </Card>
            </div>
          )}

          <Card variant="elevated">
            <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">Lecture progress / drop-off</h3>
            {perLecture.length === 0 ? (
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">No lectures in this course yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#5C635D] dark:text-[#b9beb4] border-b border-[#E7E1D7] dark:border-[#2c2f2a]">
                      <th className="py-2 pr-3 font-medium">Lecture</th>
                      <th className="py-2 pr-3 font-medium">Enrolled</th>
                      <th className="py-2 pr-3 font-medium">Completed</th>
                      <th className="py-2 pr-3 font-medium">Drop-off</th>
                      <th className="py-2 font-medium">Avg watched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perLecture.map((l) => (
                      <tr key={l.lectureId} className="border-b border-[#F2E3D6] dark:border-[#2c241c] last:border-0">
                        <td className="py-2.5 pr-3 text-[#1F2421] dark:text-[#ece9e2]">{l.title}</td>
                        <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{l.enrolled}</td>
                        <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{l.completed}</td>
                        <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{(l.dropOffRate * 100).toFixed(0)}%</td>
                        <td className="py-2.5 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{Math.round(l.avgWatchedSeconds)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card variant="elevated">
            <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">Quiz averages</h3>
            {quizzes.length === 0 ? (
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">No quizzes in this course yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#5C635D] dark:text-[#b9beb4] border-b border-[#E7E1D7] dark:border-[#2c2f2a]">
                      <th className="py-2 pr-3 font-medium">Quiz</th>
                      <th className="py-2 pr-3 font-medium">Attempts</th>
                      <th className="py-2 pr-3 font-medium">Avg score</th>
                      <th className="py-2 font-medium">Avg max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.map((q) => (
                      <tr key={q.quiz_id} className="border-b border-[#F2E3D6] dark:border-[#2c241c] last:border-0">
                        <td className="py-2.5 pr-3 text-[#1F2421] dark:text-[#ece9e2]">{q.title}</td>
                        <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{q.attempts}</td>
                        <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{Number(q.avg_score).toFixed(1)}</td>
                        <td className="py-2.5 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{Number(q.avg_max_score).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
