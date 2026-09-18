import { api } from './api';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export const notificationService = {
  async list(limit = 50) {
    const response = await api.get(`/notifications/me?limit=${limit}`);
    return response.data as { data: NotificationItem[] };
  },

  async unreadCount() {
    const response = await api.get('/notifications/unread-count');
    return response.data as { unread: number };
  },

  async markRead(id: string) {
    const response = await api.put(`/notifications/${id}/read`);
    return response.data as NotificationItem;
  },

  async markAllRead() {
    const response = await api.put('/notifications/read-all');
    return response.data as { updated: number };
  },

  async emailStatus() {
    const response = await api.get('/notifications/email-status');
    return response.data as { provider: string; configured: boolean; note: string };
  },
};
