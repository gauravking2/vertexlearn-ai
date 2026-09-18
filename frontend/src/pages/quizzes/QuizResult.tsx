import { useParams, Link } from 'react-router-dom';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { Award } from 'lucide-react';

export const QuizResult = () => {
  const { id } = useParams<{ id: string }>();

  // Backend does not expose a GET /attempts/:id endpoint; the result is shown
  // immediately after submit in QuizAttempt. This page exists for deep links
  // and shows an honest state.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          Quiz Result
        </h1>
        <p className="text-[#5C635D]">Attempt {id}</p>
      </div>

      <Card>
        <EmptyState
          icon={Award}
          title="Result not loaded"
          description="Quiz results are displayed immediately after you submit an attempt. Start a quiz to see your score here."
          actionLabel="Back to dashboard"
          onAction={() => {}}
        />
        <div className="flex justify-center mt-2">
          <Button as={Link} to="/dashboard">Go to dashboard</Button>
        </div>
      </Card>
    </div>
  );
};
