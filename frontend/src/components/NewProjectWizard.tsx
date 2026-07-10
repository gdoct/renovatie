import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, User } from '../api'
import { api } from '../api'
import { Modal } from './Modal'

interface NewProjectWizardProps {
  onDone: (project: Project) => void
  onClose: () => void
}

const STEPS = ['common.name', 'common.rooms', 'common.people'] as const

export function NewProjectWizard({ onDone, onClose }: NewProjectWizardProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [rooms, setRooms] = useState<string[]>([])
  const [roomDraft, setRoomDraft] = useState('')
  const [globalUsers, setGlobalUsers] = useState<User[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [newUsers, setNewUsers] = useState<string[]>([])
  const [userDraft, setUserDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .listUsers()
      .then(setGlobalUsers)
      .catch(() => setGlobalUsers([]))
  }, [])

  const addRoom = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = roomDraft.trim()
    if (!trimmed || rooms.includes(trimmed)) return
    setRooms([...rooms, trimmed])
    setRoomDraft('')
  }

  const addUser = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = userDraft.trim()
    if (!trimmed || newUsers.includes(trimmed)) return
    setNewUsers([...newUsers, trimmed])
    setUserDraft('')
  }

  const toggleUser = (id: number) => {
    setSelectedUserIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    )
  }

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      const project = await api.createProject(name.trim())
      for (const roomName of rooms) {
        await api.createRoom(roomName, project.id)
      }
      for (const userId of selectedUserIds) {
        await api.addProjectUser(project.id, userId)
      }
      for (const userName of newUsers) {
        const user = await api.createUser(userName)
        await api.addProjectUser(project.id, user.id)
      }
      onDone(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('wizard.createError'))
      setSaving(false)
    }
  }

  return (
    <Modal title={t('wizard.title')} onClose={onClose}>
      <div className="wizard">
        <div className="wizard-steps">
          {STEPS.map((labelKey, index) => (
            <span key={labelKey} className={`wizard-step${index === step ? ' active' : ''}`}>
              {index + 1}. {t(labelKey)}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <p className="muted">{t('wizard.whatRenovating')}</p>
            <input
              autoFocus
              value={name}
              placeholder={t('wizard.projectNamePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <p className="muted">{t('wizard.roomsHint')}</p>
            <ul className="wizard-list">
              {rooms.map((room) => (
                <li key={room}>
                  {room}
                  <button
                    type="button"
                    className="icon-button"
                    title={t('common.removeItem', { name: room })}
                    onClick={() => setRooms(rooms.filter((r) => r !== room))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form className="add-form" onSubmit={addRoom}>
              <input
                autoFocus
                value={roomDraft}
                placeholder={t('config.addRoomPlaceholder')}
                onChange={(e) => setRoomDraft(e.target.value)}
              />
              <button type="submit" disabled={!roomDraft.trim()}>
                +
              </button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <p className="muted">{t('wizard.whoJoining')}</p>
            {globalUsers.length > 0 && (
              <div className="wizard-user-list">
                {globalUsers.map((user) => (
                  <label key={user.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                    {user.name}
                  </label>
                ))}
              </div>
            )}
            <ul className="wizard-list">
              {newUsers.map((userName) => (
                <li key={userName}>
                  {userName} <span className="muted">{t('wizard.newTag')}</span>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('common.removeItem', { name: userName })}
                    onClick={() => setNewUsers(newUsers.filter((u) => u !== userName))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form className="add-form" onSubmit={addUser}>
              <input
                value={userDraft}
                placeholder={t('wizard.addUserPlaceholder')}
                onChange={(e) => setUserDraft(e.target.value)}
              />
              <button type="submit" disabled={!userDraft.trim()}>
                +
              </button>
            </form>
          </div>
        )}

        {error && <p className="wizard-error">{error}</p>}

        <div className="modal-actions">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} disabled={saving}>
              {t('common.back')}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="primary"
              onClick={() => setStep(step + 1)}
              disabled={!name.trim()}
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void finish()}
              disabled={!name.trim() || saving}
            >
              {saving ? t('wizard.creating') : t('wizard.createProject')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
