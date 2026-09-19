import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useEnrollments } from '@/hooks/useLearning';
import { useMySubmission } from '@/hooks/useAssignments';
import { assignmentService } from '@/services/assignmentService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { ClipboardList, Clock } from 'lucide-react';
import { validId } from '@/utils/model';

/**
 * Student assignments across all enrolled courses (real data only).
 * Submission status is resolved per assignment via my-submission (404 =
 * not submitted, handled as data — not an error).
 */
export const MyAssignmentsPage = () => {
  const navigate = useNavigate();
  const { data: enrollments, isLoading: loadingEnrollments, isError, error, refetch } = useEnrollments();
  const courses = (enrollments?.data ?? []).filter((e: any) => validId(e.courseId));

  const assignmentQueries = useQueries({
    queries: courses.map((e: any) => ({
      queryKey: ['assignments', 'course', e.courseId],
      queryFn: () => assignmentService.listCourseAssignments(e.courseId),
      staleTime: 60 * 1000,
    })),
  });

  const loadingLists = assignmentQueries.some((q) => q.isLoading);
  const listError = assignmentQueries.find((q) => q.isError)?.error;

  if (loadingEnrollments || loadingLists) return <LoadingSpinner text="Loading assignments..." />;

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }

  const rows = courses.flatMap((e: any, i: number) => {
    const list = (assignmentQueries[i]?.data as any)?.data ?? [];
    return list.filter((a: any) => validId(a.id)).map((a: any) => ({ ...a, courseTitle: e.courseTitle, courseId: e.courseId }));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          My <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Assignments</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Everything due across your enrolled courses</p>
      </div>

      {listError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">{getApiErrorMessage(listError)}</p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description={courses.length === 0 ? 'Enroll in a course to see its assignments here.' : 'Your instructors have not posted any assignments yet.'}
            actionLabel={courses.length === 0 ? 'Browse Courses' : undefined}
            onAction={courses.length === 0 ? () => navigate('/courses') : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4 vl-stagger">
          {rows.map((a: any) => {
            const overdue = a.dueAt && new Date(a.dueAt) < new Date();
            return (
              <Card key={a.id} className="relative overflow-hidden">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-0 bottom-0 w-1 ${overdue ? 'bg-gradient-to-b from-red-500 to-red-700' : 'bg-gradient-to-b from-[#C4612F] to-[#A94E22]'}`}
                />
                <div className="flex items-start justify-between gap-3 mb-2 pl-2">
                  <div className="min-w-0">
                    <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-0.5">{a.courseTitle}</p>
                    <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{a.title}</h3>
                    {a.dueAt && (
                      <p className={`text-sm flex items-center gap-1 mt-1 ${overdue ? 'text-red-700 dark:text-red-400 font-medium' : 'text-[#5C635D] dark:text-[#b9beb4]'}`}>
                        <Clock size={14} aria-hidden="true" /> Due {new Date(a.dueAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="neutral">Max {a.maxScore ?? 100}</Badge>
                    {overdue && <Badge variant="error">Overdue</Badge>}
                  </div>
                </div>
                {a.description && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3 line-clamp-2 pl-2">{a.description}</p>}
                <div className="pl-2">
                  <AssignmentRowStatus assignmentId={a.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AssignmentRowStatus = ({ assignmentId }: { assignmentId: string }) => {
  const { data: mine, isLoading } = useMySubmissionSafe(assignmentId);
  if (isLoading) return <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Checking submission…</p>;
  if (mine) {
    return (
      <div className="flex items-center justify-between gap-2">
        <Badge variant="success">Submitted{mine.grade != null ? ` • ${mine.grade}` : ''}</Badge>
        <Button as={Link} to={`/assignments/${assignmentId}`} variant="outline" size="sm">
          View details
        </Button>
      </div>
    );
  }
  return (
    <Button as={Link} to={`/assignments/${assignmentId}`} size="sm">
      Submit now
    </Button>
  );
};

// 404 from my-submission means "not submitted" — data, not an error.
function useMySubmissionSafe(assignmentId: string) {
  const q = useMySubmission(assignmentId);
  if (q.isError && (q.error as any)?.response?.status === 404) {
    return { ...q, data: null, isError: false, error: null };
  }
  return q;
}
