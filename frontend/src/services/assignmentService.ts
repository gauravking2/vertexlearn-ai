import { api } from './api';
import { Assignment, Submission } from '@/types';
import { normalizeAssignment, normalizeSubmission, normalizePage } from '@/utils/model';

export const assignmentService = {
  // Instructor endpoints (real)
  async createAssignment(data: {
    courseId: string;
    title: string;
    description?: string;
    dueAt?: string;
    maxScore?: number;
  }): Promise<Assignment> {
    const response = await api.post<Assignment>('/assignments', data);
    return normalizeAssignment(response.data as any) as unknown as Assignment;
  },

  async updateAssignment(
    assignmentId: string,
    data: {
      title?: string;
      description?: string;
      dueAt?: string | null;
      maxScore?: number;
    }
  ): Promise<Assignment> {
    const response = await api.put<Assignment>(`/assignments/${assignmentId}`, data);
    return normalizeAssignment(response.data as any) as unknown as Assignment;
  },

  // Student endpoints (real)
  async submitAssignment(
    assignmentId: string,
    data: {
      fileName?: string;
      fileSizeBytes?: number;
      mimeType?: string;
      contentText?: string;
    }
  ): Promise<Submission> {
    const response = await api.post<Submission>(`/assignments/${assignmentId}/submit`, data);
    return normalizeSubmission(response.data as any) as unknown as Submission;
  },

  // Binary file upload (real): multipart/form-data, bytes to object storage,
  // metadata in Postgres. Accepts PDF, ZIP, and code/text files.
  async uploadSubmissionFile(assignmentId: string, file: File): Promise<Submission> {
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await api.post<Submission>(`/assignments/${assignmentId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return normalizeSubmission(response.data as any) as unknown as Submission;
  },

  // Instructor grading (real)
  async gradeSubmission(
    submissionId: string,
    data: { grade: number; feedback?: string }
  ): Promise<Submission> {
    const response = await api.put<Submission>(`/submissions/${submissionId}/grade`, data);
    return normalizeSubmission(response.data as any) as unknown as Submission;
  },

  // List/detail endpoints (real — Phase 4B backend additions)
  async listCourseAssignments(courseId: string): Promise<{ data: Assignment[] }> {
    const response = await api.get<{ data: Assignment[] }>(`/courses/${courseId}/assignments`);
    return { data: normalizePage(response.data, (r) => normalizeAssignment(r)).data } as unknown as { data: Assignment[] };
  },

  async getAssignmentById(assignmentId: string): Promise<Assignment> {
    const response = await api.get<Assignment>(`/assignments/${assignmentId}`);
    return normalizeAssignment(response.data as any) as unknown as Assignment;
  },

  async getMySubmission(assignmentId: string): Promise<Submission> {
    const response = await api.get<Submission>(`/assignments/${assignmentId}/my-submission`);
    return normalizeSubmission(response.data as any) as unknown as Submission;
  },

  async listAssignmentSubmissions(assignmentId: string): Promise<{ data: Submission[] }> {
    const response = await api.get<{ data: Submission[] }>(`/assignments/${assignmentId}/submissions`);
    return { data: normalizePage(response.data, (r) => normalizeSubmission(r)).data } as unknown as { data: Submission[] };
  },
};
