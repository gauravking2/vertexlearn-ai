import { localeStore } from '@/store/localeStore';
import { SUPPORTED_LOCALES, t } from '@/i18n';

/** Language selector foundation (currently English-only per PRD scope). */
export const LanguageSelector = () => {
  const { locale, setLocale } = localeStore();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t('action.selectLanguage', locale)}</span>
      <select
        aria-label={t('action.selectLanguage', locale)}
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="min-h-10 rounded-[var(--vl-radius-sm)] border border-[var(--vl-border)] bg-[var(--vl-surface-inset)] px-2.5 py-1 text-sm text-[var(--vl-text-secondary)] transition-colors hover:border-[var(--vl-border-strong)] focus-visible:border-[var(--vl-accent)]"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
};
