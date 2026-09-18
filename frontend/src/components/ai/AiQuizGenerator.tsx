import { useState } from 'react';
import { useGenerateQuizDraft } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Brain } from 'lucide-react';

/**
 * Instructor GENERATE trigger for the AI quiz workflow:
 * Lecture → Generate AI Quiz → pending_review → preview → approve/reject.
 * Uses POST /api/v1/ai/lectures/:id/generate-quiz (count 5–10, enforced server-side).
 * Drafts stay pending_review; students never see them (review page is
 * instructor-gated and approve/reject remain owner-checked server-side).
 */
export const AiQuizGenerator = ({
  lectures,
  defaultLectureId,
}: {
  lectures: Array<{ id: string; title: string }>;
  defaultLectureId?: string;
}) => {
  const { mutate: generate, isPending, isError, error, isSuccess, data, reset } = useGenerateQuizDraft();
  const [lectureId, setLectureId] = useState(defaultLectureId ?? lectures[0]?.id ?? '');
  const [count, setCount] = useState(5);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lectureId) return;
    reset();
    const clamped = Math.min(10, Math.max(5, Number(count) || 5));
    setCount(clamped);
    generate({ lectureId, count: clamped });
  };

  if (lectures.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[#5C635D]">
          Add a lecture to this course first — AI quizzes are generated per lecture from its transcript.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="font-medium text-[#1F2421] flex items-center gap-2 mb-1">
        <Brain size={16} className="text-[#C4612F]" /> Generate AI quiz
      </h3>
      <p className="text-sm text-[#5C635D] mb-3">
        Drafts are created as <span className="font-medium">pending_review</span> and never appear to
        students until approved.
      </p>
      <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-[#1F2421] mb-1.5">Lecture</label>
          <select
            value={lectureId}
            onChange={(e) => setLectureId(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#E7E1D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C4612F]"
          >
            {lectures.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <Input
            label="Questions (5–10)"
            type="number"
            min={5}
            max={10}
            value={String(count)}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <Button type="submit" loading={isPending} disabled={!lectureId}>
          Generate
        </Button>
      </form>
      {isError && <p className="text-sm text-red-700 mt-2">{getApiErrorMessage(error)}</p>}
      {isSuccess && data && (
        <p className="text-sm text-green-700 mt-2">
          Draft created ({(data as { id?: string }).id ? `id ${(data as { id: string }).id.slice(0, 8)}…` : 'pending_review'}) — review it on the AI drafts page.
        </p>
      )}
    </Card>
  );
};
