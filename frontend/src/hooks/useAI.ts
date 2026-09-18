import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '@/services/aiService';
import { AIMode } from '@/types';

export const useCreateChatSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, mode }: { courseId: string; mode: AIMode }) =>
      aiService.createChatSession(courseId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] });
    },
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, message }: { sessionId: string; message: string }) =>
      aiService.sendMessage(sessionId, message),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chatSession', variables.sessionId] });
    },
  });
};

export const useSessionMessages = (sessionId: string | undefined) => {
  return useQuery({
    queryKey: ['chatSession', sessionId],
    queryFn: () => aiService.getSessionMessages(sessionId!),
    enabled: !!sessionId,
    staleTime: 30 * 1000,
  });
};

export const useUpdateSessionMode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, mode }: { sessionId: string; mode: AIMode }) =>
      aiService.updateSessionMode(sessionId, mode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chatSession', variables.sessionId] });
    },
  });
};

export const useGenerateLectureSummary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lectureId: string) => aiService.generateLectureSummary(lectureId),
    onSuccess: (_, lectureId) => {
      queryClient.invalidateQueries({ queryKey: ['lectureSummary', lectureId] });
    },
  });
};

export const useIngestTranscript = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lectureId, transcript }: { lectureId: string; transcript: string }) =>
      aiService.ingestTranscript(lectureId, transcript),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizDrafts'] });
    },
  });
};

export const useQuizDrafts = (courseId?: string) => {
  return useQuery({
    queryKey: ['quizDrafts', courseId],
    queryFn: () => aiService.getQuizDrafts(courseId),
    staleTime: 60 * 1000,
  });
};

export const useGenerateQuizDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lectureId, count }: { lectureId: string; count?: number }) =>
      aiService.generateQuizDraft(lectureId, count ?? 5),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizDrafts'] });
    },
  });
};

export const useApproveQuizDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) => aiService.approveQuizDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizDrafts'] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });
};

export const useRejectQuizDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) => aiService.rejectQuizDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizDrafts'] });
    },
  });
};

export const useGenerateFlashcards = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (moduleId: string) => aiService.generateModuleFlashcards(moduleId),
    onSuccess: (_, moduleId) => {
      queryClient.invalidateQueries({ queryKey: ['moduleFlashcards', moduleId] });
    },
  });
};

export const useGenerateStudyPlan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (courseId: string) => aiService.generateStudyPlan(courseId),
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: ['studyPlan', courseId] });
    },
  });
};

export const useCourseMastery = (courseId: string | undefined) => {
  return useQuery({
    queryKey: ['courseMastery', courseId],
    queryFn: () => aiService.getCourseMastery(courseId!),
    enabled: !!courseId,
    staleTime: 60 * 1000,
  });
};

export const useRecommendations = () => {
  return useQuery({
    queryKey: ['recommendations'],
    queryFn: () => aiService.getRecommendations(),
    staleTime: 2 * 60 * 1000,
  });
};
