import { api } from './api';
import {
  Enrollment,
  LectureProgress,
  Note,
  Bookmark,
  Certificate,
  GamificationStats,
} from '@/types';

export const learningService = {
  // Enrollments
  async getMyEnrollments(): Promise<{ data: Enrollment[] }> {
    const response = await api.get<{ data: Enrollment[] }>('/enrollments/me');
    return response.data;
  },

  // Progress
  async updateLectureProgress(
    lectureId: string,
    data: { watchedSeconds?: number; completed?: boolean }
  ): Promise<LectureProgress> {
    const response = await api.post<LectureProgress>(`/lectures/${lectureId}/progress`, data);
    return response.data;
  },

  // Notes
  async getLectureNotes(lectureId: string): Promise<{ data: Note[] }> {
    const response = await api.get<{ data: Note[] }>(`/lectures/${lectureId}/notes`);
    return response.data;
  },

  async createNote(
    lectureId: string,
    data: { content: string; timestampSeconds?: number }
  ): Promise<Note> {
    const response = await api.post<Note>(`/lectures/${lectureId}/notes`, data);
    return response.data;
  },

  // Bookmarks
  async getLectureBookmarks(lectureId: string): Promise<{ data: Bookmark[] }> {
    const response = await api.get<{ data: Bookmark[] }>(`/lectures/${lectureId}/bookmarks`);
    return response.data;
  },

  async createBookmark(
    lectureId: string,
    data: { timestampSeconds: number }
  ): Promise<Bookmark> {
    const response = await api.post<Bookmark>(`/lectures/${lectureId}/bookmarks`, data);
    return response.data;
  },

  // Certificates
  async getMyCertificates(): Promise<{ data: Certificate[] }> {
    const response = await api.get<{ data: Certificate[] }>('/certificates/me');
    return response.data;
  },

  async downloadCertificate(certificateId: string): Promise<Blob> {
    const response = await api.get(`/certificates/${certificateId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Gamification
  async getGamificationStats(): Promise<GamificationStats> {
    const response = await api.get<GamificationStats>('/gamification/me');
    return response.data;
  },
};
