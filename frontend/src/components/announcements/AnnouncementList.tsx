import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementService, Announcement } from '@/services/announcementService';
import { authStore } from '@/store/authStore';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Megaphone } from 'lucide-react';

export const AnnouncementList = ({ courseId, instructorId }: { courseId: string; instructorId?: string }) => {
  const { user } = authStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const canPublish = !!user && (user.roles.includes('admin') || (user.roles.includes('instructor') && user.id === instructorId));

  const { data, isLoading } = useQuery({
    queryKey: ['announcements', courseId],
    queryFn: () => announcementService.list(courseId),
  });

  const create = useMutation({
    mutationFn: () => announcementService.create(courseId, { title, body }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['announcements', courseId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to publish announcement'),
  });

  const items: Announcement[] = data?.data ?? [];

  return (
    <Card>
      <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3 flex items-center gap-2">
        <Megaphone size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
        Announcements
      </h3>
      {canPublish && (
        <div className="mb-4 border-b border-[#E7E1D7] dark:border-[#2c2f2a] pb-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2" role="alert">{error}</p>}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            aria-label="Announcement title"
            className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-2"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Announcement body"
            aria-label="Announcement body"
            className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-2 resize-none"
            rows={2}
          />
          <Button size="sm" disabled={!title.trim() || !body.trim()} onClick={() => create.mutate()} loading={create.isPending}>Publish announcement</Button>
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Loading announcements...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">No announcements yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="border-b border-[#E7E1D7] dark:border-[#2c2f2a] last:border-b-0 pb-3 last:pb-0">
              <p className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{a.title}</p>
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mt-0.5">{a.body}</p>
              <p className="text-xs text-[#5C635D]/80 dark:text-[#b9beb4]/80 mt-1">By {a.author_name ?? a.author_id} • {new Date(a.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
