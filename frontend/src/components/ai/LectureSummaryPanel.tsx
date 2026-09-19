import { useState } from 'react';
import { useGenerateLectureSummary } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Sparkles } from 'lucide-react';

/**
 * Visible lecture-summary action for the course player.
 * Uses POST /api/v1/ai/lectures/:id/summarize and renders only
 * what the backend returns — never fabricated output.
 */
export const LectureSummaryPanel = ({ lectureId }: { lectureId: string }) => {
  const { mutate: generate, isPending, isError, error, data, reset } = useGenerateLectureSummary();
  const [requested, setRequested] = useState(false);

  const summary = data?.summary;
  const keyPoints = summary?.keyPoints ?? data?.keyPoints ?? [];
  const takeaways = summary?.takeaways ?? data?.takeaways ?? [];

  const handleGenerate = () => {
    reset();
    setRequested(true);
    generate(lectureId);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center" aria-hidden="true">
            <Sparkles size={14} className="text-white" />
          </span>
          AI Summary
        </h3>
        <Button size="sm" variant="outline" onClick={handleGenerate} loading={isPending}>
          {requested && (keyPoints.length > 0 || isError) ? 'Regenerate' : 'Generate summary'}
        </Button>
      </div>

      {isPending && <LoadingSpinner text="Generating summary..." />}

      {!isPending && !requested && (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
          Generate a structured summary of this lecture. Requires an indexed transcript.
        </p>
      )}

      {!isPending && isError && (
        <div>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            Retry
          </Button>
        </div>
      )}

      {!isPending && !isError && requested && keyPoints.length === 0 && (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">No summary returned. The lecture may have no indexed transcript yet.</p>
      )}

      {!isPending && !isError && keyPoints.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <p className="vl-eyebrow text-[#C4612F] dark:text-[#e8a06f] mb-2">Key points</p>
            <ul className="space-y-1.5">
              {keyPoints.map((point: string, idx: number) => (
                <li key={idx} className="text-sm text-[#1F2421] dark:text-[#ece9e2] flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-[#C4612F] dark:bg-[#e8a06f] rounded-full mt-1.5 shrink-0" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          {takeaways.length > 0 && (
            <div>
              <p className="vl-eyebrow text-[#5C635D] dark:text-[#b9beb4] mb-2">Takeaways</p>
              <ul className="space-y-1.5">
                {takeaways.map((takeaway: string, idx: number) => (
                  <li key={idx} className="text-sm text-[#5C635D] dark:text-[#b9beb4] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-[#5C635D]/60 rounded-full mt-1.5 shrink-0" aria-hidden="true" />
                    {takeaway}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data?.provider && <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Provider: {data.provider}</p>}
        </div>
      )}
    </Card>
  );
};
