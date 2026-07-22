'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { DEFAULT_LANG, directionFor, initI18n, type Lang } from './index';
import { getPosApi } from '../pos-api';

// Init immediately with the default so components can call `useTranslation`
// during their first render. The provider effect swaps in the persisted
// language once electron-store answers.
initI18n(DEFAULT_LANG);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pos = getPosApi();
    const applyLang = (lang: Lang) => {
      initI18n(lang);
      const dir = directionFor(lang);
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.setAttribute('dir', dir);
    };

    if (!pos) {
      applyLang(DEFAULT_LANG);
      setReady(true);
      return;
    }

    pos.prefs
      .get<Lang | null>('lang')
      .then((lang) => {
        applyLang(lang ?? DEFAULT_LANG);
        setReady(true);
      })
      .catch(() => {
        applyLang(DEFAULT_LANG);
        setReady(true);
      });
  }, []);

  // Prevent a flash of untranslated content: don't render children until we
  // know the language. It's a single microtask in practice.
  if (!ready) return null;
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * Persist + apply a new language. Returns after both the pref write and the
 * i18n change complete, so consumers can `await` before re-rendering menus.
 */
export async function setLang(lang: Lang): Promise<void> {
  await getPosApi()?.prefs.set('lang', lang);
  await i18n.changeLanguage(lang);
  const dir = directionFor(lang);
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', dir);
}
