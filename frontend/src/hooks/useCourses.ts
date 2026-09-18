import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { courseService } from '@/services/courseService';
import { CourseFilters } from '@/types';

export const useCourses = (filters?: CourseFilters) => {
  return useQuery({
    queryKey: ['courses', filters],
    queryFn: () => courseService.getCourses(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useCourse = (id: string | undefined) => {
  return useQuery({
    queryKey: ['course', id],
    queryFn: () => courseService.getCourse(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
};

export const useEnrollCourse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (courseId: string) => courseService.enrollCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useCreateCourse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: courseService.createCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useUpdateCourse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      courseService.updateCourse(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['course', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useInstructorCourses = () => {
  return useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => courseService.getInstructorCourses(),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateModule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, data }: { courseId: string; data: { title: string; sortOrder?: number } }) =>
      courseService.createModule(courseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['course', variables.courseId] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useCreateLecture = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      moduleId,
      data,
    }: {
      moduleId: string;
      courseId?: string;
      data: { title: string; sortOrder?: number; videoKey?: string; durationS?: number };
    }) => courseService.createLecture(moduleId, data),
    onSuccess: (_, variables) => {
      if (variables.courseId) {
        queryClient.invalidateQueries({ queryKey: ['course', variables.courseId] });
      }
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useCourseAnalytics = (courseId: string | undefined) => {
  return useQuery({
    queryKey: ['courseAnalytics', courseId],
    queryFn: () => courseService.getCourseAnalytics(courseId!),
    enabled: !!courseId,
    staleTime: 60 * 1000,
  });
};

export const useVideoUrl = (lectureId: string | undefined) => {
  return useQuery({
    queryKey: ['videoUrl', lectureId],
    queryFn: () => courseService.getLectureVideoUrl(lectureId!),
    enabled: !!lectureId,
    staleTime: 8 * 60 * 1000, // signed URLs live ~15 min; refresh before expiry
    retry: false,
  });
};
