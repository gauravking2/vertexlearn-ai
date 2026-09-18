import { api } from './api';
import {
  Enrollment,
  LectureProgress,
  Note,
  Bookmark,
  Certificate,
  GamificationStats,
} from '@/types';
import {
  normalizeEnrollment,
  normalizeNote,
  normalizeBookmark,
  normalizeCertificate,
  normalizeGamification,
  normalizePage,
} from '@/utils/model';

export const learningService = {
  // Enrollments (normalized: course_id→courseId, progress_percent→progressPercent, course_title→courseTitle)
  async getMyEnrollments(): Promise<{ data: Enrollment[] }> {
    const response = await api.get<{ data: Enrollment[] }>('/enrollments/me');
    return { data: normalizePage(response.data, (r) => normalizeEnrollment(r)).data } as unknown as { data: Enrollment[] };
  },

  // Progress — backend returns { progress, courseProgressPercent, certificate }
  async updateLectureProgress(
    lectureId: string,
    data: { watchedSeconds?: number; completed?: boolean }
  ): Promise<{ progress: LectureProgress; courseProgressPercent: number; certificate: unknown }> {
    const response = await api.post(`/lectures/${lectureId}/progress`, data);
    return response.data;
  },

  // Notes
  async getLectureNotes(lectureId: string): Promise<{ data: Note[] }> {
    const response = await api.get<{ data: Note[] }>(`/lectures/${lectureId}/notes`);
    return { data: normalizePage(response.data, (r) => normalizeNote(r)).data } as unknown as { data: Note[] };
  },

  async createNote(
    lectureId: string,
    data: { content: string; timestampSeconds?: number }
  ): Promise<Note> {
    const response = await api.post<Note>(`/lectures/${lectureId}/notes`, data);
    return normalizeNote(response.data as any) as unknown as Note;
  },

  // Bookmarks
  async getLectureBookmarks(lectureId: string): Promise<{ data: Bookmark[] }> {
    const response = await api.get<{ data: Bookmark[] }>(`/lectures/${lectureId}/bookmarks`);
    return { data: normalizePage(response.data, (r) => normalizeBookmark(r)).data } as unknown as { data: Bookmark[] };
  },

  async createBookmark(
    lectureId: string,
    data: { timestampSeconds: number }
  ): Promise<Bookmark> {
    const response = await api.post<Bookmark>(`/lectures/${lectureId}/bookmarks`, data);
    return normalizeBookmark(response.data as any) as unknown as Bookmark;
  },

  // Certificates
  async getMyCertificates(): Promise<{ data: Certificate[] }> {
    const response = await api.get<{ data: Certificate[] }>('/certificates/me');
    return { data: normalizePage(response.data, (r) => normalizeCertificate(r)).data } as unknown as { data: Certificate[] };
  },

  async downloadCertificate(certificateId: string): Promise<Blob> {
    const response = await api.get(`/certificates/${certificateId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Gamification — backend returns { badges: [...], streak: {...}|null }
  async getGamificationStats(): Promise<GamificationStats> {
    const response = await api.get<GamificationStats>('/gamification/me');
    return normalizeGamification(response.data as any) as unknown as GamificationStats;
  },

  // Leaderboard — public streak aggregates { data: [{ name, streak, badges }] }
  async getLeaderboard(limit = 10): Promise<{ data: { name: string; streak: number; badges: number }[] }> {
    const response = await api.get(`/gamification/leaderboard?limit=${limit}`);
    return response.data;
  },
};
