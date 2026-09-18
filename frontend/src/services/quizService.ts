import { api } from './api';
import { Quiz, QuizAttempt, QuizQuestionType } from '@/types';

export const quizService = {
  // Student endpoints (real)
  async startAttempt(quizId: string): Promise<QuizAttempt> {
    const response = await api.post<QuizAttempt>(`/quizzes/${quizId}/attempt`);
    return response.data;
  },

  async submitAttempt(
    attemptId: string,
    answers: Array<{
      questionId: string;
      selectedOptionIds?: string[];
      answerText?: string;
    }>
  ): Promise<QuizAttempt> {
    const response = await api.post<QuizAttempt>(`/attempts/${attemptId}/submit`, {
      answers,
    });
    return response.data;
  },

  // Instructor endpoints (real)
  async createQuiz(data: {
    courseId: string;
    title: string;
    description?: string;
    questions: Array<{
      type: QuizQuestionType;
      prompt: string;
      points?: number;
      options?: Array<{ text: string; isCorrect: boolean }>;
    }>;
  }): Promise<Quiz> {
    const response = await api.post<Quiz>('/quizzes', data);
    return response.data;
  },

  // List/detail endpoints (real — Phase 4B backend additions).
  // List rows never include correct answers; detail includes isCorrect
  // only when the caller owns the course (enforced server-side).
  async listCourseQuizzes(courseId: string): Promise<{ data: Quiz[] }> {
    const response = await api.get<{ data: Quiz[] }>(`/courses/${courseId}/quizzes`);
    return response.data;
  },

  async getQuizById(quizId: string): Promise<Quiz> {
    const response = await api.get<Quiz>(`/quizzes/${quizId}`);
    return response.data;
  },
};
