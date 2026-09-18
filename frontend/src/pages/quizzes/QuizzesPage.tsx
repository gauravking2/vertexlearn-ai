import { useParams, Link } from 'react-router-dom';
import { useCourseQuizzes } from '@/hooks/useQuizzes';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { FileQuestion } from 'lucide-react';

export const QuizzesPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { data, isLoading, isError, error, refetch } = useCourseQuizzes(courseId);

  if (isLoading) return <LoadingSpinner text="Loading quizzes..." />;

  const quizzes = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Quizzes
          </h1>
          <p className="text-[#5C635D]">Test your knowledge for this course</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to={`/courses/${courseId}`}>
          Back to course
        </Button>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {!isError && quizzes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((quiz: any) => (
            <Card key={quiz.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileQuestion className="text-[#C4612F]" size={20} />
                  <h3 className="font-medium text-[#1F2421]">{quiz.title}</h3>
                </div>
                {quiz.isAiGenerated && <Badge variant="primary">AI</Badge>}
              </div>
              {quiz.description && <p className="text-sm text-[#5C635D] mb-3 line-clamp-2">{quiz.description}</p>}
              <p className="text-xs text-[#5C635D] mb-3">{quiz.questionCount ?? 0} questions</p>
              <Button as={Link} to={`/quizzes/${quiz.id}/attempt`} fullWidth>
                Start quiz
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        !isError && (
          <Card>
            <EmptyState
              icon={FileQuestion}
              title="No quizzes available yet"
              description="Quizzes will appear here once your instructor publishes them."
            />
          </Card>
        )
      )}
    </div>
  );
};
