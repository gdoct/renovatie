import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Project, User } from '../api'
import { api } from '../api'
import { Modal } from './Modal'

interface NewProjectWizardProps {
  onDone: (project: Project) => void
  onClose: () => void
}

const STEPS = ['Name', 'Rooms', 'People'] as const

export function NewProjectWizard({ onDone, onClose }: NewProjectWizardProps) {
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
      setError(e instanceof Error ? e.message : 'Could not create the project')
      setSaving(false)
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <div className="wizard">
        <div className="wizard-steps">
          {STEPS.map((label, index) => (
            <span key={label} className={`wizard-step${index === step ? ' active' : ''}`}>
              {index + 1}. {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <p className="muted">What are you renovating?</p>
            <input
              autoFocus
              value={name}
              placeholder="Project name…"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <p className="muted">Add the rooms you will work on. You can always add more later.</p>
            <ul className="wizard-list">
              {rooms.map((room) => (
                <li key={room}>
                  {room}
                  <button
                    type="button"
                    className="icon-button"
                    title={`Remove ${room}`}
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
                placeholder="Add room…"
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
            <p className="muted">Who is joining this project?</p>
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
                  {userName} <span className="muted">(new)</span>
                  <button
                    type="button"
                    className="icon-button"
                    title={`Remove ${userName}`}
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
                placeholder="Add new user…"
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
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="primary"
              onClick={() => setStep(step + 1)}
              disabled={!name.trim()}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void finish()}
              disabled={!name.trim() || saving}
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
