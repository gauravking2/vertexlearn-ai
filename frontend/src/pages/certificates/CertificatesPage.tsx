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
      window.URL.revokeObjectURL(url);
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
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          Your <span className="italic text-[#C4612F]">Certificates</span>
        </h1>
        <p className="text-[#5C635D]">View and download your earned certificates</p>
      </div>

      {downloadError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertCircle size={16} /> {downloadError}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certs.map((cert: Certificate) => (
            <Card key={cert.id} hover>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <Award className="text-[#C4612F]" size={32} />
                  <Badge variant="success">Earned</Badge>
                </div>
                <div>
                  <h3 className="text-lg font-serif text-[#1F2421] mb-1">
                    {cert.course?.title || 'Certificate'}
                  </h3>
                  <p className="text-sm text-[#5C635D]">
                    Issued {new Date(cert.issuedAt).toLocaleDateString()}
                  </p>
                  {cert.certificateCode && (
                    <p className="text-xs text-[#5C635D] mt-1">Code: {cert.certificateCode}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  loading={downloadingId === cert.id}
                  onClick={() => handleDownload(cert)}
                >
                  <Download size={16} />
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
