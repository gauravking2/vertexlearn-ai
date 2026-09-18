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
import { recordAttempt } from '@/utils/model';

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
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Quiz
          </h1>
          <p className="text-[#5C635D]">Start a new attempt</p>
        </div>
        <Card>
          <div className="text-center py-8">
            <FileQuestion className="mx-auto text-[#C4612F] mb-4" size={48} />
            <h3 className="text-lg font-medium text-[#1F2421] mb-2">Ready to begin?</h3>
            <p className="text-[#5C635D] mb-4">Once started, answer all questions and submit.</p>
            <Button onClick={handleStart}>Start attempt</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif text-[#1F2421]">Quiz attempt</h1>
        <Badge variant="neutral">
          {questions.length} question{questions.length !== 1 ? 's' : ''}
        </Badge>
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
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <Card key={q.id}>
              <p className="text-sm text-[#5C635D] mb-1">Question {idx + 1}</p>
              <p className="font-medium text-[#1F2421] mb-3">{q.prompt}</p>
              {q.type === 'short_answer' ? (
                <textarea
                  className="w-full px-4 py-2.5 border border-[#E7E1D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C4612F]"
                  rows={3}
                  placeholder="Type your answer..."
                  value={answers[q.id]?.answerText ?? ''}
                  onChange={(e) => handleShortAnswer(q.id, e.target.value)}
                />
              ) : (
                <div className="space-y-2">
                  {q.options?.map((opt) => {
                    const selected = (answers[q.id]?.selectedOptionIds ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectOption(q.id, opt.id, q.type)}
                        className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors ${
                          selected
                            ? 'border-[#C4612F] bg-[#F2E3D6]'
                            : 'border-[#E7E1D7] hover:bg-[#FBF9F5]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 border ${
                              q.type === 'multi_select' ? 'rounded' : 'rounded-full'
                            } ${selected ? 'bg-[#C4612F] border-[#C4612F]' : 'border-[#E7E1D7]'}`}
                          />
                          <span className="text-sm text-[#1F2421]">{opt.optionText}</span>
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
