import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInstructorCourses, useCreateCourse } from '@/hooks/useCourses';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Input } from '@/components/common/Input';
import { Plus, Pencil, BookOpen } from 'lucide-react';

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Course <span className="italic text-[#C4612F]">Management</span>
          </h1>
          <p className="text-[#5C635D]">Create and manage your courses</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> New course
        </Button>
      </div>

      {showForm && (
        <Card>
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
        <div className="space-y-3">
          {courses.map((course: any) => (
            <Card key={course.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-[#1F2421]">{course.title}</h3>
                  <p className="text-sm text-[#5C635D] line-clamp-2">{course.description}</p>
                  <p className="text-xs text-[#5C635D] mt-1">Status: {course.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status transitions are admin-only on the backend
                      (PATCH /courses/:id/status). Display only. */}
                  <span className="text-xs text-[#5C635D] px-2 py-1 bg-[#FBF9F5] rounded">
                    {course.status}
                  </span>
                  <Link to={`/instructor/courses/${course.id}/edit`}>
                    <Button variant="outline" size="sm"><Pencil size={14} /> Curriculum</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/quizzes`}>
                    <Button variant="outline" size="sm"><BookOpen size={14} /> Quizzes</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/assignments`}>
                    <Button variant="outline" size="sm">Assignments</Button>
                  </Link>
                  <Link to={`/instructor/courses/${course.id}/analytics`}>
                    <Button variant="outline" size="sm">Analytics</Button>
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
