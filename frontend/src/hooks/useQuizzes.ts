import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quizService } from '@/services/quizService';

export const useCourseQuizzes = (courseId: string | undefined) => {
  return useQuery({
    queryKey: ['quizzes', 'course', courseId],
    queryFn: () => quizService.listCourseQuizzes(courseId!),
    enabled: !!courseId,
    staleTime: 60 * 1000,
  });
};

export const useQuiz = (quizId: string | undefined) => {
  return useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => quizService.getQuizById(quizId!),
    enabled: !!quizId,
    staleTime: 60 * 1000,
  });
};

export const useStartQuizAttempt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quizId: string) => quizService.startAttempt(quizId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizAttempts'] });
    },
  });
};

export const useSubmitQuizAttempt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ attemptId, answers }: { attemptId: string; answers: any }) =>
      quizService.submitAttempt(attemptId, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizAttempts'] });
    },
  });
};

export const useCreateQuiz = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => quizService.createQuiz(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });
};
