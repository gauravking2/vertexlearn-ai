import { Link } from 'react-router-dom';
import { useInstructorCourses } from '@/hooks/useCourses';
import { useQuizDrafts } from '@/hooks/useAI';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { BookOpen, Brain, Plus, FileText } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Instructor <span className="italic text-[#C4612F]">Dashboard</span>
          </h1>
          <p className="text-[#5C635D]">Manage your courses, quizzes, and AI drafts</p>
        </div>
        <Button as={Link} to="/instructor/courses/new">
          <Plus size={16} /> New course
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <BookOpen className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{courseList.length}</p>
              <p className="text-xs text-[#5C635D]">Your courses</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Brain className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{pendingDrafts.length}</p>
              <p className="text-xs text-[#5C635D]">AI drafts pending review</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <FileText className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{draftList.length}</p>
              <p className="text-xs text-[#5C635D]">Total AI drafts</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-medium text-[#1F2421] mb-2">Quick actions</h3>
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

        <Card>
          <h3 className="font-medium text-[#1F2421] mb-2">Recent courses</h3>
          {courseList.length === 0 ? (
            <p className="text-sm text-[#5C635D]">No courses yet. Create your first one!</p>
          ) : (
            <ul className="space-y-2">
              {courseList.slice(0, 4).map((c: any) => (
                <li key={c.id}>
                  <Link
                    to={`/instructor/courses/${c.id}/edit`}
                    className="flex items-center justify-between text-sm hover:bg-[#FBF9F5] rounded p-2"
                  >
                    <span className="text-[#1F2421] truncate">{c.title}</span>
                    <span className="text-xs text-[#5C635D]">{c.status}</span>
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
