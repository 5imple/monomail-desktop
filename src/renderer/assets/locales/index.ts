import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import en from './en.json';
import es from './es.json';
import ko from './ko.json';
import ja from './ja.json';

i18n
  .use(Backend) // Loads translations
  .use(LanguageDetector) // Detects user language
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'ko', 'ja'],
    debug: false,
    interpolation: {
      escapeValue: false // React already escapes by default
    },
    resources: {
      en: { translation: en },
      es: { translation: es },
      ko: { translation: ko },
      ja: { translation: ja }
    }
  });

export default i18n;
