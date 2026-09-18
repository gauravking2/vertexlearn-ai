import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCourse, useUpdateCourse, useCreateModule, useCreateLecture } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Input } from '@/components/common/Input';
import { getApiErrorMessage } from '@/components/common/apiError';
import { LectureAssetUpload } from '@/components/instructor/LectureAssetUpload';
import { ArrowLeft, Plus, Layers, PlaySquare } from 'lucide-react';

export const EditCourse = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading, isError, error } = useCourse(id);
  const { mutate: updateCourse, isPending, isError: updateFailed, error: updateError, isSuccess: updated } = useUpdateCourse();
  const {
    mutate: createModule,
    isPending: creatingModule,
    isError: moduleFailed,
    error: moduleError,
    isSuccess: moduleCreated,
    reset: resetModule,
  } = useCreateModule();
  const {
    mutate: createLecture,
    isPending: creatingLecture,
    isError: lectureFailed,
    error: lectureError,
    isSuccess: lectureCreated,
    reset: resetLecture,
  } = useCreateLecture();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleValidationError, setModuleValidation] = useState('');
  const [lectureForms, setLectureForms] = useState<Record<string, { title: string; durationS: string; error: string }>>({});
  const [showModuleForm, setShowModuleForm] = useState(false);

  useEffect(() => {
    if (course) {
      setTitle((course as { title?: string }).title ?? '');
      setDescription((course as { description?: string }).description ?? '');
    }
  }, [course]);

  useEffect(() => {
    if (moduleCreated) {
      setModuleTitle('');
      setModuleValidation('');
      setShowModuleForm(false);
      const t = setTimeout(() => resetModule(), 4000);
      return () => clearTimeout(t);
    }
  }, [moduleCreated, resetModule]);

  useEffect(() => {
    if (lectureCreated) {
      const t = setTimeout(() => resetLecture(), 4000);
      return () => clearTimeout(t);
    }
  }, [lectureCreated, resetLecture]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    updateCourse(
      { id, data: { title: title.trim(), description: description.trim() } },
      { onSuccess: () => navigate('/instructor/courses') }
    );
  };

  const handleCreateModule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!moduleTitle.trim()) {
      setModuleValidation('Module title is required.');
      return;
    }
    setModuleValidation('');
    createModule({ courseId: id, data: { title: moduleTitle.trim() } });
  };

  const lectureDraft = (moduleId: string) =>
    lectureForms[moduleId] ?? { title: '', durationS: '', error: '' };

  const setLectureDraft = (moduleId: string, patch: Partial<{ title: string; durationS: string; error: string }>) =>
    setLectureForms((prev) => ({ ...prev, [moduleId]: { ...lectureDraft(moduleId), ...patch } }));

  const handleCreateLecture = (moduleId: string) => {
    if (!id) return;
    const draft = lectureDraft(moduleId);
    if (!draft.title.trim()) {
      setLectureDraft(moduleId, { error: 'Lecture title is required.' });
      return;
    }
    const durationS = draft.durationS.trim() === '' ? undefined : Number(draft.durationS);
    if (draft.durationS.trim() !== '' && (!Number.isInteger(durationS) || (durationS as number) < 0)) {
      setLectureDraft(moduleId, { error: 'Duration must be a whole number of seconds (0 or more).' });
      return;
    }
    setLectureDraft(moduleId, { error: '' });
    createLecture(
      { moduleId, courseId: id, data: { title: draft.title.trim(), ...(durationS !== undefined ? { durationS } : {}) } },
      { onSuccess: () => setLectureForms((prev) => ({ ...prev, [moduleId]: { title: '', durationS: '', error: '' } })) }
    );
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !course) {
    return (
      <Card>
        <EmptyState
          icon={ArrowLeft}
          title="Course not found"
          description={isError ? getApiErrorMessage(error) : "It may not exist or you don't own it."}
        />
      </Card>
    );
  }

  const modules = (course as { modules?: Array<{ id: string; title: string; lectures?: Array<{ id: string; title: string }> }> }).modules ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} /> Back
      </Button>

      <Card>
        <h1 className="text-2xl font-serif text-[#1F2421] mb-4">Edit course</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          <div>
            <label className="block text-sm font-medium text-[#1F2421] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#E7E1D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
              rows={5}
            />
          </div>
          {updateFailed && <p className="text-sm text-red-700">{getApiErrorMessage(updateError)}</p>}
          {updated && <p className="text-sm text-green-700">Course saved.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" as={Link} to="/instructor/courses">Cancel</Button>
            <Button type="submit" loading={isPending}>Save changes</Button>
          </div>
        </form>
      </Card>

      {/* Curriculum builder: POST /api/v1/courses/:id/modules then POST /api/v1/courses/modules/:id/lectures */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-serif text-[#1F2421] flex items-center gap-2">
            <Layers size={18} className="text-[#C4612F]" /> Curriculum
          </h2>
          <Button size="sm" variant="outline" onClick={() => setShowModuleForm((v) => !v)}>
            <Plus size={14} /> New module
          </Button>
        </div>

        {moduleCreated && <p className="text-sm text-green-700 mb-2">Module created.</p>}
        {moduleFailed && <p className="text-sm text-red-700 mb-2">{getApiErrorMessage(moduleError)}</p>}
        {lectureCreated && <p className="text-sm text-green-700 mb-2">Lecture created.</p>}
        {lectureFailed && <p className="text-sm text-red-700 mb-2">{getApiErrorMessage(lectureError)}</p>}

        {showModuleForm && (
          <form onSubmit={handleCreateModule} className="flex gap-2 mb-4">
            <div className="flex-1">
              <Input
                label="Module title"
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder="e.g. Getting started"
              />
              {moduleValidationError && <p className="text-xs text-red-700 mt-1">{moduleValidationError}</p>}
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowModuleForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={creatingModule}>Add</Button>
            </div>
          </form>
        )}

        {modules.length === 0 ? (
          <p className="text-sm text-[#5C635D]">No modules yet. Create one to start adding lectures.</p>
        ) : (
          <div className="space-y-4">
            {modules.map((m, idx) => {
              const draft = lectureDraft(m.id);
              return (
                <div key={m.id} className="border border-[#E7E1D7] rounded-lg p-3">
                  <p className="font-medium text-[#1F2421] mb-1">{idx + 1}. {m.title}</p>
                  {(m.lectures ?? []).length === 0 ? (
                    <p className="text-xs text-[#5C635D] mb-2">No lectures yet.</p>
                  ) : (
                    <ul className="ml-4 mb-2 space-y-2">
                      {(m.lectures ?? []).map((l) => (
                        <li key={l.id} className="text-sm text-[#5C635D]">
                          <span className="flex items-center gap-1.5">
                            <PlaySquare size={13} className="text-[#C4612F]" /> {l.title}
                          </span>
                          <LectureAssetUpload lectureId={l.id} lectureTitle={l.title} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[180px]">
                      <Input
                        label="New lecture title"
                        value={draft.title}
                        onChange={(e) => setLectureDraft(m.id, { title: e.target.value })}
                        placeholder="e.g. Welcome tour"
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        label="Duration (s)"
                        type="number"
                        min={0}
                        value={draft.durationS}
                        onChange={(e) => setLectureDraft(m.id, { durationS: e.target.value })}
                        placeholder="600"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleCreateLecture(m.id)} loading={creatingLecture}>
                      <Plus size={14} /> Add lecture
                    </Button>
                  </div>
                  {draft.error && <p className="text-xs text-red-700 mt-1">{draft.error}</p>}
                  <p className="text-[11px] text-[#5C635D] mt-1">
                    Supported fields: title, duration (seconds), plus per-lecture video upload to private object storage.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
