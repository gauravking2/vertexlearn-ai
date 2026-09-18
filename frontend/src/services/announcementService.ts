import { api } from './api';

export interface Announcement {
  id: string;
  course_id: string;
  author_id: string;
  author_name?: string;
  title: string;
  body: string;
  created_at: string;
}

export const announcementService = {
  async list(courseId: string) {
    const response = await api.get(`/courses/${courseId}/announcements`);
    return response.data as { data: Announcement[] };
  },

  async create(courseId: string, data: { title: string; body: string }) {
    const response = await api.post(`/courses/${courseId}/announcements`, data);
    return response.data as Announcement;
  },
};
