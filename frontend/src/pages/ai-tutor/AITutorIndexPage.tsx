import { Link, useNavigate } from 'react-router-dom';
import { useEnrollments } from '@/hooks/useLearning';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Bot } from 'lucide-react';
import { validId, categoryCover, categoryInitial } from '@/utils/model';

/**
 * AI Tutor entry point: the tutor is course-scoped, so this page lists your
 * enrolled courses as tutoring entry points (real enrollments only).
 */
export const AITutorIndexPage = () => {
  const navigate = useNavigate();
  const { data: enrollments, isLoading, isError, refetch } = useEnrollments();
  const courses = (enrollments?.data ?? []).filter((e: any) => validId(e.courseId));

  if (isLoading) return <LoadingSpinner text="Loading your courses..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          AI <span className="italic text-[#C4612F]">Tutor</span>
        </h1>
        <p className="text-[#5C635D]">Choose a course — answers come only from that course's material, with citations.</p>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 mb-2" role="alert">Unable to load your courses. Try again.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No courses yet"
            description="Enroll in a course to start a grounded tutoring session."
            actionLabel="Browse Courses"
            onAction={() => navigate('/courses')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((e: any) => (
            <Card key={e.courseId} hover>
              <Link to={`/ai-tutor/${e.courseId}`} className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-xl font-serif text-white"
                  style={{ background: categoryCover(e.courseTitle) }}
                  aria-hidden="true"
                >
                  {categoryInitial(e.courseTitle)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-[#1F2421] truncate">{e.courseTitle}</h3>
                  <p className="text-sm text-[#C4612F] font-medium mt-0.5">Start tutoring session →</p>
                </div>
                <Bot size={20} className="text-[#5C635D] shrink-0" aria-hidden="true" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
