import { useState } from 'react';
import { useCertificates } from '@/hooks/useCertificates';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Award, Download, AlertCircle } from 'lucide-react';
import { learningService } from '@/services/learningService';
import type { Certificate } from '@/types';

export const CertificatesPage = () => {
  const { data, isLoading } = useCertificates();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (cert: Certificate) => {
    setDownloadingId(cert.id);
    setDownloadError(null);
    try {
      const blob = await learningService.downloadCertificate(cert.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `certificate-${cert.certificateCode ?? cert.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoking synchronously aborts the download in Chromium — defer it.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
    } catch {
      setDownloadError('Could not download certificate. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const certs = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Your <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Certificates</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">View and download your earned certificates</p>
      </div>

      {downloadError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-800 dark:text-red-200">
          <AlertCircle size={16} aria-hidden="true" /> {downloadError}
        </div>
      )}

      {certs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No certificates yet"
            description="Complete courses to earn certificates"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 vl-stagger">
          {certs.map((cert: Certificate) => (
            <Card key={cert.id} hover className="vl-cert relative overflow-hidden">
              {/* Subtle double border, like a real certificate */}
              <span aria-hidden="true" className="absolute inset-2 rounded-xl border border-[#C4612F]/25 pointer-events-none" />
              <div className="space-y-4 relative">
                <div className="flex items-start justify-between">
                  <div className="relative">
                    <div aria-hidden="true" className="absolute -inset-2 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.14),transparent_70%)]" />
                    <Award className="relative text-[#C4612F] dark:text-[#e8a06f]" size={32} />
                  </div>
                  <Badge variant="success">Earned</Badge>
                </div>
                <div>
                  <p className="vl-eyebrow text-[#C4612F] dark:text-[#e8a06f] mb-1">Certificate of completion</p>
                  <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-1">
                    {(cert as any).courseTitle || cert.course?.title || 'Certificate'}
                  </h3>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
                    Issued {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : 'recently'}
                  </p>
                  {cert.certificateCode && (
                    <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1 tabular-nums">Code: {cert.certificateCode}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  loading={downloadingId === cert.id}
                  onClick={() => handleDownload(cert)}
                >
                  <Download size={16} aria-hidden="true" />
                  Download
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
