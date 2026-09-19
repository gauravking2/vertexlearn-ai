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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Study Plan
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">AI-generated personalized study schedule</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to={`/courses/${courseId}`}>
          Back to course
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center" aria-hidden="true">
              <Target className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
            </div>
            <div>
              <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">Personalized schedule</h3>
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
                Based on your quiz performance and course content.
              </p>
            </div>
          </div>
          <Button onClick={handleGenerate} loading={isPending} variant="outline">
            <RefreshCw size={16} aria-hidden="true" />
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
        <div className="space-y-4 vl-stagger">
          {activePlan?.mastery && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Detected mastery:</span>
              <Badge variant="primary">{activePlan.mastery}</Badge>
            </div>
          )}
          {weeks.map((week: any, idx: number) => (
            <Card key={idx} className="relative overflow-hidden">
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#7C3AED] to-[#06B6D4]" />
              <div className="flex items-start gap-4 pl-2">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center shrink-0" aria-hidden="true">
                  <span className="text-[#8A3E1C] dark:text-[#e8a06f] font-semibold text-sm">W{week.week}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5">{week.focus}</h3>
                  {week.tasks && (
                    <ul className="space-y-1.5">
                      {week.tasks.map((task: string, i: number) => (
                        <li key={i} className="text-sm text-[#5C635D] dark:text-[#b9beb4] flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-[#C4612F] dark:bg-[#e8a06f] rounded-full mt-1.5 shrink-0" aria-hidden="true" />
                          {task}
                        </li>
                      ))}
                    </ul>
                  )}
                  {week.targetMinutes != null && (
                    <p className="text-xs text-[#5C635D]/80 dark:text-[#b9beb4]/80 mt-2 tabular-nums">Target: {week.targetMinutes} min/week</p>
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
