import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learningService } from '@/services/learningService';

export const useEnrollments = () => {
  return useQuery({
    queryKey: ['enrollments'],
    queryFn: learningService.getMyEnrollments,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useUpdateLectureProgress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lectureId, data }: { lectureId: string; data: any }) =>
      learningService.updateLectureProgress(lectureId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lectureProgress', variables.lectureId] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });
};

export const useLectureNotes = (lectureId: string | undefined) => {
  return useQuery({
    queryKey: ['lectureNotes', lectureId],
    queryFn: () => learningService.getLectureNotes(lectureId!),
    enabled: !!lectureId,
    staleTime: 60 * 1000,
  });
};

export const useCreateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lectureId, data }: { lectureId: string; data: any }) =>
      learningService.createNote(lectureId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lectureNotes', variables.lectureId] });
    },
  });
};

export const useLectureBookmarks = (lectureId: string | undefined) => {
  return useQuery({
    queryKey: ['lectureBookmarks', lectureId],
    queryFn: () => learningService.getLectureBookmarks(lectureId!),
    enabled: !!lectureId,
    staleTime: 60 * 1000,
  });
};

export const useCreateBookmark = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lectureId, data }: { lectureId: string; data: any }) =>
      learningService.createBookmark(lectureId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lectureBookmarks', variables.lectureId] });
    },
  });
};

export const useCertificates = () => {
  return useQuery({
    queryKey: ['certificates'],
    queryFn: learningService.getMyCertificates,
    staleTime: 5 * 60 * 1000,
  });
};

export const useGamificationStats = () => {
  return useQuery({
    queryKey: ['gamificationStats'],
    queryFn: learningService.getGamificationStats,
    staleTime: 60 * 1000,
  });
};
