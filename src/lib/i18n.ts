import i18n from 'i18next';
import { initReactI18next, useTranslation as useReactI18NextTranslation } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import ru from '../locales/ru.json';
import es from '../locales/es.json';
import hi from '../locales/hi.json';
import ur from '../locales/ur.json';
import ko from '../locales/ko.json';
import ts from '../locales/ts.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  ru: { translation: ru },
  es: { translation: es },
  hi: { translation: hi },
  ur: { translation: ur },
  ko: { translation: ko },
  ts: { translation: ts },
};

const stripPipePostProcessor = {
  type: 'postProcessor' as const,
  name: 'stripPipe',
  process(value: string) {
    if (typeof value === 'string' && value.includes('||||')) {
      return value.split('||||')[0].trim();
    }
    return value;
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(stripPipePostProcessor)
  .init({
    resources,
    fallbackLng: 'en',
    load: 'languageOnly',
    postProcess: ['stripPipe'],
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export function useTranslation(ns?: string, options?: any) {
  try {
    return useReactI18NextTranslation(ns, options);
  } catch (e) {
    return {
      t: (key: string, options?: any) => {
        try {
          const res = i18n.t(key, options);
          const finalRes = res !== key ? res : (options?.defaultValue || key);
          if (typeof finalRes === 'string' && finalRes.includes('||||')) {
            return finalRes.split('||||')[0].trim();
          }
          return finalRes;
        } catch (err) {
          return options?.defaultValue || key;
        }
      },
      i18n: i18n,
      ready: true,
    };
  }
}

export default i18n;
