import { Moon, Sun } from 'lucide-react';
import { themeStore } from '@/store/themeStore';
import { localeStore } from '@/store/localeStore';
import { t } from '@/i18n';

export const ThemeToggle = () => {
  const { mode, resolved, toggle, setMode } = themeStore();
  const { locale } = localeStore();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => toggle()}
        aria-label={t('action.toggleTheme', locale)}
        aria-pressed={resolved === 'dark'}
        title={`${t('theme.light', locale)} / ${t('theme.dark', locale)} (${mode})`}
        className="inline-grid min-h-10 min-w-10 place-items-center rounded-[var(--vl-radius-sm)] text-[var(--vl-text-secondary)] transition-colors hover:bg-[var(--vl-surface-hover)] hover:text-[var(--vl-accent)]"
      >
        {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <label className="sr-only" htmlFor="theme-mode-select">
        Theme mode
      </label>
      <select
        id="theme-mode-select"
        value={mode}
        onChange={(e) => setMode(e.target.value as typeof mode)}
        className="hidden min-h-10 rounded-[var(--vl-radius-sm)] border border-[var(--vl-border)] bg-[var(--vl-surface-inset)] px-2 py-1 text-xs text-[var(--vl-text-secondary)] sm:block"
      >
        <option value="light">{t('theme.light', locale)}</option>
        <option value="dark">{t('theme.dark', locale)}</option>
        <option value="system">{t('theme.system', locale)}</option>
      </select>
    </div>
  );
};
