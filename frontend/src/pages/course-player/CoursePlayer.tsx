import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourse, useVideoUrl } from '@/hooks/useCourses';
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
import {
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  Bookmark,
  StickyNote,
  PlayCircle,
  PauseCircle,
  Volume2,
} from 'lucide-react';

export const CoursePlayer = () => {
  const { courseId, lectureId } = useParams<{ courseId: string; lectureId: string }>();
  const navigate = useNavigate();
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
  // There is no resumable video binary in this phase; playback state is local.
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
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [lectureId, updateProgress]);

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
      <div className="flex items-center gap-2 text-sm text-[#5C635D]">
        <button onClick={() => navigate(`/courses/${courseId}`)} className="hover:text-[#C4612F]">
          {course.title}
        </button>
        <ChevronRight size={14} />
        <span className="text-[#1F2421]">{currentLecture.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="aspect-video bg-[#1F2421] rounded-lg overflow-hidden mb-4">
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
            {!video?.url && (
              <p className="text-xs text-[#5C635D] mb-2">
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
                  className="w-full h-2 bg-[#FBF9F5] rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #C4612F 0%, #C4612F ${(currentTime / duration) * 100}%, #FBF9F5 ${(currentTime / duration) * 100}%, #FBF9F5 100%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-[#5C635D] mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePlayPause}
                    className="p-2 hover:bg-[#FBF9F5] rounded-lg transition-colors"
                  >
                    {isPlaying ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
                  </button>
                  <button className="p-2 hover:bg-[#FBF9F5] rounded-lg transition-colors">
                    <Volume2 size={20} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="px-3 py-1.5 bg-[#FBF9F5] border border-[#E7E1D7] rounded-lg text-sm text-[#1F2421]"
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
                    className="p-2 hover:bg-[#FBF9F5] rounded-lg transition-colors"
                    title="Add bookmark"
                  >
                    <BookmarkPlus size={20} />
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Lecture Info */}
          <Card>
            <h1 className="text-2xl font-serif text-[#1F2421] mb-2">{currentLecture.title}</h1>
            {currentLecture.description && (
              <p className="text-[#5C635D] mb-4">{currentLecture.description}</p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNotes(!showNotes)}
              >
                <StickyNote size={16} />
                Notes ({notes?.data?.length || 0})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBookmarks(!showBookmarks)}
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
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] mb-3">Lecture Notes</h3>
              <div className="space-y-3 mb-4">
                {notes?.data && notes.data.length > 0 ? (
                  notes.data.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-[#FBF9F5] rounded-lg"
                    >
                      <button
                        onClick={() => handleSeek(note.timestampSeconds ?? 0)}
                        className="text-xs text-[#A94E22] dark:text-[#e8a06f] mb-1 hover:underline"
                      >
                        {formatTime(note.timestampSeconds ?? 0)}
                      </button>
                      <p className="text-sm text-[#1F2421]">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#5C635D] text-center py-4">No notes yet</p>
                )}
              </div>

              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note at current timestamp..."
                  className="w-full px-4 py-2.5 bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
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
            <Card>
              <h3 className="text-lg font-serif text-[#1F2421] mb-3">Bookmarks</h3>
              <div className="space-y-2">
                {bookmarks?.data && bookmarks.data.length > 0 ? (
                  bookmarks.data.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="flex items-center gap-2 p-2 hover:bg-[#FBF9F5] rounded-lg transition-colors"
                    >
                      <button
                        onClick={() => handleSeek(bookmark.timestampSeconds)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <Bookmark size={14} className="text-[#C4612F]" />
                        <span className="text-sm text-[#1F2421]">
                          Bookmark at {formatTime(bookmark.timestampSeconds)}
                        </span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#5C635D] text-center py-4">No bookmarks yet</p>
                )}
              </div>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
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
        <div className="space-y-4">
          {courseId && <MasteryCard courseId={courseId} />}
          <Card>
            <h3 className="text-lg font-serif text-[#1F2421] mb-4">Course Content</h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {course.modules?.map((module, idx) => (
                <div key={module.id}>
                  <h4 className="font-medium text-[#1F2421] mb-2">
                    {idx + 1}. {module.title}
                  </h4>
                  <ul className="ml-4 space-y-1">
                    {module.lectures?.map((lecture) => (
                      <li key={lecture.id}>
                        <button
                          onClick={() => navigate(`/courses/${courseId}/play/${lecture.id}`)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                            lecture.id === lectureId
                              ? 'bg-[#F2E3D6] dark:bg-[#2c241c] text-[#A94E22] dark:text-[#e8a06f]'
                              : 'text-[#5C635D] hover:bg-[#FBF9F5]'
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
