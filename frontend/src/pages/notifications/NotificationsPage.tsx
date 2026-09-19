import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notificationService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Bell, MailOpen } from 'lucide-react';

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
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
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">{getApiErrorMessage(error) ?? 'Failed to load notifications.'}</p>
      </Card>
    );
  }

  const items = data?.data ?? [];
  const unreadCount = unread?.unread ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
            Notifications{' '}
            {unreadCount > 0 && (
              <span className="text-sm text-[#A94E22] dark:text-[#e8a06f] align-middle">({unreadCount} unread)</span>
            )}
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Activity from your courses and instructors</p>
        </div>
        {items.some((n) => !n.is_read) && (
          <Button size="sm" variant="outline" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            <MailOpen size={14} aria-hidden="true" /> Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Course updates, grades, and announcements will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3 vl-stagger">
          {items.map((n) => {
            const unreadItem = !n.is_read;
            return (
              <Card
                key={n.id}
                className={`relative overflow-hidden transition-colors ${
                  unreadItem ? 'ring-1 ring-inset ring-[#C4612F]/25 dark:ring-[#e8a06f]/25' : ''
                }`}
              >
                {unreadItem && (
                  <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C4612F] to-[#A94E22]" />
                )}
                <div className="flex items-start justify-between gap-3 pl-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {unreadItem && (
                        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#C4612F] dark:bg-[#e8a06f] shrink-0" />
                      )}
                      <p className={`text-[#1F2421] dark:text-[#ece9e2] ${unreadItem ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                      <Badge variant="neutral" className="capitalize">{n.type}</Badge>
                    </div>
                    {n.body && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mt-1">{n.body}</p>}
                    <p className="text-xs text-[#5C635D]/80 dark:text-[#b9beb4]/80 mt-1.5">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!unreadItem ? null : (
                    <Button size="sm" variant="outline" onClick={() => markRead.mutate(n.id)} loading={markRead.isPending}>
                      Mark read
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
