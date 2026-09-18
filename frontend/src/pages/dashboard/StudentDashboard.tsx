import { useEnrollments, useGamificationStats, useCertificates } from '@/hooks/useLearning';
import { useRecommendations } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Link } from 'react-router-dom';
import { BookOpen, Award, TrendingUp, Flame, PlayCircle } from 'lucide-react';
import type { Enrollment } from '@/types';

export const StudentDashboard = () => {
  const { data: enrollments, isLoading: loadingEnrollments } = useEnrollments();
  const { data: gamification, isLoading: loadingGamification } = useGamificationStats();
  const { data: certificates } = useCertificates();
  const { data: recommendations } = useRecommendations();

  if (loadingEnrollments || loadingGamification) {
    return <LoadingSpinner text="Loading your dashboard..." />;
  }

  const activeCourses = enrollments?.data?.filter((e: Enrollment) => (e.progressPercent || 0) < 100) || [];
  const completedCourses = enrollments?.data?.filter((e: Enrollment) => (e.progressPercent || 0) === 100) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          Your <span className="italic text-[#C4612F]">Learning</span> Journey
        </h1>
        <p className="text-[#5C635D]">Continue where you left off</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <BookOpen className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{activeCourses.length}</p>
              <p className="text-xs text-[#5C635D]">Active Courses</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Award className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{certificates?.data?.length || 0}</p>
              <p className="text-xs text-[#5C635D]">Certificates</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Flame className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{gamification?.currentStreak || 0}</p>
              <p className="text-xs text-[#5C635D]">Day Streak</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <TrendingUp className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <p className="text-2xl font-serif text-[#1F2421]">{gamification?.badges?.length || 0}</p>
              <p className="text-xs text-[#5C635D]">Badges Earned</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Courses */}
      {activeCourses.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">Continue Learning</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeCourses.slice(0, 4).map((enrollment: Enrollment) => (
              <Card key={enrollment.id} hover>
                <Link to={`/courses/${enrollment.courseId}`}>
                  <div className="flex items-start gap-4">
                    {enrollment.course?.thumbnailUrl && (
                      <img
                        src={enrollment.course.thumbnailUrl}
                        alt={enrollment.course.title}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium text-[#1F2421] mb-1">
                        {enrollment.course?.title}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="neutral">{enrollment.course?.category}</Badge>
                        <Badge variant="primary">{enrollment.course?.difficulty}</Badge>
                      </div>
                      <ProgressBar progress={enrollment.progressPercent} showLabel />
                    </div>
                  </div>
                  {enrollment.lastAccessedLectureId && (
                    <div className="mt-3 pt-3 border-t border-[#E7E1D7]">
                      <Button
                        size="sm"
                        variant="ghost"
                        as={Link}
                        to={`/courses/${enrollment.courseId}/play/${enrollment.lastAccessedLectureId}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PlayCircle size={16} />
                        Resume
                      </Button>
                    </div>
                  )}
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.data.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">
            Recommended <span className="italic text-[#C4612F]">for you</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.data.slice(0, 3).map((rec: any) => (
              <Card key={rec.courseId} hover>
                <Link to={`/courses/${rec.courseId}`}>
                  {rec.thumbnailUrl && (
                    <img
                      src={rec.thumbnailUrl}
                      alt={rec.title}
                      className="w-full h-40 object-cover rounded-lg mb-3"
                    />
                  )}
                  <h3 className="font-medium text-[#1F2421] mb-2">{rec.title}</h3>
                  <p className="text-sm text-[#5C635D] mb-3">{rec.reason}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{rec.category}</Badge>
                    <Badge variant="primary">{rec.difficulty}</Badge>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedCourses.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">Completed Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {completedCourses.slice(0, 3).map((enrollment) => (
              <Card key={enrollment.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="text-[#C4612F]" size={18} />
                  <h3 className="font-medium text-[#1F2421]">
                    {enrollment.course?.title}
                  </h3>
                </div>
                <p className="text-sm text-[#5C635D] mb-3">Completed</p>
                <Link to={`/courses/${enrollment.courseId}`}>
                  <Button size="sm" variant="outline" fullWidth>
                    View Course
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {activeCourses.length === 0 && completedCourses.length === 0 && (
        <Card>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#F2E3D6] rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="text-[#C4612F]" size={28} />
            </div>
            <h3 className="text-xl font-serif text-[#1F2421] mb-2">Start Your Learning Journey</h3>
            <p className="text-[#5C635D] mb-6">Explore courses and enroll to begin</p>
            <Link to="/courses">
              <Button>Browse Courses</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
};
