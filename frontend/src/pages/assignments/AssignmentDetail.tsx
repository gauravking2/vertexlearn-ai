import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAssignment, useMySubmission, useSubmitAssignment, useUploadSubmissionFile } from '@/hooks/useAssignments';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Calendar, FileText, Upload, CheckCircle, AlertCircle, ClipboardList } from 'lucide-react';

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
  const dueAt = a.due_at ?? a.dueAt;
  const maxScore = a.max_score ?? a.maxScore;
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
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-serif text-[#1F2421] mb-2">{a.title}</h1>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-[#5C635D]">
                <Calendar size={16} className="text-[#C4612F]" />
                <span>Due: {dueAt ? new Date(dueAt).toLocaleDateString() : 'No due date'}</span>
              </div>
              {maxScore != null && (
                <div className="flex items-center gap-2 text-sm text-[#5C635D]">
                  <FileText size={16} className="text-[#C4612F]" />
                  <span>Max Score: {maxScore}</span>
                </div>
              )}
            </div>
          </div>
          {isOverdue && !submitted && <Badge variant="error">Overdue</Badge>}
          {submitted && <Badge variant="success">Submitted</Badge>}
        </div>
        {a.description && <p className="text-[#5C635D]">{a.description}</p>}
      </Card>

      {submitted ? (
        <Card>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-[#F2E3D6] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-[#C4612F]" size={28} />
            </div>
            <h3 className="text-xl font-serif text-[#1F2421] mb-2">Submitted</h3>
            <p className="text-[#5C635D] mb-2">
              Submitted {(mySubmission as any)?.submitted_at ? new Date((mySubmission as any).submitted_at).toLocaleString() : ''}.
              {(mySubmission as any)?.grade != null
                ? ` Grade: ${(mySubmission as any).grade}${(mySubmission as any)?.feedback ? ` — ${(mySubmission as any).feedback}` : ''}`
                : " You'll be notified when it's graded."}
            </p>
            <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <h3 className="text-lg font-serif text-[#1F2421] mb-4">Submit Assignment</h3>
          {isOverdue && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
              <AlertCircle size={18} className="text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Past due</p>
                <p className="text-xs text-yellow-700">The deadline has passed; the server may reject late submissions.</p>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2421] mb-2">Your Work</label>
              <textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Type your submission here..."
                className="w-full px-4 py-3 bg-[#FBF9F5] border border-[#E7E1D7] rounded-lg text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
                rows={8}
              />
            </div>
            <div className="border-2 border-dashed border-[#E7E1D7] rounded-lg p-6 text-center">
              <Upload className="mx-auto text-[#5C635D] mb-2" size={28} />
              <p className="text-sm text-[#5C635D] mb-1">Or upload a file (PDF, ZIP, code/text — max 25MB)</p>
              <input
                type="file"
                aria-label="Submission file"
                accept=".pdf,.zip,.txt,.md,.csv,.json,.py,.js,.ts,.jsx,.tsx,.java,.c,.h,.cpp,.hpp,.go,.rs,.rb,.php"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="mt-2 text-sm text-[#5C635D]"
              />
              {selectedFile && (
                <p className="text-xs text-[#5C635D] mt-1">Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</p>
              )}
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={handleFileUpload} loading={uploading} disabled={!selectedFile}>
                  Upload file
                </Button>
              </div>
              {uploadSucceeded && <p className="text-sm text-green-700 mt-2">File uploaded.</p>}
              {uploadFailed && <p className="text-sm text-red-700 mt-2">{getApiErrorMessage(uploadError)}</p>}
            </div>
            {submitFailed && <p className="text-sm text-red-700">{getApiErrorMessage(submitError)}</p>}
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
