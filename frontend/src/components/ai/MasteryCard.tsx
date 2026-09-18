import { useCourseMastery } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Gauge } from 'lucide-react';

/**
 * Student-visible mastery surface for the current course.
 * Uses GET /api/v1/ai/mastery/:courseId exactly as returned:
 * { topic, attempts, avgScoreRatio, level, formula }.
 * No precision is claimed beyond the backend formula text.
 */
export const MasteryCard = ({ courseId }: { courseId: string }) => {
  const { data, isLoading, isError, error, refetch, isFetching } = useCourseMastery(courseId);

  if (isLoading) return <LoadingSpinner text="Loading mastery..." />;

  if (isError) {
    return (
      <Card>
        <h3 className="font-medium text-[#1F2421] mb-1 flex items-center gap-2">
          <Gauge size={16} className="text-[#C4612F]" /> Mastery
        </h3>
        <p className="text-sm text-red-700 mb-3">{getApiErrorMessage(error)}</p>
        <button onClick={() => refetch()} className="text-sm text-[#A94E22] dark:text-[#e8a06f] hover:underline">
          Retry
        </button>
      </Card>
    );
  }

  if (!data) return null;

  const ratio = typeof data.avgScoreRatio === 'number' ? data.avgScoreRatio : null;
  const attempts = data.attempts ?? data.attemptsCount ?? 0;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-[#1F2421] flex items-center gap-2">
          <Gauge size={16} className="text-[#C4612F]" /> Mastery
        </h3>
        <Badge variant={data.level === 'advanced' ? 'success' : data.level === 'intermediate' ? 'warning' : 'neutral'}>
          {data.level}
        </Badge>
      </div>
      <p className="text-sm text-[#5C635D]">
        {attempts === 0 || ratio === null
          ? 'Not enough quiz history yet — level falls back to your course progress.'
          : `Based on ${attempts} quiz attempt${attempts === 1 ? '' : 's'} with an average score ratio of ${(ratio! * 100).toFixed(0)}%.`}
      </p>
      {data.formula && <p className="text-xs text-[#5C635D] mt-2">How it is computed: {data.formula}</p>}
      {isFetching && <p className="text-xs text-[#5C635D] mt-1">Refreshing…</p>}
    </Card>
  );
};
