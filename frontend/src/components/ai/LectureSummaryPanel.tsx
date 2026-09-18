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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-serif text-[#1F2421] flex items-center gap-2">
          <Sparkles size={18} className="text-[#C4612F]" /> AI Summary
        </h3>
        <Button size="sm" variant="outline" onClick={handleGenerate} loading={isPending}>
          {requested && (keyPoints.length > 0 || isError) ? 'Regenerate' : 'Generate summary'}
        </Button>
      </div>

      {isPending && <LoadingSpinner text="Generating summary..." />}

      {!isPending && !requested && (
        <p className="text-sm text-[#5C635D]">
          Generate a structured summary of this lecture. Requires an indexed transcript.
        </p>
      )}

      {!isPending && isError && (
        <div>
          <p className="text-sm text-red-700 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            Retry
          </Button>
        </div>
      )}

      {!isPending && !isError && requested && keyPoints.length === 0 && (
        <p className="text-sm text-[#5C635D]">No summary returned. The lecture may have no indexed transcript yet.</p>
      )}

      {!isPending && !isError && keyPoints.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-1">Key points</p>
            <ul className="list-disc ml-5 space-y-1">
              {keyPoints.map((point: string, idx: number) => (
                <li key={idx} className="text-sm text-[#1F2421]">{point}</li>
              ))}
            </ul>
          </div>
          {takeaways.length > 0 && (
            <div>
              <p className="text-sm font-medium text-[#1F2421] mb-1">Takeaways</p>
              <ul className="list-disc ml-5 space-y-1">
                {takeaways.map((takeaway: string, idx: number) => (
                  <li key={idx} className="text-sm text-[#5C635D]">{takeaway}</li>
                ))}
              </ul>
            </div>
          )}
          {data?.provider && <p className="text-xs text-[#5C635D]">Provider: {data.provider}</p>}
        </div>
      )}
    </Card>
  );
};
