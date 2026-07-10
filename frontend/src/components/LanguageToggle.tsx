import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n/config'
import { useLanguage } from '../i18n/useLanguage'

const SHORT_LABELS = { en: 'EN', nl: 'NL' } as const

interface LanguageToggleProps {
  // Full language names for the sign-in screens; short codes elsewhere.
  full?: boolean
}

export function LanguageToggle({ full = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage()
  const { t } = useTranslation()

  return (
    <div className="lang-toggle" role="group" aria-label={t('language.label')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          className={language === lang ? 'active' : ''}
          title={t(`language.${lang}`)}
          aria-pressed={language === lang}
          onClick={() => setLanguage(lang)}
        >
          {full ? t(`language.${lang}`) : SHORT_LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
