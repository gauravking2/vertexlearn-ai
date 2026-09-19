import { Link } from 'react-router-dom';
import { useInstructorCourses } from '@/hooks/useCourses';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiErrorMessage } from '@/components/common/apiError';
import { BookMarked } from 'lucide-react';

/**
 * Shared course picker for instructor index surfaces (assignments, quizzes,
 * analytics, announcements). Lists the instructor's real courses and links
 * each one into its per-course management surface — no dead buttons.
 */
export const InstructorCoursePicker = ({
  title,
  description,
  linkTo,
  linkLabel,
}: {
  title: string;
  description: string;
  linkTo: (courseId: string) => string;
  linkLabel: string;
}) => {
  const { data, isLoading, isError, error, refetch } = useInstructorCourses();
  const { user } = useAuth();

  if (isLoading) return <LoadingSpinner text={`Loading ${title.toLowerCase()}...`} />;

  const all = (data?.data ?? data?.courses ?? []).filter((c: any) => c?.id);
  const isAdmin = user?.roles?.includes('admin');
  const courses = isAdmin ? all : all.filter((c: any) => (c.instructorId ?? c.instructor_id) === user?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          {title}
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">{description}</p>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {!isError && courses.length === 0 && (
        <Card>
          <EmptyState
            icon={BookMarked}
            title="No courses yet"
            description="Create a course first, then manage it here."
          />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 vl-stagger">
        {courses.map((c: any) => (
          <Card key={c.id} hover className="relative overflow-hidden">
            <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C4612F] to-[#A94E22]" />
            <div className="flex items-center justify-between gap-3 pl-2">
              <div className="min-w-0">
                <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] truncate">{c.title}</h3>
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] capitalize">{c.status ?? 'draft'}</p>
              </div>
              <Button size="sm" variant="outline" as={Link} to={linkTo(c.id)}>
                {linkLabel}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
