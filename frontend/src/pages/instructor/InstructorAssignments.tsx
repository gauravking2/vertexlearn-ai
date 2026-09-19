import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useCourseAssignments,
  useCreateAssignment,
  useUpdateAssignment,
} from '@/hooks/useAssignments';
import { useCourse } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { ClipboardList, Plus, ArrowLeft, Pencil } from 'lucide-react';

/**
 * Instructor assignment workflow: create → edit → list (real data) →
 * submission review/grading (linked). No hardcoded lists.
 */
export const InstructorAssignments = () => {
  const { id: courseId } = useParams<{ id: string }>();
  const { data: course } = useCourse(courseId);
  const { data, isLoading, isError, error, refetch } = useCourseAssignments(courseId);
  const { mutate: create, isPending: creating, isError: createFailed, error: createError } = useCreateAssignment();
  const { mutate: update, isPending: updating } = useUpdateAssignment();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const assignments = data?.data ?? [];

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueAt('');
    setMaxScore('100');
    setFormError('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) return;
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }
    const score = Number(maxScore);
    if (!Number.isInteger(score) || score < 1) {
      setFormError('Max score must be a whole number of 1 or more.');
      return;
    }
    let due: string | undefined;
    if (dueAt.trim() !== '') {
      const parsed = new Date(dueAt);
      if (Number.isNaN(parsed.getTime())) {
        setFormError('Due date is not a valid date.');
        return;
      }
      due = parsed.toISOString();
    }
    setFormError('');
    if (editingId) {
      update(
        { id: editingId, data: { title: title.trim(), description: description.trim(), dueAt: due ?? null, maxScore: score } },
        { onSuccess: () => { resetForm(); refetch(); } }
      );
    } else {
      create(
        { courseId, title: title.trim(), description: description.trim(), ...(due ? { dueAt: due } : {}), maxScore: score },
        { onSuccess: () => { resetForm(); refetch(); } }
      );
    }
  };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setTitle(a.title ?? '');
    setDescription(a.description ?? '');
    const raw = a.dueAt;
    setDueAt(raw ? new Date(raw).toISOString().slice(0, 16) : '');
    setMaxScore(String(a.maxScore ?? 100));
    setShowForm(true);
  };

  if (isLoading) return <LoadingSpinner text="Loading assignments..." />;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} aria-hidden="true" /> Back to courses
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Assignments</span>
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">Manage assignments for {(course as any)?.title ?? 'this course'}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm((v) => !v); }}>
          <Plus size={16} aria-hidden="true" /> New assignment
        </Button>
      </div>

      {showForm && (
        <Card className="animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div>
              <label className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5" htmlFor="assignment-description">Description</label>
              <textarea
                id="assignment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Due date (optional)" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              <Input label="Max score" type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} required />
            </div>
            {formError && <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>}
            {createFailed && <p className="text-sm text-red-700 dark:text-red-400">{getApiErrorMessage(createError)}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
              <Button type="submit" loading={creating || updating}>
                {editingId ? 'Save changes' : 'Create assignment'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isError && (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2">{getApiErrorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      )}

      {!isError && assignments.length === 0 && (
        <Card>
          <EmptyState icon={ClipboardList} title="No assignments yet" description="Create the first assignment for this course." />
        </Card>
      )}

      {!isError && assignments.length > 0 && (
        <div className="space-y-3 vl-stagger">
          {assignments.map((a: any) => {
            const due = a.dueAt;
            const overdue = due && new Date(due) < new Date();
            return (
              <Card key={a.id} variant="elevated" className="relative overflow-hidden">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-0 bottom-0 w-1 ${overdue ? 'bg-gradient-to-b from-red-500 to-red-700' : 'bg-gradient-to-b from-[#C4612F] to-[#A94E22]'}`}
                />
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pl-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{a.title}</h3>
                    {a.description && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] line-clamp-2">{a.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <Badge variant="neutral">Max {a.maxScore}</Badge>
                      {due && <Badge variant={overdue ? 'error' : 'neutral'}>Due {new Date(due).toLocaleDateString()}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                      <Pencil size={14} aria-hidden="true" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" as={Link} to={`/instructor/assignments/${a.id}/submissions`}>
                      Review
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
