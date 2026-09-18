import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const LoadingSpinner = ({ size = 'md', text }: LoadingSpinnerProps) => {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className="animate-spin text-[#C4612F]" size={sizeMap[size]} />
      {text && <p className="text-sm text-[#5C635D]">{text}</p>}
    </div>
  );
};
