import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notificationService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list(),
  });
  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationService.unreadCount(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  if (isLoading) return <LoadingSpinner text="Loading notifications..." />;
  if (isError) {
    return (
      <Card><p className="text-center text-red-600 py-8">Failed to load notifications.</p></Card>
    );
  }

  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif text-[#1F2421]">Notifications {unread?.unread ? <span className="text-sm text-[#A94E22] dark:text-[#e8a06f]">({unread.unread} unread)</span> : null}</h1>
        {items.some((n) => !n.is_read) && (
          <Button size="sm" variant="outline" onClick={() => markAll.mutate()}>Mark all read</Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card><p className="text-center text-[#5C635D] py-8">No notifications yet.</p></Card>
      ) : (
        items.map((n) => (
          <Card key={n.id} className={n.is_read ? 'opacity-70' : ''}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#1F2421]">{n.title}</p>
                {n.body && <p className="text-sm text-[#5C635D]">{n.body}</p>}
                <p className="text-xs text-[#5C635D]">{n.type} • {new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.is_read && (
                <Button size="sm" variant="outline" onClick={() => markRead.mutate(n.id)}>Mark read</Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
