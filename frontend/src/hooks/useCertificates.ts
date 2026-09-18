import { useQuery } from '@tanstack/react-query';
import { learningService } from '@/services/learningService';
import type { Certificate } from '@/types';

interface CertificatesResponse {
  data: Certificate[];
}

export function useCertificates() {
  return useQuery<CertificatesResponse>({
    queryKey: ['certificates'],
    queryFn: () => learningService.getMyCertificates(),
  });
}
