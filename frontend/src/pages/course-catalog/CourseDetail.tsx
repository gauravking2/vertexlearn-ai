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
import { BookOpen, Clock, BarChart3, Award, PlayCircle } from 'lucide-react';

export const CourseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(id);
  const { data: enrollments } = useEnrollments();
  const { mutate: enroll, isPending: enrolling } = useEnrollCourse();

  if (isLoading) {
    return <LoadingSpinner text="Loading course..." />;
  }

  if (!course) {
    return (
      <Card>
        <p className="text-center text-[#5C635D] py-12">Course not found</p>
      </Card>
    );
  }

  const handleEnroll = () => {
    enroll(course.id, {
      onSuccess: () => {
        navigate(`/courses/${course.id}`);
      },
    });
  };

  // Enrollment is derived from GET /enrollments/me (the backend course detail
  // does not embed isEnrolled/progress/enrollmentCount).
  const enrollment = enrollments?.data?.find((e) => e.courseId === course.id);
  const isEnrolled = !!enrollment;
  const progressPercent = enrollment?.progressPercent ?? 0;
  const firstLecture = course.modules?.[0]?.lectures?.[0];

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative">
        {course.thumbnailUrl && (
          <div className="w-full h-80 rounded-2xl overflow-hidden mb-6">
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="absolute top-6 left-6">
          <span className="px-3 py-1 bg-[#F2E3D6] dark:bg-[#2c241c] text-[#A94E22] dark:text-[#e8a06f] text-xs font-medium rounded-full">
            {course.category}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-4xl font-serif font-normal tracking-tight text-[#1F2421] mb-4">
              {course.title}
            </h1>
            <p className="text-lg text-[#5C635D]">{course.description}</p>
            {typeof course.avg_rating === 'number' && (course.rating_count ?? 0) > 0 && (
              <p className="text-sm text-[#5C635D] mt-2">
                ★ {course.avg_rating.toFixed(1)} ({course.rating_count} review{course.rating_count === 1 ? '' : 's'})
              </p>
            )}
          </div>

          {/* Course Info */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-[#5C635D]">
              <BarChart3 size={16} className="text-[#C4612F]" />
              <span>{course.difficulty}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#5C635D]">
              <Clock size={16} className="text-[#C4612F]" />
              <span>{course.duration || 'Self-paced'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#5C635D]">
              <BookOpen size={16} className="text-[#C4612F]" />
              <span>
                {course.modules?.reduce((acc, mod) => acc + (mod.lectures?.length || 0), 0) || 0}{' '}
                lectures
              </span>
            </div>
            {course.certificateOffered && (
              <div className="flex items-center gap-2 text-sm text-[#5C635D]">
                <Award size={16} className="text-[#C4612F]" />
                <span>Certificate included</span>
              </div>
            )}
          </div>

          {/* Instructor */}
          {course.instructor && (
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] mb-2">Instructor</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#F2E3D6] rounded-full flex items-center justify-center">
                  <span className="text-[#A94E22] dark:text-[#e8a06f] font-medium">
                    {course.instructor.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[#1F2421]">{course.instructor.name}</p>
                  <p className="text-sm text-[#5C635D]">{course.instructor.email}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Course Content */}
          {course.modules && course.modules.length > 0 && (
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] mb-4">Course Content</h3>
              <div className="space-y-3">
                {course.modules.map((module, idx) => (
                  <div key={module.id} className="border-b border-[#E7E1D7] last:border-b-0 pb-3 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-[#1F2421]">
                        {idx + 1}. {module.title}
                      </h4>
                      <Badge variant="neutral">{module.lectures?.length || 0} lectures</Badge>
                    </div>
                    {module.description && (
                      <p className="text-sm text-[#5C635D] mb-2">{module.description}</p>
                    )}
                    {isEnrolled && module.lectures && (
                      <ul className="ml-4 space-y-1">
                        {module.lectures.map((lecture) => (
                          <li key={lecture.id} className="text-sm text-[#5C635D] flex items-center gap-2">
                            <PlayCircle size={14} className="text-[#C4612F]" />
                            <Link
                              to={`/courses/${course.id}/play/${lecture.id}`}
                              className="hover:text-[#C4612F] hover:underline"
                            >
                              {lecture.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
          {isEnrolled && (
            <AnnouncementList
              courseId={course.id}
              instructorId={(course as any).instructor_id ?? course.instructorId}
            />
          )}
          <CourseReviews courseId={course.id} canReview={isEnrolled} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {isEnrolled && id && <MasteryCard courseId={id} />}
          <Card>
            {isEnrolled ? (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-[#F2E3D6] rounded-full flex items-center justify-center mx-auto mb-3">
                    <Award className="text-[#C4612F]" size={28} />
                  </div>
                  <p className="text-sm text-[#5C635D] mb-2">You're enrolled</p>
                  <p className="text-2xl font-serif text-[#1F2421]">{progressPercent}%</p>
                  <p className="text-xs text-[#5C635D]">Complete</p>
                </div>
                {firstLecture && (
                  <Button
                    fullWidth
                    onClick={() => navigate(`/courses/${course.id}/play/${firstLecture.id}`)}
                  >
                    <PlayCircle size={18} />
                    {progressPercent > 0 ? 'Continue Learning' : 'Start Course'}
                  </Button>
                )}
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => navigate(`/ai-tutor/${course.id}`)}
                >
                  AI Tutor
                </Button>
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
                  <p className="text-sm text-[#5C635D] mb-2">Ready to start learning?</p>
                </div>
                <Button fullWidth onClick={handleEnroll} loading={enrolling}>
                  Enroll Now
                </Button>
              </div>
            )}
          </Card>

          {course.certificateOffered && (
            <Card>
              <div className="flex items-start gap-3">
                <Award className="text-[#C4612F] mt-0.5" size={20} />
                <div>
                  <h4 className="font-medium text-[#1F2421] mb-1">Earn a Certificate</h4>
                  <p className="text-sm text-[#5C635D]">
                    Complete all requirements to earn your certificate
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
