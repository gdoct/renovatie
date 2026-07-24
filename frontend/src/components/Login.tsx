import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '../api'
import { api } from '../api'
import { LanguageToggle } from './LanguageToggle'

interface LoginProps {
  onLogin: (user: User) => void
}

// Sign-in screen; on a fresh install (no users yet) it first offers creating
// the initial admin account and shows its generated password once.
export function Login({ onLogin }: LoginProps) {
  const { t } = useTranslation()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .setupStatus()
      .then(({ needs_setup }) => setNeedsSetup(needs_setup))
      .catch(() => setError(t('errors.backendUnreachable')))
  }, [t])

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      onLogin(await api.login(name.trim(), password))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'))
      setBusy(false)
    }
  }

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const user = await api.createUser(name.trim())
      setCreatedPassword(user.password)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const errorLine = error && (
    <p className="wizard-error" role="alert">
      {error}
    </p>
  )

  return (
    <div className="user-select">
      <div className="login-lang">
        <LanguageToggle full />
      </div>
      <div className="user-select-panel">
        <h1>
          <img src="/favicon.svg" alt="Renovatie" className="login-logo" />
        </h1>

        {needsSetup === null ? (
          <>
            {errorLine}
            <p className="muted">{t('common.loading')}</p>
          </>
        ) : createdPassword !== null ? (
          <>
            <p className="muted">{t('login.setupDone', { name: name.trim() })}</p>
            <p className="password-reveal">{createdPassword}</p>
            <p className="muted">{t('login.passwordOnce')}</p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setCreatedPassword(null)
                setNeedsSetup(false)
                setPassword('')
              }}
            >
              {t('login.continueToLogin')}
            </button>
          </>
        ) : needsSetup ? (
          <>
            <p className="muted">{t('login.setupSubtitle')}</p>
            <form className="login-form" onSubmit={(e) => void submitSetup(e)}>
              <input
                autoFocus
                value={name}
                placeholder={t('login.namePlaceholder')}
                autoComplete="username"
                onChange={(e) => setName(e.target.value)}
              />
              {errorLine}
              <button type="submit" className="primary" disabled={!name.trim() || busy}>
                {t('login.createAdmin')}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="muted">{t('login.subtitle')}</p>
            <form className="login-form" onSubmit={(e) => void submitLogin(e)}>
              <input
                autoFocus
                value={name}
                placeholder={t('login.namePlaceholder')}
                autoComplete="username"
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="password"
                value={password}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              {errorLine}
              <button
                type="submit"
                className="primary"
                disabled={!name.trim() || !password || busy}
              >
                {busy ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>
            <div className="certificate-help">
              <a href="/renovatie-ca.crt">{t('login.downloadCertificate')}</a>
              <p>{t('login.certificateHelp')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
