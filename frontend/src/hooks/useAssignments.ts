import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentService } from '@/services/assignmentService';

export const useCourseAssignments = (courseId: string | undefined) => {
  return useQuery({
    queryKey: ['assignments', 'course', courseId],
    queryFn: () => assignmentService.listCourseAssignments(courseId!),
    enabled: !!courseId,
    staleTime: 60 * 1000,
  });
};

export const useAssignment = (assignmentId: string | undefined) => {
  return useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => assignmentService.getAssignmentById(assignmentId!),
    enabled: !!assignmentId,
    staleTime: 60 * 1000,
    retry: false,
  });
};

export const useMySubmission = (assignmentId: string | undefined) => {
  return useQuery({
    queryKey: ['mySubmission', assignmentId],
    queryFn: () => assignmentService.getMySubmission(assignmentId!),
    enabled: !!assignmentId,
    staleTime: 30 * 1000,
    retry: false,
  });
};

export const useAssignmentSubmissions = (assignmentId: string | undefined) => {
  return useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: () => assignmentService.listAssignmentSubmissions(assignmentId!),
    enabled: !!assignmentId,
    staleTime: 30 * 1000,
  });
};

export const useSubmitAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, data }: { assignmentId: string; data: any }) =>
      assignmentService.submitAssignment(assignmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
};

export const useUploadSubmissionFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, file }: { assignmentId: string; file: File }) =>
      assignmentService.uploadSubmissionFile(assignmentId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      queryClient.invalidateQueries({ queryKey: ['mySubmission'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
};

export const useGradeSubmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, data }: { submissionId: string; data: any }) =>
      assignmentService.gradeSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
    },
  });
};

export const useCreateAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => assignmentService.createAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
};

export const useUpdateAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      assignmentService.updateAssignment(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', variables.id] });
    },
  });
};
