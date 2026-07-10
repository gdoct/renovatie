import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '../api'
import { LanguageToggle } from './LanguageToggle'

interface UserSelectProps {
  projectName: string
  users: User[]
  onSelect: (user: User) => void
  onCreate: (name: string) => void
  onBack: () => void
}

export function UserSelect({ projectName, users, onSelect, onCreate, onBack }: UserSelectProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
  }

  return (
    <div className="user-select">
      <div className="login-lang">
        <LanguageToggle full />
      </div>
      <div className="user-select-panel">
        <h1>{projectName}</h1>
        <p className="muted">{t('userSelect.subtitle')}</p>
        <div className="user-select-list">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className="user-select-card"
              onClick={() => onSelect(user)}
            >
              <span className="avatar avatar-lg">{user.name.charAt(0).toUpperCase()}</span>
              <span>{user.name}</span>
            </button>
          ))}
        </div>
        {users.length === 0 && <p className="muted">{t('userSelect.empty')}</p>}
        <form className="add-form" onSubmit={submit}>
          <input
            autoFocus
            value={name}
            placeholder={t('userSelect.addPlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={!name.trim()}>
            +
          </button>
        </form>
        <button type="button" className="link-button" onClick={onBack}>
          {t('userSelect.switchProject')}
        </button>
      </div>
    </div>
  )
}
