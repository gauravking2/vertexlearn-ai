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
        className="p-2 rounded-lg transition-colors text-[#5C635D] hover:bg-[#F2E3D6] hover:text-[#C4612F] dark:text-[#b9beb4] dark:hover:bg-[#23261f] dark:hover:text-[#e8a06f] focus-visible:outline-2"
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
        className="hidden sm:block bg-transparent text-xs border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-lg px-1 py-1 text-[#5C635D] dark:text-[#b9beb4]"
      >
        <option value="light">{t('theme.light', locale)}</option>
        <option value="dark">{t('theme.dark', locale)}</option>
        <option value="system">{t('theme.system', locale)}</option>
      </select>
    </div>
  );
};
