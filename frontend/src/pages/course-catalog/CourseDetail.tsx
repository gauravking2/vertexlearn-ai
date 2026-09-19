import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCourse, useEnrollCourse } from '@/hooks/useCourses';
import { useEnrollments } from '@/hooks/useLearning';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { MasteryCard } from '@/components/ai/MasteryCard';
import { AnnouncementList } from '@/components/announcements/AnnouncementList';
import { CourseReviews } from '@/components/reviews/CourseReviews';
import { authStore } from '@/store/authStore';
import { getApiErrorMessage } from '@/components/common/apiError';
import { BookOpen, Clock, BarChart3, Award, PlayCircle, Users, Star } from 'lucide-react';
import { categoryCover, safePercent, displayPercent, validId } from '@/utils/model';

export const CourseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading, isError, error, refetch } = useCourse(id);
  const { data: enrollments } = useEnrollments();
  const { mutate: enroll, isPending: enrolling } = useEnrollCourse();
  const { user } = authStore();
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingSpinner text="Loading course..." />;
  }

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }

  if (!course || !validId((course as any)?.id)) {
    return (
      <Card>
        <p className="text-center text-[#5C635D] py-12">Course not found</p>
        <div className="text-center">
          <Button variant="outline" size="sm" as={Link} to="/courses">Back to catalog</Button>
        </div>
      </Card>
    );
  }

  const handleEnroll = () => {
    setEnrollError(null);
    setEnrollNotice(null);
    enroll(course.id, {
      onSuccess: () => {
        navigate(`/courses/${course.id}`);
      },
      onError: (e: any) => {
        const status = e?.response?.status;
        const message = getApiErrorMessage(e);
        if (status === 409) {
          // Already enrolled: refresh state and say so instead of breaking.
          setEnrollNotice('You are already enrolled in this course.');
        } else {
          setEnrollError(message || 'Enrollment failed. Please try again.');
        }
      },
    });
  };

  // Enrollment is derived from GET /enrollments/me (normalized camelCase).
  const enrollment = enrollments?.data?.find((e: any) => e.courseId === course.id);
  const isEnrolled = !!enrollment;
  // Owners/admins manage announcements from this page without enrolling.
  const isOwner =
    !!user &&
    (user.roles.includes('admin') || (course as any).instructorId === user.id);
  const canSeeAnnouncements = isEnrolled || isOwner;
  const progressPercent = safePercent((enrollment as any)?.progressPercent ?? 0);
  const firstLecture = course.modules?.[0]?.lectures?.[0];
  const firstModule = course.modules?.[0];
  const lectureCount = course.modules?.reduce((acc: number, mod: any) => acc + (mod.lectures?.length || 0), 0) || 0;
  const rating = Number((course as any).avgRating ?? 0);
  const ratingCount = Number((course as any).ratingCount ?? 0);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden shadow-lift animate-fade-up">
        <div className="h-56 sm:h-72 p-6 sm:p-8 flex flex-col justify-end relative" style={{ background: categoryCover(course.category) }}>
          <div className="absolute inset-0 opacity-35" aria-hidden="true" style={{ background: 'radial-gradient(500px 180px at 85% 0%, rgba(255,255,255,0.30), transparent)' }} />
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {course.category && (
              <span className="px-3 py-1 bg-black/25 text-white text-xs font-medium rounded-full border border-white/20 backdrop-blur-sm">
                {course.category}
              </span>
            )}
            {course.difficulty && (
              <span className="px-3 py-1 bg-black/25 text-white text-xs font-medium rounded-full border border-white/20 backdrop-blur-sm capitalize">
                {course.difficulty}
              </span>
            )}
            {ratingCount > 0 && (
              <span className="px-3 py-1 bg-black/25 text-white text-xs font-medium rounded-full border border-white/20 backdrop-blur-sm inline-flex items-center gap-1">
                <Star size={11} aria-hidden="true" /> {rating.toFixed(1)} ({ratingCount})
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-white mb-2">
            {course.title}
          </h1>
          <p className="text-white/85 max-w-2xl line-clamp-2">{course.description || 'No description yet.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Course Info */}
          <Card>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <BarChart3 size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span className="capitalize">{course.difficulty || 'Beginner'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <Clock size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span>{course.duration || 'Self-paced'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <BookOpen size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span>{lectureCount} lecture{lectureCount === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <Users size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span>{course.enrollmentCount || 0} enrolled</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <Award size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span>Certificate on completion</span>
              </div>
            </div>
          </Card>

          {/* Instructor */}
          {(course as any).instructorName && (
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">Instructor</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-[#F2E3D6] to-[#EAD3BE] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] rounded-full flex items-center justify-center" aria-hidden="true">
                  <span className="text-[#8A3E1C] dark:text-[#e8a06f] font-medium">
                    {String((course as any).instructorName).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{(course as any).instructorName}</p>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Course instructor</p>
                </div>
              </div>
            </Card>
          )}

          {/* Course Content */}
          {course.modules && course.modules.length > 0 ? (
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4">Course Content</h3>
              <div className="space-y-3">
                {course.modules.map((module: any, idx: number) => (
                  <div key={module.id} className="border-b border-[#E7E1D7] dark:border-[#2c2f2a] last:border-b-0 pb-3 last:pb-0">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <h4 className="font-medium text-[#1F2421] dark:text-[#ece9e2] flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-[#F2E3D6] dark:bg-[#2c241c] text-[#8A3E1C] dark:text-[#e8a06f] inline-flex items-center justify-center text-[10px] font-bold shrink-0" aria-hidden="true">
                          {idx + 1}
                        </span>
                        {module.title}
                      </h4>
                      <Badge variant="neutral">{module.lectures?.length || 0} lectures</Badge>
                    </div>
                    {module.description && (
                      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-2">{module.description}</p>
                    )}
                    {module.lectures && module.lectures.length > 0 ? (
                      <ul className="ml-2 space-y-1">
                        {module.lectures.map((lecture: any) =>
                          lecture?.id ? (
                            <li key={lecture.id} className="text-sm text-[#5C635D] dark:text-[#b9beb4] flex items-center gap-2">
                              <PlayCircle size={14} className="text-[#C4612F] dark:text-[#e8a06f] shrink-0" aria-hidden="true" />
                              {isEnrolled ? (
                                <Link
                                  to={`/courses/${course.id}/play/${lecture.id}`}
                                  className="hover:text-[#C4612F] dark:hover:text-[#e8a06f] hover:underline"
                                >
                                  {lecture.title}
                                </Link>
                              ) : (
                                <span>{lecture.title}</span>
                              )}
                            </li>
                          ) : null
                        )}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] ml-2">Lectures coming soon.</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] text-center py-6">Curriculum is being prepared for this course.</p>
            </Card>
          )}
          {canSeeAnnouncements && (
            <AnnouncementList
              courseId={course.id}
              instructorId={(course as any).instructorId ?? undefined}
            />
          )}
          <CourseReviews courseId={course.id} canReview={isEnrolled} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4 min-w-0 lg:sticky lg:top-24 lg:self-start">
          {isEnrolled && id && <MasteryCard courseId={id} />}
          <Card>
            {isEnrolled ? (
              <div className="space-y-3">
                <div className="text-center py-4 border-b border-[#E7E1D7] dark:border-[#2c2f2a]">
                  <div className="relative inline-block mb-3">
                    <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.12),transparent_70%)]" />
                    <div className="relative w-16 h-16 bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] rounded-full flex items-center justify-center">
                      <Award className="text-[#C4612F] dark:text-[#e8a06f]" size={28} aria-hidden="true" />
                    </div>
                  </div>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-1">You're enrolled</p>
                  <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2]">{displayPercent(progressPercent)}</p>
                  <div className="mt-3 px-2">
                    <ProgressBarInline pct={progressPercent} />
                  </div>
                </div>
                {firstLecture?.id ? (
                  <Button
                    fullWidth
                    onClick={() => navigate(`/courses/${course.id}/play/${firstLecture.id}`)}
                  >
                    <PlayCircle size={18} aria-hidden="true" />
                    {progressPercent > 0 ? 'Continue Learning' : 'Start Course'}
                  </Button>
                ) : (
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] text-center">Lectures coming soon.</p>
                )}
                {isEnrolled && (
                  <Button
                    fullWidth
                    onClick={() => navigate(`/ai-tutor/${course.id}`)}
                    className="vl-ai-chip !bg-none hover:!bg-none"
                  >
                    AI Tutor
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button
                    fullWidth
                    variant="outline"
                    onClick={() => navigate(`/courses/${course.id}/quizzes`)}
                  >
                    Quizzes
                  </Button>
                  <Button
                    fullWidth
                    variant="outline"
                    onClick={() => navigate(`/courses/${course.id}/assignments`)}
                  >
                    Assignments
                  </Button>
                </div>
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => navigate(`/study-plan/${course.id}`)}
                >
                  Study Plan
                </Button>
                {firstModule?.id && (
                  <Button
                    fullWidth
                    variant="outline"
                    onClick={() => navigate(`/flashcards/${firstModule.id}`)}
                  >
                    Flashcards
                  </Button>
                )}
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => navigate(`/courses/${course.id}/discussions`)}
                >
                  Discussions
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center" aria-hidden="true">
                    <BookOpen className="text-[#C4612F] dark:text-[#e8a06f]" size={24} />
                  </div>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-2">Ready to start learning?</p>
                </div>
                {enrollError && (
                  <p className="text-sm text-red-700 dark:text-red-400" role="alert">{enrollError}</p>
                )}
                {enrollNotice && (
                  <p className="text-sm text-green-700 dark:text-green-400" role="status">{enrollNotice}</p>
                )}
                <Button fullWidth onClick={handleEnroll} loading={enrolling}>
                  Enroll Now
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <Award className="text-[#C4612F] dark:text-[#e8a06f] mt-0.5" size={20} aria-hidden="true" />
              <div>
                <h4 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1">Earn a Certificate</h4>
                <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
                  Complete all requirements to earn your certificate
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Local thin progress bar for the sidebar (visual only; same clamp math).
const ProgressBarInline = ({ pct }: { pct: number }) => (
  <div className="w-full h-2 bg-[#FBF9F5] dark:bg-[#23261f] rounded-full overflow-hidden ring-1 ring-inset ring-[#E7E1D7]/80 dark:ring-[#2c2f2a]">
    <div
      className="h-full bg-gradient-to-r from-[#C4612F] via-[#D3723F] to-[#A94E22] rounded-full transition-all duration-500"
      style={{ width: `${pct}%` }}
    />
  </div>
);
