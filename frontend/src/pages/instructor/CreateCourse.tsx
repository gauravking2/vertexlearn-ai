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
  const [category, setCategory] = useState('Programming');
  const [difficulty, setDifficulty] = useState('beginner');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createCourse(
      { title: title.trim(), description: description.trim(), category, difficulty },
      { onSuccess: () => navigate('/instructor/courses') }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" as={Link} to="/instructor/courses">
        <ArrowLeft size={16} aria-hidden="true" /> Back to courses
      </Button>
      <Card>
        <h1 className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4">Create course</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          <div>
            <label className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5" htmlFor="course-description">Description</label>
            <textarea
              id="course-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all resize-none"
              rows={6}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5" htmlFor="course-category">Category</label>
              <select
                id="course-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] focus:outline-none focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all cursor-pointer"
              >
                {['Programming', 'Design', 'Business', 'Data Science', 'Marketing'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5" htmlFor="course-difficulty">Difficulty</label>
              <select
                id="course-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] focus:outline-none focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all cursor-pointer"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Category and difficulty drive catalog filters — choose the closest fit.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" as={Link} to="/instructor/courses">Cancel</Button>
            <Button type="submit" loading={isPending}>Create</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
