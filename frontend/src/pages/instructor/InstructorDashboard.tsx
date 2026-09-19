import { Link } from 'react-router-dom';
import { useInstructorCourses } from '@/hooks/useCourses';
import { useQuizDrafts } from '@/hooks/useAI';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { BookOpen, Brain, Plus, FileText, ArrowRight } from 'lucide-react';

export const InstructorDashboard = () => {
  const { data: courses, isLoading: loadingCourses } = useInstructorCourses();
  const { data: drafts, isLoading: loadingDrafts } = useQuizDrafts();
  const { user } = useAuth();

  if (loadingCourses || loadingDrafts) {
    return <LoadingSpinner text="Loading instructor dashboard..." />;
  }

  const allCourses = courses?.data ?? [];
  const isAdmin = user?.roles?.includes('admin');
  const courseList = isAdmin ? allCourses : allCourses.filter((c: any) => (c.instructorId ?? c.instructor_id) === user?.id);
  const draftList = drafts?.data ?? [];
  const pendingDrafts = draftList.filter((d: any) => d.status === 'pending_review');

  const statCards = [
    { icon: BookOpen, value: courseList.length, label: 'Your courses' },
    { icon: Brain, value: pendingDrafts.length, label: 'AI drafts pending review' },
    { icon: FileText, value: draftList.length, label: 'Total AI drafts' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Instructor <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Dashboard</span>
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">Manage your courses, quizzes, and AI drafts</p>
        </div>
        <Button as={Link} to="/instructor/courses/new">
          <Plus size={16} aria-hidden="true" /> New course
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 vl-stagger">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} variant="elevated" className="relative overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]"
              />
              <div className="flex items-center gap-3 relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums leading-none mb-1">{s.value}</p>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{s.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card variant="inset">
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">Quick actions</h3>
          <div className="space-y-2">
            <Button as={Link} to="/instructor/courses/new" variant="outline" fullWidth>
              Create a course
            </Button>
            <Button as={Link} to="/instructor/quiz-drafts" variant="outline" fullWidth>
              Review AI quiz drafts
            </Button>
            <Button as={Link} to="/instructor/courses" variant="outline" fullWidth>
              Manage courses
            </Button>
            <Button as={Link} to="/instructor/analytics" variant="outline" fullWidth>
              View analytics
            </Button>
          </div>
        </Card>

        <Card variant="elevated">
          <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-3">Recent courses</h3>
          {courseList.length === 0 ? (
            <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">No courses yet. Create your first one!</p>
          ) : (
            <ul className="space-y-1">
              {courseList.slice(0, 4).map((c: any) => (
                <li key={c.id}>
                  <Link
                    to={`/instructor/courses/${c.id}/edit`}
                    className="flex items-center justify-between text-sm rounded-lg px-2 py-2 -mx-2 hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] transition-colors group"
                  >
                    <span className="text-[#1F2421] dark:text-[#ece9e2] truncate">{c.title}</span>
                    <span className="text-xs text-[#5C635D] dark:text-[#b9beb4] inline-flex items-center gap-1 capitalize">
                      {c.status}
                      <ArrowRight size={12} className="opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
