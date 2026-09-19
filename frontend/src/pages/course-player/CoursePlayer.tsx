import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCourse, useVideoUrl } from '@/hooks/useCourses';
import { useAuth } from '@/hooks/useAuth';
import {
  useUpdateLectureProgress,
  useLectureNotes,
  useCreateNote,
  useLectureBookmarks,
  useCreateBookmark,
} from '@/hooks/useLearning';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { LectureSummaryPanel } from '@/components/ai/LectureSummaryPanel';
import { MasteryCard } from '@/components/ai/MasteryCard';
import { saveResumePosition } from '@/utils/model';
import {
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  Bookmark,
  StickyNote,
  PlayCircle,
  PauseCircle,
  Volume2,
  CheckCircle2,
  ListVideo,
} from 'lucide-react';

export const CoursePlayer = () => {
  const { courseId, lectureId } = useParams<{ courseId: string; lectureId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: course, isLoading: loadingCourse } = useCourse(courseId);
  const { data: video } = useVideoUrl(lectureId);
  const { mutate: updateProgress } = useUpdateLectureProgress();
  const { data: notes } = useLectureNotes(lectureId);
  const { mutate: createNote } = useCreateNote();
  const { data: bookmarks } = useLectureBookmarks(lectureId);
  const { mutate: createBookmark } = useCreateBookmark();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Find current lecture
  const currentLecture = course?.modules
    ?.flatMap((m) => m.lectures)
    .find((l) => l?.id === lectureId);

  // Find all lectures in order
  const allLectures = course?.modules?.flatMap((m) => m.lectures || []) || [];
  const currentIndex = allLectures.findIndex((l) => l?.id === lectureId);
  const prevLecture = currentIndex > 0 ? allLectures[currentIndex - 1] : null;
  const nextLecture = currentIndex < allLectures.length - 1 ? allLectures[currentIndex + 1] : null;

  // Resume from last position if available
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [lectureId]);

  // Mark progress via the real endpoint contract: watchedSeconds + completed.
  // Resume position is also persisted locally so Continue Learning works
  // across refreshes even before the server has progress for this lecture.
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && lectureId) {
        const currentPos = Math.floor(videoRef.current.currentTime);
        const totalDur = videoRef.current.duration;
        const completed =
          Number.isFinite(totalDur) && totalDur > 0 ? currentPos / totalDur >= 0.9 : false;

        updateProgress({
          lectureId,
          data: {
            watchedSeconds: currentPos,
            completed,
          },
        });
        if (courseId) saveResumePosition(user?.id ?? '', { courseId, lectureId, watchedSeconds: currentPos });
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [lectureId, courseId, user?.id, updateProgress]);

  const handleMarkComplete = () => {
    if (!lectureId) return;
    const watched = Math.max(Math.floor(currentTime), Math.floor(duration) || 0);
    updateProgress({ lectureId, data: { watchedSeconds: watched, completed: true } });
    if (courseId) saveResumePosition(user?.id ?? '', { courseId, lectureId, watchedSeconds: watched });
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleAddNote = () => {
    if (noteText.trim() && lectureId) {
      createNote(
        {
          lectureId,
          data: {
            content: noteText,
            timestampSeconds: Math.floor(currentTime),
          },
        },
        {
          onSuccess: () => setNoteText(''),
        }
      );
    }
  };

  const handleAddBookmark = () => {
    if (lectureId) {
      createBookmark({
        lectureId,
        data: {
          timestampSeconds: Math.floor(currentTime),
        },
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loadingCourse) {
    return <LoadingSpinner text="Loading lecture..." />;
  }

  if (!course || !currentLecture) {
    return (
      <Card>
        <p className="text-center text-[#5C635D] py-12">Lecture not found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
        <button onClick={() => navigate(`/courses/${courseId}`)} className="hover:text-[#C4612F] dark:hover:text-[#e8a06f] transition-colors">
          {course.title}
        </button>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-[#1F2421] dark:text-[#ece9e2] font-medium truncate">{currentLecture.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Card className="!p-4 sm:!p-5">
            {/* Cinematic stage: dark in both themes so video content reads well */}
            <div className="rounded-xl overflow-hidden bg-[#0d0f0a] ring-1 ring-black/20 mb-4 shadow-inner">
              <div className="aspect-video">
                {video?.url ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full"
                    controls
                    src={video.url}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <video
                    ref={videoRef}
                    className="w-full h-full"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  >
                    {/* No video asset attached yet — instructor uploads wire into object storage */}
                    <source src="" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>
            </div>
            {!video?.url && (
              <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mb-2">
                No video file is attached to this lecture yet. Progress, notes, and AI tools remain fully usable.
              </p>
            )}

            {/* Custom Controls */}
            <div className="space-y-3">
              {/* Progress Bar */}
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  aria-label="Seek video"
                  className="vl-range w-full cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #C4612F 0%, #C4612F ${duration ? (currentTime / duration) * 100 : 0}%, rgba(31,36,33,0.12) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(31,36,33,0.12) 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1.5 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="p-2.5 rounded-xl text-[#1F2421] dark:text-[#ece9e2] hover:bg-[#F2E3D6] dark:hover:bg-[#2c241c] transition-colors"
                  >
                    {isPlaying ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
                  </button>
                  <button
                    aria-label="Volume"
                    className="p-2.5 rounded-xl text-[#5C635D] dark:text-[#b9beb4] hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] hover:text-[#1F2421] dark:hover:text-[#ece9e2] transition-colors"
                  >
                    <Volume2 size={20} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="playback-speed">Playback speed</label>
                  <select
                    id="playback-speed"
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="px-3 py-1.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-lg text-sm text-[#1F2421] dark:text-[#ece9e2] focus:outline-none focus:ring-2 focus:ring-[#C4612F] transition-all cursor-pointer"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                  <button
                    onClick={handleAddBookmark}
                    aria-label="Add bookmark"
                    title="Add bookmark at current time"
                    className="p-2.5 rounded-xl text-[#5C635D] dark:text-[#b9beb4] hover:bg-[#F2E3D6] dark:hover:bg-[#2c241c] hover:text-[#C4612F] dark:hover:text-[#e8a06f] transition-colors"
                  >
                    <BookmarkPlus size={20} />
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Lecture Info */}
          <Card>
            <h1 className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">{currentLecture.title}</h1>
            {currentLecture.description && (
              <p className="text-[#5C635D] dark:text-[#b9beb4] mb-4 leading-relaxed">{currentLecture.description}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNotes(!showNotes)}
                aria-expanded={showNotes}
              >
                <StickyNote size={16} />
                Notes ({notes?.data?.length || 0})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBookmarks(!showBookmarks)}
                aria-expanded={showBookmarks}
              >
                <Bookmark size={16} />
                Bookmarks ({bookmarks?.data?.length || 0})
              </Button>
            </div>
          </Card>

          {/* AI Summary (real endpoint, never fabricated) */}
          {lectureId && <LectureSummaryPanel lectureId={lectureId} />}

          {/* Notes Section */}
          {showNotes && (
            <Card className="animate-fade-in">
              <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3">Lecture Notes</h3>
              <div className="space-y-3 mb-4">
                {notes?.data && notes.data.length > 0 ? (
                  notes.data.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-[#FBF9F5] dark:bg-[#23261f] rounded-xl ring-1 ring-inset ring-[#E7E1D7]/60 dark:ring-[#2c2f2a]"
                    >
                      <button
                        onClick={() => handleSeek(note.timestampSeconds ?? 0)}
                        className="text-xs text-[#A94E22] dark:text-[#e8a06f] mb-1 hover:underline tabular-nums inline-flex items-center gap-1"
                      >
                        <PlayCircle size={11} aria-hidden="true" />
                        {formatTime(note.timestampSeconds ?? 0)}
                      </button>
                      <p className="text-sm text-[#1F2421] dark:text-[#ece9e2]">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] text-center py-4">No notes yet</p>
                )}
              </div>

              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note at current timestamp..."
                  aria-label="New note text"
                  className="w-full px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all resize-none"
                  rows={3}
                />
                <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim()}>
                  Add Note at {formatTime(currentTime)}
                </Button>
              </div>
            </Card>
          )}

          {/* Bookmarks Section */}
          {showBookmarks && (
            <Card className="animate-fade-in">
              <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3">Bookmarks</h3>
              <div className="space-y-2">
                {bookmarks?.data && bookmarks.data.length > 0 ? (
                  bookmarks.data.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] transition-colors"
                    >
                      <button
                        onClick={() => handleSeek(bookmark.timestampSeconds)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <Bookmark size={14} className="text-[#C4612F] dark:text-[#e8a06f]" />
                        <span className="text-sm text-[#1F2421] dark:text-[#ece9e2]">
                          Bookmark at {formatTime(bookmark.timestampSeconds)}
                        </span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] text-center py-4">No bookmarks yet</p>
                )}
              </div>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex flex-wrap justify-between gap-2">
            {prevLecture ? (
              <Button
                variant="outline"
                onClick={() => navigate(`/courses/${courseId}/play/${prevLecture.id}`)}
              >
                <ChevronLeft size={18} />
                Previous
              </Button>
            ) : (
              <div />
            )}
            <Button variant="outline" onClick={handleMarkComplete}>
              <CheckCircle2 size={18} />
              Mark Complete
            </Button>
            {nextLecture ? (
              <Button onClick={() => navigate(`/courses/${courseId}/play/${nextLecture.id}`)}>
                Next
                <ChevronRight size={18} />
              </Button>
            ) : (
              <Button onClick={() => navigate(`/courses/${courseId}`)} variant="outline">
                Back to Course
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar - Course Navigation */}
        <div className="space-y-4 min-w-0 lg:sticky lg:top-24 lg:self-start">
          {courseId && <MasteryCard courseId={courseId} />}
          {courseId && (
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3">Course actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" as={Link} to={`/ai-tutor/${courseId}`}>
                  AI Tutor
                </Button>
                <Button size="sm" variant="outline" as={Link} to={`/courses/${courseId}/assignments`}>
                  Assignments
                </Button>
                <Button size="sm" variant="outline" as={Link} to={`/courses/${courseId}/quizzes`}>
                  Quizzes
                </Button>
                <Button size="sm" variant="outline" as={Link} to={`/courses/${courseId}/discussions`}>
                  Discuss
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4 flex items-center gap-2">
              <ListVideo size={18} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
              Course Content
            </h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
              {course.modules?.map((module, idx) => (
                <div key={module.id}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5C635D] dark:text-[#b9beb4] mb-1.5 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#F2E3D6] dark:bg-[#2c241c] text-[#8A3E1C] dark:text-[#e8a06f] inline-flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    {module.title}
                  </h4>
                  <ul className="ml-2 space-y-0.5 border-l border-[#E7E1D7] dark:border-[#2c2f2a] pl-2">
                    {module.lectures?.map((lecture) => (
                      <li key={lecture.id}>
                        <button
                          onClick={() => navigate(`/courses/${courseId}/play/${lecture.id}`)}
                          aria-current={lecture.id === lectureId ? 'true' : undefined}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                            lecture.id === lectureId
                              ? 'bg-[#F2E3D6] dark:bg-[#2c241c] text-[#8A3E1C] dark:text-[#e8a06f] font-medium'
                              : 'text-[#5C635D] dark:text-[#b9beb4] hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] hover:text-[#1F2421] dark:hover:text-[#ece9e2]'
                          }`}
                        >
                          {lecture.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
