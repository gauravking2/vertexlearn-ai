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
import { BookOpen, Award, TrendingUp, Flame, PlayCircle, ClipboardList, FileQuestion, Bot, Trophy, ArrowRight } from 'lucide-react';
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
      <div className="relative overflow-hidden rounded-[var(--vl-radius-xl)] border border-white/10 shadow-[var(--vl-shadow-elevated)] vl-hero">
        <div
          className="min-h-56 p-6 sm:p-8 lg:p-10"
          style={{
            backgroundColor: 'hsl(260 49% 22%)',
            backgroundImage: 'linear-gradient(132deg, hsl(258 58% 34%) 0%, hsl(260 49% 22%) 48%, hsl(207 40% 12%) 100%)',
          }}
        >
          <p className="text-sm text-white/80 mb-1 relative">Welcome back{user?.name ? `, ${user.name}` : ''}</p>
          <h1 className="max-w-2xl text-3xl font-serif font-normal leading-tight tracking-[-0.025em] text-white mb-3 relative sm:text-4xl">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 vl-stagger" role="list" aria-label="Learning statistics">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} role="listitem" variant="elevated" className="relative overflow-hidden vl-lift">
              <div
                aria-hidden="true"
                className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]"
              />
              <div className="flex items-center gap-3 relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums leading-none mb-1">{s.value}</p>
                  <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">{s.label}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Active Courses */}
      {activeCourses.length > 0 && (
        <section aria-labelledby="continue-learning-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="continue-learning-heading" className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2]">
              Continue <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Learning</span>
            </h2>
            <Link to="/courses" className="text-sm text-[#C4612F] dark:text-[#e8a06f] hover:underline inline-flex items-center gap-1">
              All courses <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 vl-stagger">
            {activeCourses.slice(0, 4).map((enrollment: any) => {
              const href = continueHref(enrollment);
              if (!href) return null;
              const pct = safePercent(enrollment.progressPercent);
              return (
                <Card key={enrollment.id} hover variant="elevated" className="vl-lift">
                  <Link to={href} aria-label={`Continue ${enrollment.courseTitle}`}>
                    <div className="flex items-start gap-4">
                      <div
                        className="w-20 h-20 rounded-xl shrink-0 flex items-center justify-center text-2xl font-serif text-white shadow-soft relative overflow-hidden"
                        style={{ background: categoryCover(enrollment.courseTitle) }}
                        aria-hidden="true"
                      >
                        <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.25),transparent_55%)]" />
                        <span className="relative">{categoryInitial(enrollment.courseTitle)}</span>
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
        </section>
      )}

      {/* Quick actions */}
      <Card variant="inset">
        <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
        <section aria-labelledby="recs-heading">
          <h2 id="recs-heading" className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4">
            Recommended <span className="italic text-[#C4612F] dark:text-[#e8a06f]">for you</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 vl-stagger">
            {recs.map((rec: any) => (
              <Card key={rec.id} hover>
                <Link to={`/courses/${rec.courseId}`}>
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2] mb-2">{rec.title}</h3>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3 line-clamp-2">{rec.reason}</p>
                  <span className="text-sm text-[#C4612F] dark:text-[#e8a06f] font-medium inline-flex items-center gap-1">
                    Open course <ArrowRight size={14} />
                  </span>
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Leaderboard */}
      {leaders.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
            <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2]">Leaderboard</h2>
          </div>
          <ol className="space-y-1.5">
            {leaders.slice(0, 5).map((row: any, i: number) => (
              <li key={`${row.name}-${i}`} className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] transition-colors">
                <span className="text-[#1F2421] dark:text-[#ece9e2] font-medium flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-semibold ${i === 0 ? 'bg-[#F2E3D6] text-[#8A3E1C] dark:bg-[#2c241c] dark:text-[#e8a06f]' : 'bg-[#FBF9F5] text-[#5C635D] dark:bg-[#23261f] dark:text-[#b9beb4]'}`} aria-hidden="true">
                    {i + 1}
                  </span>
                  {row.name}
                </span>
                <span className="text-[#5C635D] dark:text-[#b9beb4]">{row.streak} day streak • {row.badges} badges</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Completed */}
      {completedCourses.length > 0 && (
        <section aria-labelledby="completed-heading">
          <h2 id="completed-heading" className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4">Completed Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 vl-stagger">
            {completedCourses.slice(0, 3).map((enrollment: any) => (
              <Card key={enrollment.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="text-[#C4612F] dark:text-[#e8a06f]" size={18} aria-hidden="true" />
                  <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{enrollment.courseTitle}</h3>
                </div>
                <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3">Completed • {displayPercent(enrollment.progressPercent)}</p>
                <Link to={`/courses/${enrollment.courseId}`}>
                  <Button size="sm" variant="outline" fullWidth>
                    View Course
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>
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
