import { useParams, Link } from 'react-router-dom';
import { useGenerateStudyPlan } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Calendar, RefreshCw, Target } from 'lucide-react';
import { useState } from 'react';

export const StudyPlanPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { mutate: generate, isPending, data } = useGenerateStudyPlan();
  const [plan, setPlan] = useState<any>(null);

  const handleGenerate = () => {
    if (courseId) {
      // Backend returns the saved row with the plan nested under `plan`.
      generate(courseId, { onSuccess: (d: any) => setPlan(d?.plan ?? d) });
    }
  };

  const activePlan = plan ?? (data as any)?.plan ?? null;
  const weeks = activePlan?.weeks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Study Plan
          </h1>
          <p className="text-[#5C635D]">AI-generated personalized study schedule</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to={`/courses/${courseId}`}>
          Back to course
        </Button>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Target className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <h3 className="font-medium text-[#1F2421]">Personalized schedule</h3>
              <p className="text-sm text-[#5C635D]">
                Based on your quiz performance and course content.
              </p>
            </div>
          </div>
          <Button onClick={handleGenerate} loading={isPending} variant="outline">
            <RefreshCw size={16} />
            {plan ? 'Regenerate' : 'Generate plan'}
          </Button>
        </div>
      </Card>

      {isPending && <LoadingSpinner text="Generating your study plan..." />}

      {!isPending && weeks.length === 0 && !plan && (
        <Card>
          <EmptyState
            icon={Calendar}
            title="No study plan yet"
            description="Generate a plan to get a week-by-week schedule tailored to your progress."
          />
        </Card>
      )}

      {weeks.length > 0 && (
        <div className="space-y-4">
          {activePlan?.mastery && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#5C635D]">Detected mastery:</span>
              <Badge variant="primary">{activePlan.mastery}</Badge>
            </div>
          )}
          {weeks.map((week: any, idx: number) => (
            <Card key={idx}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center shrink-0">
                  <span className="text-[#A94E22] dark:text-[#e8a06f] font-medium">W{week.week}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-[#1F2421] mb-1">{week.focus}</h3>
                  {week.tasks && (
                    <ul className="space-y-1">
                      {week.tasks.map((task: string, i: number) => (
                        <li key={i} className="text-sm text-[#5C635D] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-[#C4612F] rounded-full" />
                          {task}
                        </li>
                      ))}
                    </ul>
                  )}
                  {week.targetMinutes != null && (
                    <p className="text-xs text-[#5C635D] mt-2">Target: {week.targetMinutes} min/week</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
