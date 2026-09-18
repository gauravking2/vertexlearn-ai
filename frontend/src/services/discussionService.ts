import { api } from './api';

export interface DiscussionThread {
  id: string;
  course_id: string;
  author_id: string;
  author_name?: string;
  title: string;
  is_hidden?: boolean;
  post_count?: number;
  created_at: string;
}

export interface DiscussionPost {
  id: string;
  thread_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  parent_post_id?: string | null;
  is_hidden?: boolean;
  flag_count?: number;
  created_at: string;
}

export const discussionService = {
  async listThreads(courseId: string) {
    const response = await api.get(`/courses/${courseId}/discussions/threads`);
    return response.data as { data: DiscussionThread[] };
  },

  async createThread(courseId: string, data: { title: string; body: string }) {
    const response = await api.post(`/courses/${courseId}/discussions/threads`, data);
    return response.data;
  },

  async getThread(threadId: string) {
    const response = await api.get(`/discussions/threads/${threadId}`);
    return response.data as { thread: DiscussionThread; posts: DiscussionPost[] };
  },

  async reply(threadId: string, data: { body: string; parentPostId?: string }) {
    const response = await api.post(`/discussions/threads/${threadId}/posts`, {
      body: data.body,
      ...(data.parentPostId ? { parentPostId: data.parentPostId } : {}),
    });
    return response.data as DiscussionPost;
  },

  async flagPost(postId: string, reason = '') {
    const response = await api.post(`/discussions/posts/${postId}/flag`, { reason });
    return response.data;
  },

  async moderatePost(postId: string, action: 'hide' | 'unhide' | 'delete') {
    const response = await api.put(`/discussions/posts/${postId}/moderate`, { action });
    return response.data;
  },

  async deletePost(postId: string) {
    await api.delete(`/discussions/posts/${postId}`);
  },
};
