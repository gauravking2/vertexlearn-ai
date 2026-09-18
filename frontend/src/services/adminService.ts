import { api } from './api';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  is_suspended?: boolean;
  suspended_at?: string | null;
  created_at: string;
}

export const adminService = {
  async listUsers(params?: { page?: number; pageSize?: number; q?: string; role?: string }) {
    const search = new URLSearchParams();
    if (params?.page) search.append('page', String(params.page));
    if (params?.pageSize) search.append('pageSize', String(params.pageSize));
    if (params?.q) search.append('q', params.q);
    if (params?.role) search.append('role', params.role);
    const response = await api.get(`/admin/users?${search.toString()}`);
    return response.data;
  },

  async setRole(userId: string, role: 'student' | 'instructor' | 'admin', action: 'assign' | 'revoke' = 'assign') {
    const response = await api.put(`/admin/users/${userId}/role`, { role, action });
    return response.data;
  },

  async setSuspended(userId: string, suspended: boolean, reason = '') {
    const response = await api.put(`/admin/users/${userId}/suspend`, { suspended, reason });
    return response.data;
  },

  async deleteUser(userId: string) {
    await api.delete(`/admin/users/${userId}`);
  },

  async pendingCourses(params?: { page?: number; pageSize?: number }) {
    const search = new URLSearchParams();
    if (params?.page) search.append('page', String(params.page));
    if (params?.pageSize) search.append('pageSize', String(params.pageSize));
    const response = await api.get(`/admin/courses/pending?${search.toString()}`);
    return response.data;
  },

  async approveCourse(courseId: string, comment = '') {
    const response = await api.post(`/admin/courses/${courseId}/approve`, { comment });
    return response.data;
  },

  async rejectCourse(courseId: string, comment = '') {
    const response = await api.post(`/admin/courses/${courseId}/reject`, { comment });
    return response.data;
  },

  async decideCourse(courseId: string, decision: 'approved' | 'rejected', comment = '') {
    const response = await api.post(`/admin/courses/${courseId}/decision`, { decision, comment });
    return response.data;
  },

  async approvalHistory(courseId: string) {
    const response = await api.get(`/admin/courses/${courseId}/approvals`);
    return response.data;
  },

  async analyticsOverview() {
    const response = await api.get('/admin/analytics/overview');
    return response.data;
  },

  async flaggedPosts() {
    const response = await api.get('/admin/moderation/flagged-posts');
    return response.data;
  },

  async moderatePost(postId: string, action: 'resolve' | 'dismiss' | 'hide' | 'unhide' | 'delete') {
    const response = await api.put(`/admin/moderation/posts/${postId}`, { action });
    return response.data;
  },
};
