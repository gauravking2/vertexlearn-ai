import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, type Locale } from '@/i18n';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const localeStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale: Locale) => {
        set({ locale });
        if (typeof document !== 'undefined') document.documentElement.lang = locale;
      },
    }),
    { name: 'locale-storage' },
  ),
);

export function initLocale(): Locale {
  const { locale } = localeStore.getState();
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  return locale;
}
