import { api } from './api';
import { Assignment, Submission } from '@/types';

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
    return response.data;
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
    return response.data;
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
    return response.data;
  },

  // Binary file upload (real): multipart/form-data, bytes to object storage,
  // metadata in Postgres. Accepts PDF, ZIP, and code/text files.
  async uploadSubmissionFile(assignmentId: string, file: File): Promise<Submission> {
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await api.post<Submission>(`/assignments/${assignmentId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Instructor grading (real)
  async gradeSubmission(
    submissionId: string,
    data: { grade: number; feedback?: string }
  ): Promise<Submission> {
    const response = await api.put<Submission>(`/submissions/${submissionId}/grade`, data);
    return response.data;
  },

  // List/detail endpoints (real — Phase 4B backend additions)
  async listCourseAssignments(courseId: string): Promise<{ data: Assignment[] }> {
    const response = await api.get<{ data: Assignment[] }>(`/courses/${courseId}/assignments`);
    return response.data;
  },

  async getAssignmentById(assignmentId: string): Promise<Assignment> {
    const response = await api.get<Assignment>(`/assignments/${assignmentId}`);
    return response.data;
  },

  async getMySubmission(assignmentId: string): Promise<Submission> {
    const response = await api.get<Submission>(`/assignments/${assignmentId}/my-submission`);
    return response.data;
  },

  async listAssignmentSubmissions(assignmentId: string): Promise<{ data: Submission[] }> {
    const response = await api.get<{ data: Submission[] }>(`/assignments/${assignmentId}/submissions`);
    return response.data;
  },
};
