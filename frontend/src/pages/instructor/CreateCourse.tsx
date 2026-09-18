import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateCourse } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { ArrowLeft } from 'lucide-react';

export const CreateCourse = () => {
  const navigate = useNavigate();
  const { mutate: createCourse, isPending } = useCreateCourse();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createCourse(
      { title: title.trim(), description: description.trim() },
      { onSuccess: () => navigate('/instructor/courses') }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} /> Back to courses
      </Button>
      <Card>
        <h1 className="text-2xl font-serif text-[#1F2421] mb-4">Create course</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          <div>
            <label className="block text-sm font-medium text-[#1F2421] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#E7E1D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
              rows={6}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" as={Link} to="/instructor/courses">Cancel</Button>
            <Button type="submit" loading={isPending}>Create</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
