import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import fr from './locales/fr';
import ar from './locales/ar';

export type Lang = 'en' | 'fr' | 'ar';

export const SUPPORTED_LANGS: Array<{ code: Lang; label: string; dir: 'ltr' | 'rtl' }> = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

export const DEFAULT_LANG: Lang = 'fr';

let initialized = false;

export function initI18n(lang: Lang = DEFAULT_LANG): typeof i18n {
  if (!initialized) {
    i18n.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
        ar: { translation: ar },
      },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    initialized = true;
  } else {
    i18n.changeLanguage(lang);
  }
  return i18n;
}

export function directionFor(lang: Lang): 'ltr' | 'rtl' {
  return SUPPORTED_LANGS.find((l) => l.code === lang)?.dir ?? 'ltr';
}

export default i18n;
