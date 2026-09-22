import { api } from './api';
import { normalizeRecommendation } from '@/utils/model';
import {
  ChatSession,
  ChatMessage,
  AIMode,
  LectureSummary,
  AIQuizDraft,
  Flashcard,
  StudyPlan,
  Mastery,
  Recommendation,
} from '@/types';

export const aiService = {
  // Pre-warm the AI service when the Tutor page opens (bounded, background).
  // 60s budget: a cold free-tier instance needs 30-60s to boot, and the
  // warmup runs while the user reads the page — never blocking send.
  async warmup(): Promise<{ warm: boolean }> {
    const response = await api.get<{ warm: boolean }>('/ai/warmup', { timeout: 65000 });
    return response.data;
  },

  // AI Tutor — session + messages (real endpoints)
  async createChatSession(courseId: string, mode?: AIMode): Promise<ChatSession> {
    const response = await api.post<ChatSession>('/ai/chat/sessions', { courseId, mode });
    return response.data;
  },

  async updateSessionMode(sessionId: string, mode: AIMode): Promise<ChatSession> {
    const response = await api.put<ChatSession>(`/ai/chat/sessions/${sessionId}/mode`, { mode });
    return response.data;
  },

  async sendMessage(
    sessionId: string,
    content: string,
    topK?: number
  ): Promise<ChatMessage> {
    // Bounded client timeout aligned with the backend budget (100s per
    // attempt + one cold-retry ≈ up to ~210s worst case on a cold free-tier
    // instance; warm answers land in ~20-40s). 220s client abort guarantees
    // EVERY request settles; the page safety net shows the
    // "waking" state well before this fires.
    const response = await api.post<ChatMessage>(
      `/ai/chat/sessions/${sessionId}/messages`,
      { content, topK },
      { timeout: 220000 }
    );
    return response.data;
  },

  async getSessionMessages(sessionId: string): Promise<{ data: ChatMessage[] }> {
    const response = await api.get<{ data: ChatMessage[] }>(`/ai/chat/sessions/${sessionId}/messages`);
    return response.data;
  },

  // Lecture Summary (real)
  async generateLectureSummary(lectureId: string): Promise<LectureSummary> {
    const response = await api.post<LectureSummary>(`/ai/lectures/${lectureId}/summarize`);
    return response.data;
  },

  // Transcript ingestion (real): lecture material → chunk + embed + pgvector.
  // Powers the tutor, summaries, and AI quiz drafts for the lecture.
  async ingestTranscript(lectureId: string, transcript: string): Promise<{ lectureId: string; courseId: string; chunks: number }> {
    const response = await api.post(`/ai/lectures/${lectureId}/transcript`, { transcript });
    return response.data;
  },

  // AI Quiz Generation (Instructor, real)
  async generateQuizDraft(lectureId: string, count = 5): Promise<AIQuizDraft> {
    const response = await api.post<AIQuizDraft>(`/ai/lectures/${lectureId}/generate-quiz`, {
      count,
    });
    return response.data;
  },

  async getQuizDrafts(courseId?: string): Promise<{ data: AIQuizDraft[] }> {
    const query = courseId ? `?courseId=${courseId}` : '';
    const response = await api.get<{ data: AIQuizDraft[] }>(`/ai/quiz-drafts${query}`);
    return response.data;
  },

  async approveQuizDraft(draftId: string): Promise<{ draftId: string; status: string; quizId: string }> {
    const response = await api.post<{ draftId: string; status: string; quizId: string }>(
      `/ai/quiz-drafts/${draftId}/approve`
    );
    return response.data;
  },

  async rejectQuizDraft(draftId: string): Promise<{ draftId: string; status: string }> {
    const response = await api.post<{ draftId: string; status: string }>(
      `/ai/quiz-drafts/${draftId}/reject`
    );
    return response.data;
  },

  // Flashcards (real): backend returns { moduleId, flashcards: [{id, front, back}] }
  async generateModuleFlashcards(moduleId: string): Promise<{ data: Flashcard[] }> {
    const response = await api.post<{ data: Flashcard[] }>(`/ai/modules/${moduleId}/flashcards`);
    const body = response.data as any;
    const cards = Array.isArray(body?.flashcards) ? body.flashcards : Array.isArray(body?.data) ? body.data : [];
    return { data: cards };
  },

  // Study Plan (real): backend returns the saved row with nested `plan`
  async generateStudyPlan(courseId: string): Promise<StudyPlan & { plan?: any }> {
    const response = await api.post<StudyPlan>('/ai/study-plan', { courseId });
    return response.data;
  },

  // Mastery (real)
  async getCourseMastery(courseId: string): Promise<Mastery> {
    const response = await api.get<Mastery>(`/ai/mastery/${courseId}`);
    return response.data;
  },

  // Recommendations (real): rows carry course_id snake_case — normalized
  async getRecommendations(): Promise<{ data: Recommendation[] }> {
    const response = await api.get<{ data: Recommendation[] }>('/recommendations/me');
    const body = response.data as any;
    const rows = Array.isArray(body?.data) ? body.data : [];
    return { data: rows.map((r: any, i: number) => normalizeRecommendation(r, i)) } as unknown as { data: Recommendation[] };
  },
};
