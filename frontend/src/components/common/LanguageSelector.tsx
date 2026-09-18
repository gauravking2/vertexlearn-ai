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
        className="bg-transparent border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-lg px-2 py-1 text-sm text-[#5C635D] dark:text-[#b9beb4]"
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
