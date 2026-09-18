import { api } from './api';
import { Course, CourseFilters, PaginatedResponse, Module, Lecture } from '@/types';

export const courseService = {
  async getCourses(filters?: CourseFilters): Promise<PaginatedResponse<Course>> {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', filters.page.toString());
    // Backend uses pageSize (not limit)
    const pageSize = filters?.pageSize ?? filters?.limit;
    if (pageSize) params.append('pageSize', pageSize.toString());
    if (filters?.q) params.append('q', filters.q);
    if (filters?.search) params.append('q', filters.search);
    if (filters?.status) params.append('status', filters.status);
    // Phase 6: real server-side catalog filters (migration 005).
    if (filters?.category) params.append('category', filters.category);
    if (filters?.difficulty) params.append('difficulty', String(filters.difficulty).toLowerCase());
    if (filters?.minRating) params.append('minRating', String(filters.minRating));

    const response = await api.get<PaginatedResponse<Course>>(`/courses?${params.toString()}`);
    const data = response.data;
    if (!data.totalPages) {
      data.totalPages = Math.ceil(data.total / data.pageSize);
    }
    data.courses = data.data;
    return data;
  },

  async getCourse(courseId: string): Promise<Course> {
    const response = await api.get<Course>(`/courses/${courseId}`);
    return response.data;
  },

  async enrollCourse(courseId: string) {
    const response = await api.post(`/courses/${courseId}/enroll`);
    return response.data;
  },

  async getEnrollments() {
    const response = await api.get('/enrollments/me');
    return response.data;
  },

  async getInstructorCourses(): Promise<PaginatedResponse<Course>> {
    // Instructors see their own courses by filtering without status param
    // or by using the standard /courses endpoint
    const response = await api.get<PaginatedResponse<Course>>('/courses');
    return response.data;
  },

  async createCourse(data: { title: string; description?: string; category?: string; difficulty?: string }) {
    const response = await api.post('/courses', data);
    return response.data;
  },

  async updateCourse(courseId: string, data: { title?: string; description?: string; category?: string; difficulty?: string }) {
    const response = await api.put(`/courses/${courseId}`, data);
    return response.data;
  },

  async createModule(courseId: string, data: { title: string; sortOrder?: number }): Promise<Module> {
    const response = await api.post<Module>(`/courses/${courseId}/modules`, data);
    return response.data;
  },

  async createLecture(
    moduleId: string,
    data: { title: string; sortOrder?: number; videoKey?: string; durationS?: number }
  ): Promise<Lecture> {
    const response = await api.post<Lecture>(`/courses/modules/${moduleId}/lectures`, data);
    return response.data;
  },

  // Instructor analytics (real): GET /api/v1/courses/:id/analytics returns
  // { perLecture, quizzes, timeOnTask } — see CourseAnalytics type.
  async getCourseAnalytics(courseId: string) {
    const response = await api.get(`/courses/${courseId}/analytics`);
    return response.data;
  },

  // Course reviews (real aggregated ratings — never fabricated).
  async listReviews(courseId: string) {
    const response = await api.get(`/courses/${courseId}/reviews`);
    return response.data as {
      data: { id: string; rating: number; review: string; reviewer_name: string; created_at: string }[];
      aggregate: { avg_rating: number; rating_count: number };
    };
  },

  async submitReview(courseId: string, data: { rating: number; review?: string }) {
    const response = await api.post(`/courses/${courseId}/reviews`, data);
    return response.data;
  },

  // Lecture video assets (private object storage; signed URLs, no credentials).
  async requestLectureUploadUrl(lectureId: string, data: { fileName: string; contentType: string }) {
    const response = await api.post(`/lectures/${lectureId}/upload-url`, data);
    return response.data as { lectureId: string; key: string; bucket: string; uploadUrl: string; expiresInSeconds: number };
  },

  async getLectureVideoUrl(lectureId: string) {
    const response = await api.get(`/lectures/${lectureId}/video-url`);
    return response.data as { lectureId: string; url: string | null; expiresInSeconds: number; unavailable?: boolean; reason?: string };
  },

  async updateCourseStatus(courseId: string, _status: 'draft' | 'pending' | 'published' | 'rejected') {
    // Backend PATCH /courses/:id/status is admin-only; the frontend does not
    // expose this action. This stub exists so a generic status-query helper
    // has a place to live if a future phase wires it to an admin surface.
    void courseId;
    void _status;
    throw new Error('Course status transitions require admin access.');
  },
};
