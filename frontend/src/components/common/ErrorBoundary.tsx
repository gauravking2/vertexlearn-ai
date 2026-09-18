import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Global React error boundary. Catches render-time crashes anywhere below it
 * and shows an understandable fallback instead of a blank page.
 * Per-page loading/error states are preserved — this only handles
 * unexpected render exceptions.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong.',
    };
  }

  componentDidCatch(error: unknown): void {
    // Visible in devtools; no external reporting wired in this phase.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <Card className="max-w-lg w-full text-center">
            <div className="w-14 h-14 bg-[#F2E3D6] rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-[#C4612F]" size={26} />
            </div>
            <h2 className="text-xl font-serif text-[#1F2421] mb-2">
              {this.props.fallbackTitle ?? 'Something went wrong'}
            </h2>
            <p className="text-sm text-[#5C635D] mb-2">
              The page ran into an unexpected error. Your data is safe — try reloading.
            </p>
            {this.state.message && (
              <p className="text-xs text-[#5C635D] bg-[#FBF9F5] rounded p-2 mb-4 break-words">
                {this.state.message}
              </p>
            )}
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => (window.location.href = '/dashboard')}>
                Go to dashboard
              </Button>
              <Button onClick={this.handleReset}>Reload page</Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
