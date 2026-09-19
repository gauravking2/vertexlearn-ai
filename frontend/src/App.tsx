import { StrictMode, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './routes';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { initTheme } from './store/themeStore';
import { initLocale } from './store/localeStore';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  useEffect(() => {
    initTheme();
    initLocale();
  }, []);
  // GitHub Pages serves the bundle from /vertexlearn-ai/ (Vite `base`).
  // import.meta.env.BASE_URL is '/' locally and '/vertexlearn-ai/' on Pages,
  // so basename keeps every existing route working in both environments.
  const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || undefined;
  return (
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={basename}>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
