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
  const [floors, setFloors] = useState<string[]>([])
  const [floorDraft, setFloorDraft] = useState('')
  const [rooms, setRooms] = useState<{ name: string; floor: string | null }[]>([])
  const [roomDraft, setRoomDraft] = useState('')
  const [roomFloor, setRoomFloor] = useState<string | null>(null)
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

  const addFloor = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = floorDraft.trim()
    if (!trimmed || floors.includes(trimmed)) return
    setFloors([...floors, trimmed])
    setFloorDraft('')
  }

  const removeFloor = (floorName: string) => {
    setFloors(floors.filter((f) => f !== floorName))
    setRooms(rooms.map((r) => (r.floor === floorName ? { ...r, floor: null } : r)))
    if (roomFloor === floorName) setRoomFloor(null)
  }

  const addRoom = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = roomDraft.trim()
    if (!trimmed || rooms.some((r) => r.name === trimmed)) return
    setRooms([...rooms, { name: trimmed, floor: roomFloor }])
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
      const floorIds = new Map<string, number>()
      for (const floorName of floors) {
        const floor = await api.createRoom(floorName, project.id, { is_floor: true })
        floorIds.set(floorName, floor.id)
      }
      for (const room of rooms) {
        await api.createRoom(room.name, project.id, {
          parent_id: room.floor === null ? null : (floorIds.get(room.floor) ?? null),
        })
      }
      for (const userId of selectedUserIds) {
        await api.addProjectUser(project.id, userId)
      }
      const createdPasswords: string[] = []
      for (const userName of newUsers) {
        const user = await api.createUser(userName)
        await api.addProjectUser(project.id, user.id)
        createdPasswords.push(`${user.name}: ${user.password}`)
      }
      // Generated passwords are only returned at creation — show them once.
      if (createdPasswords.length > 0) {
        window.alert(`${t('wizard.userPasswords')}\n\n${createdPasswords.join('\n')}`)
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
            <p className="muted">{t('wizard.floorsHint')}</p>
            <ul className="wizard-list">
              {floors.map((floor) => (
                <li key={floor}>
                  {floor} <span className="muted">{t('common.floor')}</span>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('common.removeItem', { name: floor })}
                    onClick={() => removeFloor(floor)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form className="add-form" onSubmit={addFloor}>
              <input
                value={floorDraft}
                placeholder={t('config.addFloorPlaceholder')}
                onChange={(e) => setFloorDraft(e.target.value)}
              />
              <button type="submit" disabled={!floorDraft.trim()}>
                +
              </button>
            </form>
            <p className="muted">{t('wizard.roomsHint')}</p>
            <ul className="wizard-list">
              {rooms.map((room) => (
                <li key={room.name}>
                  {room.name}
                  {room.floor && <span className="muted"> · {room.floor}</span>}
                  <button
                    type="button"
                    className="icon-button"
                    title={t('common.removeItem', { name: room.name })}
                    onClick={() => setRooms(rooms.filter((r) => r.name !== room.name))}
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
              {floors.length > 0 && (
                <select
                  className="config-floor-select"
                  title={t('common.floor')}
                  value={roomFloor ?? ''}
                  onChange={(e) => setRoomFloor(e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">{t('config.noFloor')}</option>
                  {floors.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor}
                    </option>
                  ))}
                </select>
              )}
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
