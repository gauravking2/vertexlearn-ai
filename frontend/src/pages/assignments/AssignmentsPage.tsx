import { useParams, Link } from 'react-router-dom';
import { useCourseAssignments } from '@/hooks/useAssignments';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { ClipboardList, Clock } from 'lucide-react';

export const AssignmentsPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { data, isLoading, isError, error, refetch } = useCourseAssignments(courseId);

  if (isLoading) return <LoadingSpinner text="Loading assignments..." />;

  const assignments = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Assignments
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">View and submit your assignments</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to={`/courses/${courseId}`}>
          Back to course
        </Button>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {!isError && assignments.length > 0 ? (
        <div className="space-y-4 vl-stagger">
          {assignments.map((a: any) => {
            const dueAt = a.due_at ?? a.dueAt;
            return (
              <Card key={a.id} className="relative overflow-hidden">
                <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C4612F] to-[#A94E22]" />
                <div className="flex items-start justify-between mb-2 pl-2">
                  <div>
                    <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{a.title}</h3>
                    {dueAt && (
                      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] flex items-center gap-1 mt-1">
                        <Clock size={14} aria-hidden="true" /> Due {new Date(dueAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Badge variant="neutral">Max {a.max_score ?? a.maxScore ?? 100}</Badge>
                </div>
                {(a.description) && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3 line-clamp-2 pl-2">{a.description}</p>}
                <div className="pl-2">
                  <Button as={Link} to={`/assignments/${a.id}`} variant="outline" size="sm">
                    View details
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        !isError && (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="No assignments yet"
              description="Assignments will appear here once your instructor posts them."
            />
          </Card>
        )
      )}
    </div>
  );
};
