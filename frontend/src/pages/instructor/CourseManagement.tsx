import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInstructorCourses, useCreateCourse } from '@/hooks/useCourses';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Input } from '@/components/common/Input';
import { Plus, Pencil, BookOpen, BarChart3, ClipboardList, FileQuestion } from 'lucide-react';

export const CourseManagement = () => {
  const { data, isLoading } = useInstructorCourses();
  const { mutate: createCourse, isPending: creating } = useCreateCourse();
  const { user } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const allCourses = data?.data ?? [];
  // Instructors manage only their own courses; admins (platform-wide) see all.
  const isAdmin = user?.roles?.includes('admin');
  const courses = isAdmin ? allCourses : allCourses.filter((c: any) => (c.instructorId ?? c.instructor_id) === user?.id);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createCourse(
      { title: title.trim(), description: description.trim() },
      { onSuccess: () => { setShowForm(false); setTitle(''); setDescription(''); } }
    );
  };

  if (isLoading) return <LoadingSpinner text="Loading courses..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Management</span>
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">Create and manage your courses</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} aria-hidden="true" /> New course
        </Button>
      </div>

      {showForm && (
        <Card className="animate-fade-in">
          <form onSubmit={handleCreate} className="space-y-3">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
            <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" loading={creating}>Create</Button>
            </div>
          </form>
        </Card>
      )}

      {courses.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="No courses yet" description="Create your first course to get started." />
        </Card>
      ) : (
        <div className="space-y-3 vl-stagger">
          {courses.map((course: any) => (
            <Card key={course.id} variant="elevated" hover>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{course.title}</h3>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] line-clamp-2">{course.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Status transitions are admin-only on the backend
                      (PATCH /courses/:id/status). Display only. */}
                  <Badge
                    variant={
                      course.status === 'published' ? 'success' : course.status === 'pending_review' ? 'warning' : 'neutral'
                    }
                  >
                    {course.status}
                  </Badge>
                  <Link to={`/instructor/courses/${course.id}/edit`}>
                    <Button variant="outline" size="sm"><Pencil size={14} aria-hidden="true" /> Curriculum</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/quizzes`}>
                    <Button variant="outline" size="sm"><FileQuestion size={14} aria-hidden="true" /> Quizzes</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/assignments`}>
                    <Button variant="outline" size="sm"><ClipboardList size={14} aria-hidden="true" /> Assignments</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/analytics`}>
                    <Button variant="outline" size="sm"><BarChart3 size={14} aria-hidden="true" /> Analytics</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
