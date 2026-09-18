import { useState } from 'react';
import { useQuizDrafts, useApproveQuizDraft, useRejectQuizDraft, useGenerateQuizDraft } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Input } from '@/components/common/Input';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Brain, Check, X } from 'lucide-react';

const parseQuestions = (draft: any): any[] => {
  if (Array.isArray(draft.questions)) return draft.questions;
  const payload = draft.payload;
  try {
    if (typeof payload === 'string') {
      return JSON.parse(payload).questions ?? [];
    }
    if (payload && typeof payload === 'object' && Array.isArray((payload as any).questions)) {
      return (payload as any).questions;
    }
  } catch {
    return [];
  }
  return [];
};

export const AIQuizReview = () => {
  const { data, isLoading } = useQuizDrafts();
  const { mutate: approve, isPending: approving } = useApproveQuizDraft();
  const { mutate: reject, isPending: rejecting } = useRejectQuizDraft();
  const {
    mutate: generate,
    isPending: generating,
    isError: generateFailed,
    error: generateError,
    isSuccess: generated,
  } = useGenerateQuizDraft();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lectureId, setLectureId] = useState('');
  const [count, setCount] = useState('5');
  const [formError, setFormError] = useState('');
  const drafts = data?.data ?? [];

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lectureId.trim()) {
      setFormError('Lecture ID is required. Copy it from the course curriculum (or generate from the course quiz page).');
      return;
    }
    const n = Number(count);
    if (!Number.isInteger(n) || n < 5 || n > 10) {
      setFormError('Question count must be a whole number between 5 and 10.');
      return;
    }
    setFormError('');
    generate({ lectureId: lectureId.trim(), count: n });
  };

  if (isLoading) return <LoadingSpinner text="Loading drafts..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          AI Quiz <span className="italic text-[#C4612F]">Review</span>
        </h1>
        <p className="text-[#5C635D]">
          Review AI-generated drafts. Approved drafts become active quizzes; rejected drafts are discarded.
          Students never see pending drafts.
        </p>
      </div>

      {/* GENERATE trigger: Lecture → Generate AI Quiz → pending_review */}
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-1">Generate a draft from a lecture</h3>
        <p className="text-sm text-[#5C635D] mb-3">
          Prefer the course quiz page (it lists lectures for you). This manual form accepts a lecture ID directly.
        </p>
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Input label="Lecture ID" value={lectureId} onChange={(e) => setLectureId(e.target.value)} placeholder="paste lecture UUID" />
          </div>
          <div className="w-28">
            <Input label="Count (5–10)" type="number" min={5} max={10} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <Button type="submit" loading={generating}>Generate</Button>
        </form>
        {formError && <p className="text-sm text-red-700 mt-2">{formError}</p>}
        {generateFailed && <p className="text-sm text-red-700 mt-2">{getApiErrorMessage(generateError)}</p>}
        {generated && <p className="text-sm text-green-700 mt-2">Draft created as pending_review — it appears in the list below.</p>}
      </Card>

      {drafts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Brain}
            title="No AI quiz drafts"
            description="Generate drafts from a lecture's AI tools to review them here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft: any) => {
            const questions = parseQuestions(draft);
            const isPending = draft.status === 'pending_review';
            return (
              <Card key={draft.id}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-[#1F2421]">
                        {(draft.lecture_id ?? draft.lectureId) ? `Draft for lecture ${String(draft.lecture_id ?? draft.lectureId).slice(0, 8)}…` : 'AI quiz draft'}
                      </h3>
                      <Badge
                        variant={draft.status === 'approved' ? 'success' : draft.status === 'rejected' ? 'error' : 'warning'}
                      >
                        {draft.status === 'pending_review' ? 'Pending review' : draft.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#5C635D]">
                      {questions.length} question{questions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isPending && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggle(draft.id)}>
                        {expanded[draft.id] ? 'Hide' : 'Preview'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700"
                        onClick={() => reject(draft.id)}
                        loading={rejecting}
                      >
                        <X size={14} /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approve(draft.id)}
                        loading={approving}
                      >
                        <Check size={14} /> Approve
                      </Button>
                    </div>
                  )}
                </div>

                {expanded[draft.id] && isPending && (
                  <div className="border-t border-[#E7E1D7] pt-3 space-y-2">
                    {questions.map((q: any, idx: number) => (
                      <div key={idx} className="bg-[#FBF9F5] rounded p-2">
                        <p className="text-sm text-[#1F2421]">
                          <span className="text-xs text-[#A94E22] dark:text-[#e8a06f] mr-2">Q{idx + 1} ({q.type})</span>
                          {q.prompt}
                        </p>
                        {q.options && (
                          <ul className="ml-4 mt-1 space-y-0.5">
                            {q.options.map((o: any, oi: number) => (
                              <li key={oi} className={`text-xs ${o.isCorrect ? 'text-green-700 font-medium' : 'text-[#5C635D]'}`}>
                                {o.isCorrect ? '✓' : '○'} {o.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
