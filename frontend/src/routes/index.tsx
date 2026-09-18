import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { authStore } from '@/store/authStore';

// Layouts
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';

// Auth Pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';

// Student Pages
import { StudentDashboard } from '@/pages/dashboard/StudentDashboard';
import { CourseCatalog } from '@/pages/course-catalog/CourseCatalog';
import { CourseDetail } from '@/pages/course-catalog/CourseDetail';
import { CoursePlayer } from '@/pages/course-player/CoursePlayer';
import { AssignmentsPage } from '@/pages/assignments/AssignmentsPage';
import { MyAssignmentsPage } from '@/pages/assignments/MyAssignmentsPage';
import { AssignmentDetail } from '@/pages/assignments/AssignmentDetail';
import { QuizzesPage } from '@/pages/quizzes/QuizzesPage';
import { MyQuizzesPage } from '@/pages/quizzes/MyQuizzesPage';
import { QuizAttempt } from '@/pages/quizzes/QuizAttempt';
import { QuizResult } from '@/pages/quizzes/QuizResult';
import { CertificatesPage } from '@/pages/certificates/CertificatesPage';
import { AITutorPage } from '@/pages/ai-tutor/AITutorPage';
import { AITutorIndexPage } from '@/pages/ai-tutor/AITutorIndexPage';
import { StudyPlanPage } from '@/pages/study-plan/StudyPlanPage';
import { FlashcardsPage } from '@/pages/flashcards/FlashcardsPage';

// Instructor Pages
import { InstructorDashboard } from '@/pages/instructor/InstructorDashboard';
import { CourseManagement } from '@/pages/instructor/CourseManagement';
import { CreateCourse } from '@/pages/instructor/CreateCourse';
import { EditCourse } from '@/pages/instructor/EditCourse';
import { QuizManagement } from '@/pages/instructor/QuizManagement';
import { AIQuizReview } from '@/pages/instructor/AIQuizReview';
import { SubmissionReview } from '@/pages/instructor/SubmissionReview';
import { InstructorAssignments } from '@/pages/instructor/InstructorAssignments';
import { InstructorAnalytics } from '@/pages/instructor/InstructorAnalytics';
import { InstructorCoursePicker } from '@/pages/instructor/InstructorCoursePicker';

// Error Pages
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { UnauthorizedPage } from '@/pages/errors/UnauthorizedPage';

// Admin Pages (Phase 5: dedicated admin workspace)
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { UserManagement } from '@/pages/admin/UserManagement';
import { CourseApprovals } from '@/pages/admin/CourseApprovals';
import { PlatformAnalytics } from '@/pages/admin/PlatformAnalytics';
import { ModerationQueue } from '@/pages/admin/ModerationQueue';
import { RevenuePage } from '@/pages/admin/RevenuePage';

// Discussion Pages (Phase 5)
import { CourseDiscussions } from '@/pages/discussions/CourseDiscussions';
import { ThreadView } from '@/pages/discussions/ThreadView';

// Notifications (Phase 5)
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';

const RootRedirect = () => {
  const { isAuthenticated } = authStore();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

export const AppRoutes = () => {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Common dashboard redirect */}
        <Route path="/dashboard" element={<StudentDashboard />} />

        {/* Student routes */}
        <Route path="/courses" element={<CourseCatalog />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/courses/:courseId/play/:lectureId" element={<CoursePlayer />} />
        <Route path="/courses/:courseId/assignments" element={<AssignmentsPage />} />
        <Route path="/assignments" element={<MyAssignmentsPage />} />
        <Route path="/assignments/:id" element={<AssignmentDetail />} />
        <Route path="/courses/:courseId/quizzes" element={<QuizzesPage />} />
        <Route path="/quizzes" element={<MyQuizzesPage />} />
        <Route path="/quizzes/:id/attempt" element={<QuizAttempt />} />
        <Route path="/quiz-attempts/:id/result" element={<QuizResult />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/courses/:courseId/discussions" element={<CourseDiscussions />} />
        <Route path="/courses/:courseId/discussions/:threadId" element={<ThreadView />} />
        <Route path="/ai-tutor" element={<AITutorIndexPage />} />
        <Route path="/ai-tutor/:courseId" element={<AITutorPage />} />
        <Route path="/study-plan/:courseId" element={<StudyPlanPage />} />
        <Route path="/flashcards/:moduleId" element={<FlashcardsPage />} />

        {/* Instructor routes (admins inherit instructor UX; role routing is
            UX-only — backend authorization remains authoritative) */}
        <Route
          path="/instructor"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <CourseManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses/new"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <CreateCourse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses/:id/edit"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <EditCourse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses/:id/quizzes"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <QuizManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/assignments"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorCoursePicker
                title="Assignments"
                description="Pick a course to manage its assignments and grade submissions."
                linkTo={(courseId) => `/instructor/courses/${courseId}/assignments`}
                linkLabel="Manage assignments"
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/quizzes"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorCoursePicker
                title="Quizzes"
                description="Pick a course to manage its quizzes and questions."
                linkTo={(courseId) => `/instructor/courses/${courseId}/quizzes`}
                linkLabel="Manage quizzes"
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/analytics"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorCoursePicker
                title="Analytics"
                description="Pick a course to see enrollment, engagement, and quiz performance."
                linkTo={(courseId) => `/instructor/courses/${courseId}/analytics`}
                linkLabel="View analytics"
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/announcements"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorCoursePicker
                title="Announcements"
                description="Pick a course to publish announcements to enrolled students."
                linkTo={(courseId) => `/courses/${courseId}`}
                linkLabel="Open course announcements"
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/quiz-drafts"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <AIQuizReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/assignments/:id/submissions"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <SubmissionReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses/:id/assignments"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorAssignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instructor/courses/:id/analytics"
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
              <InstructorAnalytics />
            </ProtectedRoute>
          }
        />

        {/* Admin workspace (backend authorization remains authoritative) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/courses/pending"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <CourseApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <PlatformAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/moderation"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <ModerationQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/revenue"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <RevenuePage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Error routes */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
