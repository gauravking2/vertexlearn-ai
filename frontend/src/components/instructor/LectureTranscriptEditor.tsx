import { useState } from 'react';
import { useIngestTranscript } from '@/hooks/useAI';
import { Button } from '@/components/common/Button';
import { getApiErrorMessage } from '@/components/common/apiError';
import { FileText } from 'lucide-react';

/**
 * Instructor lecture-material ingestion: paste/edit the lecture transcript,
 * index it (chunk + embed into pgvector) so the AI Tutor, summaries, and AI
 * quiz drafts work for the lecture. Real endpoint, chunk count displayed.
 */
export const LectureTranscriptEditor = ({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) => {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [formError, setFormError] = useState('');
  const { mutate: ingest, isPending, isError, error, data, reset } = useIngestTranscript();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (transcript.trim().length < 20) {
      setFormError('Transcript needs at least 20 characters to be useful for retrieval.');
      return;
    }
    setFormError('');
    ingest({ lectureId, transcript: transcript.trim() });
  };

  if (!open) {
    return (
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="text-xs text-[#5C635D] hover:text-[#C4612F] hover:underline flex items-center gap-1 mt-1"
      >
        <FileText size={12} aria-hidden="true" /> Add/edit transcript
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-2 p-3 bg-[#FBF9F5] rounded-lg space-y-2">
      <label className="block text-xs font-medium text-[#1F2421]" htmlFor={`tx-${lectureId}`}>
        Transcript for “{lectureTitle}” (powers AI Tutor, summaries, AI quizzes)
      </label>
      <textarea
        id={`tx-${lectureId}`}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the lecture transcript or detailed notes here..."
        className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg text-sm text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
        rows={4}
      />
      {formError && <p className="text-xs text-red-700">{formError}</p>}
      {isError && <p className="text-xs text-red-700">{getApiErrorMessage(error)}</p>}
      {data && (
        <p className="text-xs text-green-700" role="status">
          Indexed {data.chunks} chunk{(data.chunks ?? 0) === 1 ? '' : 's'} — AI features are live for this lecture.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>Index material</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
    </form>
  );
};
