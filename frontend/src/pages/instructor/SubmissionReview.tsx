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
        <ArrowLeft size={16} aria-hidden="true" /> Back to courses
      </Button>
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Submission <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Review</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Grade submissions for assignment {assignmentId}</p>
      </div>

      {isError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2">{getApiErrorMessage(error)}</p>
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
        <Card><p className="text-sm text-red-700 dark:text-red-400">{getApiErrorMessage(gradeError)}</p></Card>
      )}
      {formError && (
        <Card><p className="text-sm text-red-700 dark:text-red-400">{formError}</p></Card>
      )}

      {!isError && submissions.length > 0 && (
        <div className="space-y-3 vl-stagger">
          {submissions.map((s: any) => (
            <Card key={s.id} variant="elevated">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span
                      className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F2E3D6] to-[#EAD3BE] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center text-sm font-semibold text-[#8A3E1C] dark:text-[#e8a06f] shrink-0"
                      aria-hidden="true"
                    >
                      {(s.studentName ?? s.studentEmail ?? 'S').charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium text-[#1F2421] dark:text-[#ece9e2]">
                        {s.studentName ?? s.studentEmail ?? `Student ${String(s.studentId ?? s.id).slice(0, 8)}…`}
                      </p>
                      <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{s.studentEmail}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">
                    Submitted: {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
                  </p>
                  {s.contentText && (
                    <p className="text-sm text-[#1F2421] dark:text-[#ece9e2] mt-2 bg-[#FBF9F5] dark:bg-[#23261f] rounded-xl p-3 ring-1 ring-inset ring-[#E7E1D7]/60 dark:ring-[#2c2f2a] line-clamp-4">
                      {s.contentText}
                    </p>
                  )}
                  {s.grade != null ? (
                    <p className="text-sm text-[#A94E22] dark:text-[#e8a06f] mt-2 font-medium">
                      Grade: {s.grade}{s.feedback ? ` — ${s.feedback}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mt-2">Not graded yet</p>
                  )}
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[7rem_minmax(12rem,1fr)_auto] md:w-auto md:min-w-[24rem]">
                  <Input
                    type="number"
                    placeholder="Grade"
                    aria-label={`Grade for ${s.studentName ?? s.studentEmail ?? s.id}`}
                    className="w-full"
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
                    aria-label={`Feedback for ${s.studentName ?? s.studentEmail ?? s.id}`}
                    className="w-full"
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
