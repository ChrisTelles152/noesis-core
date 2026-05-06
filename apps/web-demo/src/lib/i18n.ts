/**
 * i18n configuration (Phase H1)
 *
 * Default language is pt-BR (Brazilian Portuguese) — the Phase-1 wedge per
 * INTENTION.md is a Brazilian STEM pilot. en-US is loaded as a fallback so
 * any key not yet translated falls back to English instead of rendering
 * the raw key.
 *
 * Detection order: localStorage (so a user's choice persists) → browser
 * navigator language (Brazilian browsers detect as pt-BR automatically).
 * If neither matches a loaded resource, fallbackLng (pt-BR) wins.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from '@/locales/pt-BR.json';
import enUS from '@/locales/en-US.json';

/**
 * The init promise resolves when i18next has finished registering
 * resources and detecting the language. Tests `await i18nReady` before
 * rendering anything that calls `useTranslation`. In production main.tsx
 * we don't await it: React mounts immediately, t() calls return their
 * keys for the first frame, then re-render once init resolves. The
 * tradeoff is one frame of "home.headline" instead of "Aprendizado
 * Adaptativo" — invisible in dev with HMR, and short enough at boot
 * that no user notices.
 */
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      'en-US': { translation: enUS },
    },
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    supportedLngs: ['pt-BR', 'en-US'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'noesis-lng',
    },
  });

export default i18n;
