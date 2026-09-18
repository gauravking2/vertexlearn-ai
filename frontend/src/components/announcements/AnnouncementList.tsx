import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementService, Announcement } from '@/services/announcementService';
import { authStore } from '@/store/authStore';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';

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
      <h3 className="text-lg font-serif text-[#1F2421] mb-3">Announcements</h3>
      {canPublish && (
        <div className="mb-4 border-b border-[#E7E1D7] pb-4">
          {error && <p className="text-sm text-red-600 mb-2" role="alert">{error}</p>}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            aria-label="Announcement title"
            className="w-full border border-[#E7E1D7] rounded-lg px-3 py-2 text-sm mb-2"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Announcement body"
            aria-label="Announcement body"
            className="w-full border border-[#E7E1D7] rounded-lg px-3 py-2 text-sm mb-2"
            rows={2}
          />
          <Button size="sm" disabled={!title.trim() || !body.trim()} onClick={() => create.mutate()}>Publish announcement</Button>
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-[#5C635D]">Loading announcements...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#5C635D]">No announcements yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="border-b border-[#E7E1D7] last:border-b-0 pb-3 last:pb-0">
              <p className="font-medium text-[#1F2421]">{a.title}</p>
              <p className="text-sm text-[#5C635D]">{a.body}</p>
              <p className="text-xs text-[#5C635D]">By {a.author_name ?? a.author_id} • {new Date(a.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
