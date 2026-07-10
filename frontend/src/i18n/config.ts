import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import nl from './nl.json'

export type Language = 'en' | 'nl'
export const LANGUAGES: Language[] = ['en', 'nl']
export const LANGUAGE_STORAGE_KEY = 'renovatie.language'

// Stored choice wins; first visit falls back to the browser language.
export function initialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'en' || stored === 'nl') return stored
  return navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en'
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    nl: { translation: nl },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes rendered strings itself
})

export default i18next
