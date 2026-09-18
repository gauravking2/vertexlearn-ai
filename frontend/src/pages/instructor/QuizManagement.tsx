import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCourse } from '@/hooks/useCourses';
import { useCreateQuiz, useCourseQuizzes } from '@/hooks/useQuizzes';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Input } from '@/components/common/Input';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { AiQuizGenerator } from '@/components/ai/AiQuizGenerator';
import { FileQuestion, Plus, ArrowLeft } from 'lucide-react';
import { QuizQuestionType } from '@/types';

export const QuizManagement = () => {
  const { id: courseId } = useParams<{ id: string }>();
  const { data: course, isLoading } = useCourse(courseId);
  const { data: quizList, isLoading: loadingQuizzes } = useCourseQuizzes(courseId);
  const { mutate: createQuiz, isPending } = useCreateQuiz();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Array<{
    type: QuizQuestionType;
    prompt: string;
    points: number;
    options: Array<{ text: string; isCorrect: boolean }>;
  }>>([]);

  const addQuestion = (type: QuizQuestionType) => {
    setQuestions((prev) => [
      ...prev,
      {
        type,
        prompt: '',
        points: 1,
        options: type === 'short_answer' ? [] : [{ text: '', isCorrect: true }, { text: '', isCorrect: false }],
      },
    ]);
  };

  const updateQuestion = (idx: number, field: string, value: any) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const updateOption = (qIdx: number, oIdx: number, field: string, value: any) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.map((o, oi) => (oi === oIdx ? { ...o, [field]: value } : o)) }
          : q
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !title.trim()) return;
    createQuiz(
      {
        courseId,
        title: title.trim(),
        description: description.trim(),
        questions: questions
          .filter((q) => q.prompt.trim())
          .map((q) => ({
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            options: q.type === 'short_answer' ? undefined : q.options?.filter((o) => o.text.trim()),
          })),
      },
      { onSuccess: () => { setShowForm(false); setTitle(''); setDescription(''); setQuestions([]); } }
    );
  };

  if (isLoading) return <LoadingSpinner />;

  const modules = (course as any)?.modules ?? [];
  const lectures = modules.flatMap((m: any) =>
    (m.lectures ?? []).map((l: any) => ({ id: l.id, title: `${m.title} — ${l.title}` }))
  );
  const existing = quizList?.data ?? [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" as={Link} to={`/courses/${courseId}`}>
        <ArrowLeft size={16} /> Back to course
      </Button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Quiz <span className="italic text-[#C4612F]">Management</span>
          </h1>
          <p className="text-[#5C635D]">Create quizzes for {course?.title ?? 'this course'}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> New quiz
        </Button>
      </div>

      {/* AI generation trigger: Lecture → Generate → pending_review → review page */}
      <AiQuizGenerator lectures={lectures} />

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={idx} className="border border-[#E7E1D7] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="neutral">Q{idx + 1} — {q.type}</Badge>
                  </div>
                  <Input
                    label="Prompt"
                    value={q.prompt}
                    onChange={(e) => updateQuestion(idx, 'prompt', e.target.value)}
                    required
                  />
                  {q.type !== 'short_answer' && (
                    <div className="space-y-1">
                      <p className="text-xs text-[#5C635D]">Options (mark correct):</p>
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={opt.isCorrect}
                            onChange={(e) => updateOption(idx, oIdx, 'isCorrect', e.target.checked)}
                          />
                          <input
                            value={opt.text}
                            onChange={(e) => updateOption(idx, oIdx, 'text', e.target.value)}
                            placeholder={`Option ${oIdx + 1}`}
                            className="flex-1 px-3 py-1.5 border border-[#E7E1D7] rounded text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addQuestion('mcq')}>+ MCQ</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addQuestion('multi_select')}>+ Multi-select</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addQuestion('short_answer')}>+ Short answer</Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" loading={isPending} disabled={questions.length === 0}>Create quiz</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Existing quizzes (real list, no correct answers exposed) */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-[#1F2421]">Existing quizzes</h3>
          <Button as={Link} to="/instructor/quiz-drafts" variant="outline" size="sm">Review AI drafts</Button>
        </div>
        {loadingQuizzes ? (
          <LoadingSpinner text="Loading quizzes..." />
        ) : existing.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="No quizzes yet"
            description="Create a manual quiz above or generate one with AI from a lecture."
          />
        ) : (
          <ul className="space-y-2">
            {existing.map((q: any) => (
              <li key={q.id} className="flex items-center justify-between gap-3 bg-[#FBF9F5] rounded p-2.5">
                <div>
                  <p className="text-sm font-medium text-[#1F2421]">{q.title}</p>
                  <p className="text-xs text-[#5C635D]">
                    {q.questionCount ?? 0} questions{q.isAiGenerated ? ' · AI-generated' : ''}
                  </p>
                </div>
                {q.isAiGenerated && <Badge variant="primary">AI</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
