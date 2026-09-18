import { Link, useNavigate } from 'react-router-dom';
import { useEnrollments, useGamificationStats, useCertificates } from '@/hooks/useLearning';
import { useRecommendations } from '@/hooks/useAI';
import { useQuery } from '@tanstack/react-query';
import { learningService } from '@/services/learningService';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { BookOpen, Award, TrendingUp, Flame, PlayCircle, ClipboardList, FileQuestion, Bot, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { safePercent, displayPercent, validId, getResumePosition, categoryCover, categoryInitial } from '@/utils/model';

export const StudentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: enrollments, isLoading: loadingEnrollments } = useEnrollments();
  const { data: gamification, isLoading: loadingGamification } = useGamificationStats();
  const { data: certificates } = useCertificates();
  const { data: recommendations } = useRecommendations();
  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => learningService.getLeaderboard(5),
    staleTime: 60 * 1000,
  });

  if (loadingEnrollments || loadingGamification) {
    return <LoadingSpinner text="Loading your dashboard..." />;
  }

  const all = enrollments?.data ?? [];
  const activeCourses = all.filter((e: any) => safePercent(e.progressPercent) < 100 && validId(e.courseId));
  const completedCourses = all.filter((e: any) => safePercent(e.progressPercent) >= 100 && validId(e.courseId));
  const stats = [
    { icon: BookOpen, value: activeCourses.length, label: 'Active Courses' },
    { icon: Award, value: certificates?.data?.length || 0, label: 'Certificates' },
    { icon: Flame, value: gamification?.currentStreak || 0, label: 'Day Streak' },
    { icon: TrendingUp, value: gamification?.badges?.length || 0, label: 'Badges Earned' },
  ];
  const recs = (recommendations?.data ?? []).filter((r: any) => validId(r.courseId)).slice(0, 3);
  const leaders = (leaderboard as any)?.data ?? [];

  const continueHref = (e: any): string | null => {
    if (!validId(e.courseId)) return null;
    const resume = getResumePosition(user?.id, e.courseId);
    if (resume?.lectureId) return `/courses/${e.courseId}/play/${resume.lectureId}`;
    return `/courses/${e.courseId}`;
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden shadow-lift">
        <div
          className="p-6 sm:p-8"
          style={{ background: 'linear-gradient(135deg, hsl(258 80% 46%) 0%, hsl(262 55% 28%) 45%, hsl(222 50% 14%) 100%)' }}
        >
          <div className="absolute inset-0 opacity-40" aria-hidden="true" style={{ background: 'radial-gradient(600px 200px at 80% 0%, rgba(6,182,212,0.35), transparent)' }} />
          <p className="text-sm text-white/75 mb-1 relative">Welcome back{user?.name ? `, ${user.name}` : ''}</p>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-white mb-2 relative">
            Your Learning Journey
          </h1>
          <p className="text-white/85 relative">Continue where you left off — your courses, streak, and AI tutor are one click away.</p>
          <div className="flex flex-wrap gap-2 mt-4 relative">
            <Button size="sm" variant="secondary" as={Link} to="/courses">Browse Courses</Button>
            {activeCourses[0] && continueHref(activeCourses[0]) && (
              <Button size="sm" variant="outline" as={Link} to={continueHref(activeCourses[0])!} className="!text-white !border-white/40 hover:!bg-white/10">
                <PlayCircle size={16} /> Continue Learning
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list" aria-label="Learning statistics">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} role="listitem" className="vl-lift">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/15 to-[#06B6D4]/15 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon className="text-[#7C3AED] dark:text-[#A78BFA]" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2]">{s.value}</p>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{s.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Active Courses */}
      {activeCourses.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">Continue Learning</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeCourses.slice(0, 4).map((enrollment: any) => {
              const href = continueHref(enrollment);
              if (!href) return null;
              const pct = safePercent(enrollment.progressPercent);
              return (
                <Card key={enrollment.id} hover className="vl-lift">
                  <Link to={href} aria-label={`Continue ${enrollment.courseTitle}`}>
                    <div className="flex items-start gap-4">
                      <div
                        className="w-20 h-20 rounded-xl shrink-0 flex items-center justify-center text-2xl font-serif text-white shadow-soft"
                        style={{ background: categoryCover(enrollment.courseTitle) }}
                        aria-hidden="true"
                      >
                        {categoryInitial(enrollment.courseTitle)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1 truncate">
                          {enrollment.courseTitle}
                        </h3>
                        <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-2 capitalize">{enrollment.courseStatus || 'Enrolled'}</p>
                        <ProgressBar progress={pct} showLabel />
                      </div>
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <Card>
        <h2 className="text-lg font-serif text-[#1F2421] mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" as={Link} to="/assignments">
            <ClipboardList size={16} /> Assignments
          </Button>
          <Button size="sm" variant="outline" as={Link} to="/quizzes">
            <FileQuestion size={16} /> Quizzes
          </Button>
          <Button size="sm" variant="outline" as={Link} to="/certificates">
            <Award size={16} /> Certificates
          </Button>
          {activeCourses[0]?.courseId ? (
            <Button size="sm" variant="outline" as={Link} to={`/ai-tutor/${activeCourses[0].courseId}`}>
              <Bot size={16} /> AI Tutor
            </Button>
          ) : (
            <Button size="sm" variant="outline" as={Link} to="/courses">
              <Bot size={16} /> AI Tutor
            </Button>
          )}
        </div>
      </Card>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">
            Recommended <span className="italic text-[#C4612F]">for you</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recs.map((rec: any) => (
              <Card key={rec.id} hover>
                <Link to={`/courses/${rec.courseId}`}>
                  <h3 className="font-medium text-[#1F2421] mb-2">{rec.title}</h3>
                  <p className="text-sm text-[#5C635D] mb-3 line-clamp-2">{rec.reason}</p>
                  <span className="text-sm text-[#C4612F] font-medium">Open course →</span>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {leaders.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} className="text-[#C4612F]" aria-hidden="true" />
            <h2 className="text-lg font-serif text-[#1F2421]">Leaderboard</h2>
          </div>
          <ol className="space-y-2">
            {leaders.slice(0, 5).map((row: any, i: number) => (
              <li key={`${row.name}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-[#1F2421] font-medium">{i + 1}. {row.name}</span>
                <span className="text-[#5C635D]">{row.streak} day streak • {row.badges} badges</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Completed */}
      {completedCourses.length > 0 && (
        <div>
          <h2 className="text-xl font-serif text-[#1F2421] mb-4">Completed Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {completedCourses.slice(0, 3).map((enrollment: any) => (
              <Card key={enrollment.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="text-[#C4612F]" size={18} aria-hidden="true" />
                  <h3 className="font-medium text-[#1F2421]">{enrollment.courseTitle}</h3>
                </div>
                <p className="text-sm text-[#5C635D] mb-3">Completed • {displayPercent(enrollment.progressPercent)}</p>
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
          <EmptyState
            icon={BookOpen}
            title="Start Your Learning Journey"
            description="Explore courses and enroll to begin"
            actionLabel="Browse Courses"
            onAction={() => navigate('/courses')}
          />
        </Card>
      )}
    </div>
  );
};
