import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAssignmentSubmissions, useGradeSubmission } from '@/hooks/useAssignments';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Input } from '@/components/common/Input';
import { getApiErrorMessage } from '@/components/common/apiError';
import { CheckSquare, ArrowLeft } from 'lucide-react';

export const SubmissionReview = () => {
  const { id: assignmentId } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useAssignmentSubmissions(assignmentId);
  const { mutate: grade, isPending, isError: gradeFailed, error: gradeError } = useGradeSubmission();

  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [formError, setFormError] = useState('');

  const submissions = data?.data ?? [];

  const handleGrade = (submissionId: string, maxScore?: number) => {
    const entry = grades[submissionId];
    if (!entry || entry.grade.trim() === '') {
      setFormError('Enter a numeric grade first.');
      return;
    }
    const gradeValue = Number(entry.grade);
    if (!Number.isInteger(gradeValue) || gradeValue < 0) {
      setFormError('Grade must be a whole number (0 or more).');
      return;
    }
    if (maxScore !== undefined && gradeValue > maxScore) {
      setFormError(`Grade exceeds max score of ${maxScore}.`);
      return;
    }
    setFormError('');
    grade(
      { submissionId, data: { grade: gradeValue, feedback: entry.feedback } },
      { onSuccess: () => refetch() }
    );
  };

  if (isLoading) return <LoadingSpinner text="Loading submissions..." />;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} /> Back to courses
      </Button>
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          Submission <span className="italic text-[#C4612F]">Review</span>
        </h1>
        <p className="text-[#5C635D]">Grade submissions for assignment {assignmentId}</p>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {!isError && submissions.length === 0 && (
        <Card>
          <EmptyState
            icon={CheckSquare}
            title="No submissions yet"
            description="Once students submit, they will appear here. Grading uses the real submission endpoint."
          />
        </Card>
      )}

      {gradeFailed && (
        <Card><p className="text-sm text-red-700">{getApiErrorMessage(gradeError)}</p></Card>
      )}
      {formError && (
        <Card><p className="text-sm text-red-700">{formError}</p></Card>
      )}

      {!isError && submissions.length > 0 && (
        <div className="space-y-3">
          {submissions.map((s: any) => (
            <Card key={s.id}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-medium text-[#1F2421]">
                    {s.student_name ?? s.student_email ?? `Student ${String(s.student_id).slice(0, 8)}…`}
                  </p>
                  <p className="text-xs text-[#5C635D]">{s.student_email}</p>
                  <p className="text-sm text-[#5C635D]">Submitted: {new Date(s.submitted_at).toLocaleString()}</p>
                  {s.content_text && <p className="text-sm text-[#1F2421] mt-2 bg-[#FBF9F5] rounded p-2 line-clamp-4">{s.content_text}</p>}
                  {s.grade != null
                    ? <p className="text-sm text-[#A94E22] dark:text-[#e8a06f] mt-1">Grade: {s.grade}{s.feedback ? ` — ${s.feedback}` : ''}</p>
                    : <p className="text-sm text-[#5C635D] mt-1">Not graded yet</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Grade"
                    className="w-24"
                    value={grades[s.id]?.grade ?? ''}
                    onChange={(e) =>
                      setGrades((prev) => ({
                        ...prev,
                        [s.id]: { ...prev[s.id], grade: e.target.value, feedback: prev[s.id]?.feedback ?? '' },
                      }))
                    }
                  />
                  <Input
                    placeholder="Feedback"
                    className="w-48"
                    value={grades[s.id]?.feedback ?? ''}
                    onChange={(e) =>
                      setGrades((prev) => ({
                        ...prev,
                        [s.id]: { ...prev[s.id], feedback: e.target.value, grade: prev[s.id]?.grade ?? '' },
                      }))
                    }
                  />
                  <Button size="sm" onClick={() => handleGrade(s.id)} loading={isPending}>
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
