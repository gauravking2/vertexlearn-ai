import { api } from './api';
import { Quiz, QuizAttempt, QuizQuestionType } from '@/types';
import { normalizeQuiz, normalizeAttemptResult, normalizePage } from '@/utils/model';

export const quizService = {
  // Student endpoints (real). Attempt rows carry `questions` with
  // snake_case options (option_text) — normalized here so the attempt UI
  // never renders blank options.
  async startAttempt(quizId: string): Promise<QuizAttempt & { questions?: any[] }> {
    const response = await api.post<QuizAttempt>(`/quizzes/${quizId}/attempt`);
    const body = response.data as any;
    if (Array.isArray(body?.questions)) {
      body.questions = body.questions.map((q: any) => ({
        ...q,
        options: Array.isArray(q.options)
          ? q.options.map((o: any) => ({ ...o, optionText: o.optionText ?? o.option_text ?? o.text }))
          : q.options,
      }));
    }
    return response.data;
  },

  async submitAttempt(
    attemptId: string,
    answers: Array<{
      questionId: string;
      selectedOptionIds?: string[];
      answerText?: string;
    }>
  ): Promise<{ score: number; maxScore: number; status: string }> {
    const response = await api.post<QuizAttempt>(`/attempts/${attemptId}/submit`, {
      answers,
    });
    return normalizeAttemptResult(response.data as any);
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
  // Options arrive snake_case (option_text) and are normalized to camelCase.
  async listCourseQuizzes(courseId: string): Promise<{ data: Quiz[] }> {
    const response = await api.get<{ data: Quiz[] }>(`/courses/${courseId}/quizzes`);
    return { data: normalizePage(response.data, (r) => normalizeQuiz(r)).data } as unknown as { data: Quiz[] };
  },

  async getQuizById(quizId: string): Promise<Quiz> {
    const response = await api.get<Quiz>(`/quizzes/${quizId}`);
    return normalizeQuiz(response.data as any) as unknown as Quiz;
  },

  // Single attempt read (owner only, server-enforced) for result deep-links.
  async getAttemptById(attemptId: string): Promise<{
    id: string; quizId: string; courseId: string; quizTitle: string;
    status: string; score: number | null; maxScore: number | null;
    submittedAt?: string; answers: any[];
  }> {
    const response = await api.get(`/attempts/${attemptId}`);
    const b = response.data as any;
    return {
      id: b.id,
      quizId: b.quiz_id,
      courseId: b.course_id,
      quizTitle: b.quiz_title ?? 'Quiz',
      status: b.status,
      score: typeof b.score === 'number' ? b.score : null,
      maxScore: typeof b.max_score === 'number' ? b.max_score : null,
      submittedAt: b.submitted_at,
      answers: Array.isArray(b.answers) ? b.answers : [],
    };
  },
};
