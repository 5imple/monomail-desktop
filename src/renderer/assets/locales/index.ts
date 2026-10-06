import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  debug: false,
  interpolation: {
    escapeValue: false // React already escapes by default
  },
  // Single namespace. With the default ':' separator, operator keys like
  // `command_palette.search.has:attachment.description` were parsed as
  // namespace "command_palette.search.has" and rendered "attachment.description".
  nsSeparator: false,
  resources: {
    en: { translation: en }
  }
});

export default i18n;
