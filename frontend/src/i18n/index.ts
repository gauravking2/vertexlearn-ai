/**
 * Phase 7 i18n scaffolding (PRD: basic scaffolding, NOT full translation).
 *
 * - Locale abstraction (`Locale` + `t()` + dictionaries).
 * - Default English locale (`en`).
 * - Translation dictionary structure ready for future locales.
 * - Language selector foundation (`LanguageSelector` component + locale store).
 *
 * Only `en` ships with full strings; additional locales can be added by
 * extending `dictionaries` without touching call sites.
 */

export type Locale = 'en';

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [{ code: 'en', label: 'English' }];

export const DEFAULT_LOCALE: Locale = (import.meta.env?.VITE_DEFAULT_LOCALE as Locale) || 'en';

type Dict = Record<string, string>;

const en: Dict = {
  'nav.dashboard': 'Dashboard',
  'nav.courses': 'Courses',
  'nav.certificates': 'Certificates',
  'nav.notifications': 'Notifications',
  'nav.admin': 'Admin Dashboard',
  'nav.users': 'Users',
  'nav.approvals': 'Approvals',
  'nav.analytics': 'Analytics',
  'nav.moderation': 'Moderation',
  'nav.instructor': 'Instructor Dashboard',
  'nav.manageCourses': 'Manage Courses',
  'nav.aiQuizReview': 'AI Quiz Review',
  'nav.catalog': 'Course Catalog',
  'action.logout': 'Logout',
  'action.toggleSidebar': 'Toggle sidebar',
  'action.toggleTheme': 'Toggle color theme',
  'action.selectLanguage': 'Select language',
  'a11y.skipToContent': 'Skip to main content',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'auth.login': 'Log in',
  'auth.register': 'Create account',
  'common.loading': 'Loading…',
  'common.empty': 'Nothing here yet.',
  'common.error': 'Something went wrong.',
};

const dictionaries: Record<Locale, Dict> = { en };

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] ?? dictionaries.en;
}

/** Translate a key; falls back to the key itself when missing. */
export function t(key: string, locale: Locale = DEFAULT_LOCALE, vars?: Record<string, string | number>): string {
  const dict = getDictionary(locale);
  let out = dict[key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  }
  return out;
}
