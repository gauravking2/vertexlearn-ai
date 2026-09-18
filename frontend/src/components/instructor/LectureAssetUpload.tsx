import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { courseService } from '@/services/courseService';
import { Button } from '@/components/common/Button';

/**
 * Instructor lecture-asset upload. The backend mints a short-lived presigned
 * PUT (ownership-checked); the browser uploads bytes straight to private
 * object storage — storage credentials never reach the frontend.
 */
export const LectureAssetUpload = ({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestUrl = useMutation({
    mutationFn: (f: File) => courseService.requestLectureUploadUrl(lectureId, { fileName: f.name, contentType: f.type || 'video/mp4' }),
  });

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setStatus('Requesting upload URL…');
    try {
      const target = await requestUrl.mutateAsync(file);
      setStatus('Uploading to object storage…');
      const put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed with status ${put.status}`);
      setStatus('Video attached. Students stream it via a signed playback URL.');
      setFile(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Upload failed');
      setStatus(null);
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-xs text-[#5C635D] max-w-[220px] truncate" title={lectureTitle}>
        {lectureTitle}
      </span>
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        aria-label={`Video file for ${lectureTitle}`}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs text-[#5C635D]"
      />
      <Button size="sm" variant="outline" onClick={handleUpload} loading={requestUrl.isPending} disabled={!file}>
        Upload video
      </Button>
      {status && <span className="text-xs text-green-700">{status}</span>}
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </div>
  );
};
