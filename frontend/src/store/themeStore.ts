import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

function systemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemTheme();
  return mode;
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const themeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: typeof window === 'undefined' ? 'light' : systemTheme(),
      setMode: (mode: ThemeMode) => {
        const resolved = applyTheme(mode);
        set({ mode, resolved });
      },
      toggle: () => {
        const { mode, resolved } = get();
        // Toggle the resolved value; if following system, pin to the opposite.
        const next: ThemeMode = (mode === 'system' ? resolved : mode) === 'dark' ? 'light' : 'dark';
        const nextResolved = applyTheme(next);
        set({ mode: next, resolved: nextResolved });
      },
    }),
    { name: 'theme-storage' },
  ),
);

/** Initialise theme from storage + system preference (call once on boot). */
export function initTheme(): ResolvedTheme {
  const { mode } = themeStore.getState();
  const resolved = applyTheme(mode);
  themeStore.setState({ resolved });
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      const current = themeStore.getState();
      if (current.mode === 'system') {
        const nextResolved = applyTheme('system');
        themeStore.setState({ resolved: nextResolved });
      }
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  }
  return resolved;
}
