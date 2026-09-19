import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAssignment, useMySubmission, useSubmitAssignment, useUploadSubmissionFile } from '@/hooks/useAssignments';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Calendar, FileText, Upload, CheckCircle, AlertCircle, ClipboardList, MessageSquareText } from 'lucide-react';

export const AssignmentDetail = () => {
  const { id: assignmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: assignment, isLoading, isError, error } = useAssignment(assignmentId);
  const { data: mySubmission, isLoading: loadingMine, refetch: refetchMine } = useMySubmission(assignmentId);
  const { mutate: submit, isPending: submitting, isError: submitFailed, error: submitError } = useSubmitAssignment();
  const {
    mutate: uploadFile,
    isPending: uploading,
    isError: uploadFailed,
    error: uploadError,
    isSuccess: uploadSucceeded,
  } = useUploadSubmissionFile();

  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!assignmentId) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No assignment selected"
          description="Select an assignment from your course to view details."
        />
      </Card>
    );
  }

  if (isLoading || loadingMine) return <LoadingSpinner text="Loading assignment..." />;

  if (isError || !assignment) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Assignment unavailable"
          description={isError ? getApiErrorMessage(error) : 'This assignment may not exist or you are not enrolled.'}
        />
      </Card>
    );
  }

  const a = assignment as any;
  const dueAt = a.dueAt;
  const maxScore = a.maxScore;
  const submitted = Boolean(mySubmission);

  const handleSubmit = () => {
    if (assignmentId) {
      submit(
        { assignmentId, data: { contentText: submissionText } },
        { onSuccess: () => { setSubmissionText(''); refetchMine(); } }
      );
    }
  };

  const handleFileUpload = () => {
    if (assignmentId && selectedFile) {
      uploadFile(
        { assignmentId, file: selectedFile },
        { onSuccess: () => { setSelectedFile(null); refetchMine(); } }
      );
    }
  };

  const isOverdue = dueAt && new Date(dueAt) < new Date();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">{a.title}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <Calendar size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                <span>Due: {dueAt ? new Date(dueAt).toLocaleDateString() : 'No due date'}</span>
              </div>
              {maxScore != null && (
                <div className="flex items-center gap-2 text-sm text-[#5C635D] dark:text-[#b9beb4]">
                  <FileText size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                  <span>Max Score: {maxScore}</span>
                </div>
              )}
            </div>
          </div>
          {isOverdue && !submitted && <Badge variant="error">Overdue</Badge>}
          {submitted && <Badge variant="success">Submitted</Badge>}
        </div>
        {a.description && <p className="text-[#5C635D] dark:text-[#b9beb4] leading-relaxed">{a.description}</p>}
      </Card>

      {submitted ? (
        <Card>
          <div className="text-center py-8">
            <div className="relative inline-block mb-4">
              <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.14),transparent_70%)]" />
              <div className="relative w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 ring-1 ring-green-600/20 dark:ring-green-500/30 flex items-center justify-center">
                <CheckCircle className="text-green-600 dark:text-green-400" size={28} aria-hidden="true" />
              </div>
            </div>
            <h3 className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">Submitted</h3>
            <p className="text-[#5C635D] dark:text-[#b9beb4] mb-2">
              Submitted {(mySubmission as any)?.submittedAt ? new Date((mySubmission as any).submittedAt).toLocaleString() : ''}.
              {(mySubmission as any)?.grade != null
                ? ` Grade: ${(mySubmission as any).grade}${(mySubmission as any)?.feedback ? ` — ${(mySubmission as any).feedback}` : ''}`
                : " You'll be notified when it's graded."}
            </p>
            {(mySubmission as any)?.grade != null && (mySubmission as any)?.feedback && (
              <div className="mt-4 max-w-md mx-auto text-left p-4 bg-[#FBF9F5] dark:bg-[#23261f] rounded-xl ring-1 ring-inset ring-[#E7E1D7] dark:ring-[#2c2f2a]">
                <p className="text-xs font-semibold text-[#5C635D] dark:text-[#b9beb4] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <MessageSquareText size={12} aria-hidden="true" /> Instructor feedback
                </p>
                <p className="text-sm text-[#1F2421] dark:text-[#ece9e2] leading-relaxed">{(mySubmission as any).feedback}</p>
              </div>
            )}
            <div className="mt-6">
              <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-4">Submit Assignment</h3>
          {isOverdue && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 rounded-xl mb-4">
              <AlertCircle size={18} className="text-yellow-600 dark:text-yellow-400 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Past due</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">The deadline has passed; the server may reject late submissions.</p>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-2" htmlFor="submission-text">Your Work</label>
              <textarea
                id="submission-text"
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Type your submission here..."
                className="w-full px-4 py-3 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all resize-none"
                rows={8}
              />
            </div>
            <div className="vl-dropzone border-2 border-dashed border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl p-6 text-center bg-[#FBF9F5]/50 dark:bg-[#23261f]/50">
              <Upload className="mx-auto text-[#5C635D] dark:text-[#b9beb4] mb-2" size={28} aria-hidden="true" />
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-1">Or upload a file (PDF, ZIP, code/text — max 25MB)</p>
              <input
                type="file"
                aria-label="Submission file"
                accept=".pdf,.zip,.txt,.md,.csv,.json,.py,.js,.ts,.jsx,.tsx,.java,.c,.h,.cpp,.hpp,.go,.rs,.rb,.php"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="mt-2 text-sm text-[#5C635D] dark:text-[#b9beb4] file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-[#F2E3D6] file:text-[#8A3E1C] dark:file:bg-[#2c241c] dark:file:text-[#e8a06f] hover:file:bg-[#EAD3BE] cursor-pointer"
              />
              {selectedFile && (
                <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1">Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</p>
              )}
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={handleFileUpload} loading={uploading} disabled={!selectedFile}>
                  Upload file
                </Button>
              </div>
              {uploadSucceeded && <p className="text-sm text-green-700 dark:text-green-400 mt-2">File uploaded.</p>}
              {uploadFailed && <p className="text-sm text-red-700 dark:text-red-400 mt-2">{getApiErrorMessage(uploadError)}</p>}
            </div>
            {submitFailed && <p className="text-sm text-red-700 dark:text-red-400">{getApiErrorMessage(submitError)}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate('/dashboard')}>Cancel</Button>
              <Button onClick={handleSubmit} loading={submitting} disabled={!submissionText.trim()}>
                Submit Assignment
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
