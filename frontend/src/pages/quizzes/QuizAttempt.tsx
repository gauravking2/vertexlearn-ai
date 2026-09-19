import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStartQuizAttempt, useSubmitQuizAttempt, useQuiz } from '@/hooks/useQuizzes';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { FileQuestion, AlertCircle } from 'lucide-react';
import { recordAttempt, safePercent } from '@/utils/model';

interface AttemptQuestion {
  id: string;
  type: 'mcq' | 'multi_select' | 'short_answer';
  prompt: string;
  points: number;
  options?: { id: string; optionText: string }[];
}

export const QuizAttempt = () => {
  const { id: quizId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { mutate: startAttempt, isPending: starting, data: attemptData } = useStartQuizAttempt();
  const { mutate: submitAttempt, isPending: submitting } = useSubmitQuizAttempt();
  const { data: quiz } = useQuiz(quizId);

  const [answers, setAnswers] = useState<Record<string, { selectedOptionIds?: string[]; answerText?: string }>>({});

  // POST /quizzes/:id/attempt returns the attempt fields plus `questions`.
  const attempt: any = (attemptData as any)?.attempt ?? attemptData;
  const questions: AttemptQuestion[] = (attemptData as any)?.questions ?? [];

  const handleStart = () => {
    if (quizId) startAttempt(quizId);
  };

  const handleSelectOption = (questionId: string, optionId: string, type: string) => {
    setAnswers((prev) => {
      if (type === 'multi_select') {
        const current = prev[questionId]?.selectedOptionIds ?? [];
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [questionId]: { selectedOptionIds: next } };
      }
      return { ...prev, [questionId]: { selectedOptionIds: [optionId] } };
    });
  };

  const handleShortAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { answerText: value } }));
  };

  const handleSubmit = () => {
    if (!attempt) return;
    const formatted = Object.entries(answers).map(([questionId, value]) => ({
      questionId,
      ...value,
    }));
    submitAttempt(
      { attemptId: attempt.id, answers: formatted },
      {
        // Real server-side result page (GET /attempts/:id); the attempt is
        // also recorded to the local per-user history ledger.
        onSuccess: (data: any) => {
          const score = data.score ?? 0;
          const maxScore = data.maxScore ?? 0;
          recordAttempt(user?.id, {
            attemptId: attempt.id,
            quizId: quizId ?? '',
            quizTitle: (quiz as any)?.title ?? 'Quiz',
            score,
            maxScore,
          });
          navigate(`/quiz-attempts/${attempt.id}/result`);
        },
      }
    );
  };

  if (starting) return <LoadingSpinner text="Preparing your quiz..." />;

  if (!attempt) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Quiz
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">Start a new attempt</p>
        </div>
        <Card>
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F2E3D6] dark:bg-[#2c241c] flex items-center justify-center">
              <FileQuestion className="text-[#C4612F] dark:text-[#e8a06f]" size={30} aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-[#1F2421] dark:text-[#ece9e2] mb-2">Ready to begin?</h3>
            <p className="text-[#5C635D] dark:text-[#b9beb4] mb-4">Once started, answer all questions and submit.</p>
            <Button onClick={handleStart}>Start attempt</Button>
          </div>
        </Card>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter(
    (a) => (a.selectedOptionIds && a.selectedOptionIds.length > 0) || (a.answerText && a.answerText.trim() !== '')
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2]">Quiz attempt</h1>
        <Badge variant="neutral">
          {questions.length} question{questions.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Answer progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#FBF9F5] dark:bg-[#23261f] rounded-full overflow-hidden ring-1 ring-inset ring-[#E7E1D7]/60 dark:ring-[#2c2f2a]">
          <div
            className="h-full bg-gradient-to-r from-[#C4612F] to-[#A94E22] rounded-full transition-all duration-300"
            style={{ width: `${safePercent(questions.length > 0 ? (answeredCount / questions.length) * 100 : 0)}%` }}
          />
        </div>
        <span className="text-xs text-[#5C635D] dark:text-[#b9beb4] tabular-nums shrink-0">
          {answeredCount} / {questions.length} answered
        </span>
      </div>

      {questions.length === 0 ? (
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="No questions"
            description="This quiz has no questions yet."
          />
        </Card>
      ) : (
        <div className="space-y-4 vl-stagger">
          {questions.map((q, idx) => (
            <Card key={q.id}>
              <p className="text-xs font-semibold text-[#C4612F] dark:text-[#e8a06f] uppercase tracking-wider mb-1.5">
                Question {idx + 1} · {q.points} pt{q.points !== 1 ? 's' : ''}
              </p>
              <p className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">{q.prompt}</p>
              {q.type === 'short_answer' ? (
                <textarea
                  className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all resize-none"
                  rows={3}
                  placeholder="Type your answer..."
                  aria-label={`Answer for question ${idx + 1}`}
                  value={answers[q.id]?.answerText ?? ''}
                  onChange={(e) => handleShortAnswer(q.id, e.target.value)}
                />
              ) : (
                <div className="space-y-2" role="group" aria-label={`Options for question ${idx + 1}`}>
                  {q.options?.map((opt) => {
                    const selected = (answers[q.id]?.selectedOptionIds ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectOption(q.id, opt.id, q.type)}
                        aria-pressed={selected}
                        className={`w-full text-left px-4 py-2.5 rounded-xl border transition-all ${
                          selected
                            ? 'border-[#C4612F] bg-[#F2E3D6]/60 dark:bg-[#2c241c] shadow-sm'
                            : 'border-[#E7E1D7] dark:border-[#2c2f2a] hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] hover:border-[#C4612F]/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className={`w-4.5 h-4.5 w-[18px] h-[18px] border flex items-center justify-center shrink-0 transition-colors ${
                              q.type === 'multi_select' ? 'rounded' : 'rounded-full'
                            } ${selected ? 'bg-[#C4612F] border-[#C4612F]' : 'border-[#E7E1D7] dark:border-[#2c2f2a] bg-transparent'}`}
                          >
                            {selected && (
                              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current">
                                <path d="M4.6 8.6 1.8 5.8l1-1 1.8 1.8L9.2 2l1 1z" />
                              </svg>
                            )}
                          </span>
                          <span className="text-sm text-[#1F2421] dark:text-[#ece9e2]">{opt.optionText}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} loading={submitting}>
          Submit answers
        </Button>
      </div>
    </div>
  );
};
