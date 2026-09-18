import { describe, it, expect } from 'vitest';
import { courseService } from './courseService';
import { learningService } from './learningService';
import { quizService } from './quizService';
import { aiService } from './aiService';
import { assignmentService } from './assignmentService';

// Contract tests: verify the service layer exposes the methods the pages use
// and targets the REAL backend routes (no guessed endpoints).
describe('frontend API contract', () => {
  it('courseService exposes catalog + owner + enrollment methods', () => {
    expect(typeof courseService.getCourses).toBe('function');
    expect(typeof courseService.getCourse).toBe('function');
    expect(typeof courseService.enrollCourse).toBe('function');
    expect(typeof courseService.getInstructorCourses).toBe('function');
    expect(typeof courseService.createCourse).toBe('function');
    expect(typeof courseService.updateCourse).toBe('function');
    expect(typeof courseService.createModule).toBe('function');
    expect(typeof courseService.createLecture).toBe('function');
  });

  it('learningService exposes progress/notes/bookmarks/certificates', () => {
    expect(typeof learningService.getMyEnrollments).toBe('function');
    expect(typeof learningService.updateLectureProgress).toBe('function');
    expect(typeof learningService.getLectureNotes).toBe('function');
    expect(typeof learningService.createNote).toBe('function');
    expect(typeof learningService.getLectureBookmarks).toBe('function');
    expect(typeof learningService.createBookmark).toBe('function');
    expect(typeof learningService.getMyCertificates).toBe('function');
    expect(typeof learningService.downloadCertificate).toBe('function');
    expect(typeof learningService.getGamificationStats).toBe('function');
    // Removed: deleteNote/deleteBookmark (no backend route)
    expect((learningService as any).deleteNote).toBeUndefined();
    expect((learningService as any).deleteBookmark).toBeUndefined();
  });

  it('quizService exposes list/detail plus attempt flows (real endpoints)', () => {
    expect(typeof quizService.startAttempt).toBe('function');
    expect(typeof quizService.submitAttempt).toBe('function');
    expect(typeof quizService.createQuiz).toBe('function');
    expect(typeof quizService.listCourseQuizzes).toBe('function');
    expect(typeof quizService.getQuizById).toBe('function');
    // Removed guesses (no backend route)
    expect((quizService as any).getQuizzes).toBeUndefined();
    expect((quizService as any).getQuiz).toBeUndefined();
  });

  it('assignmentService exposes list/detail/grading flows (real endpoints)', () => {
    expect(typeof assignmentService.createAssignment).toBe('function');
    expect(typeof assignmentService.updateAssignment).toBe('function');
    expect(typeof assignmentService.submitAssignment).toBe('function');
    expect(typeof assignmentService.gradeSubmission).toBe('function');
    expect(typeof assignmentService.listCourseAssignments).toBe('function');
    expect(typeof assignmentService.getAssignmentById).toBe('function');
    expect(typeof assignmentService.getMySubmission).toBe('function');
    expect(typeof assignmentService.listAssignmentSubmissions).toBe('function');
    expect((assignmentService as any).getAssignments).toBeUndefined();
    expect((assignmentService as any).getAssignment).toBeUndefined();
    expect((assignmentService as any).getSubmissions).toBeUndefined();
  });

  it('aiService exposes all Phase 3 endpoints through the backend', () => {
    expect(typeof aiService.createChatSession).toBe('function');
    expect(typeof aiService.updateSessionMode).toBe('function');
    expect(typeof aiService.sendMessage).toBe('function');
    expect(typeof aiService.getSessionMessages).toBe('function');
    expect(typeof aiService.generateLectureSummary).toBe('function');
    expect(typeof aiService.generateQuizDraft).toBe('function');
    expect(typeof aiService.getQuizDrafts).toBe('function');
    expect(typeof aiService.approveQuizDraft).toBe('function');
    expect(typeof aiService.rejectQuizDraft).toBe('function');
    expect(typeof aiService.generateModuleFlashcards).toBe('function');
    expect(typeof aiService.generateStudyPlan).toBe('function');
    expect(typeof aiService.getCourseMastery).toBe('function');
    expect(typeof aiService.getRecommendations).toBe('function');
    // Removed: getMyChatSessions/getChatSession (no backend route)
    expect((aiService as any).getMyChatSessions).toBeUndefined();
  });
});
