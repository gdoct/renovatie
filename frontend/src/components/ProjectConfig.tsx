import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Feature, PBI, Project, Room, User } from '../api'
import { api } from '../api'

interface ProjectConfigProps {
  project: Project
  rooms: Room[]
  features: Feature[]
  members: User[]
  pbis: PBI[]
  currentUser: User
  run: (action: () => Promise<unknown>) => Promise<void>
  onOpenFeature: (id: number) => void
  onProjectDeleted: () => void
  onClose: () => void
}

export function ProjectConfig({
  project,
  rooms,
  features,
  members,
  pbis,
  currentUser,
  run,
  onOpenFeature,
  onProjectDeleted,
  onClose,
}: ProjectConfigProps) {
  const [globalUsers, setGlobalUsers] = useState<User[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    api
      .listUsers()
      .then(setGlobalUsers)
      .catch(() => setGlobalUsers([]))
  }, [members])

  const nonMembers = globalUsers.filter((user) => !members.some((m) => m.id === user.id))
  const pbiCountForRoom = (roomId: number) => pbis.filter((p) => p.room_id === roomId).length
  const pbiCountForFeature = (featureId: number) =>
    pbis.filter((p) => p.feature_id === featureId).length

  const deleteRoom = (room: Room) => {
    const count = pbiCountForRoom(room.id)
    if (count > 0) {
      window.alert(`"${room.name}" still has ${count} PBI(s); move or delete them first.`)
      return
    }
    if (!window.confirm(`Delete room "${room.name}"?`)) return
    void run(() => api.deleteRoom(room.id))
  }

  const deleteFeature = (feature: Feature) => {
    const count = pbiCountForFeature(feature.id)
    const suffix = count > 0 ? ` ${count} PBI(s) will keep existing without a feature.` : ''
    if (!window.confirm(`Delete feature "${feature.name}"?${suffix}`)) return
    void run(() => api.deleteFeature(feature.id))
  }

  const removeMember = (user: User) => {
    if (
      !window.confirm(
        `Remove ${user.name} from this project? Their assignments in this project will be cleared.`,
      )
    )
      return
    void run(() => api.removeProjectUser(project.id, user.id))
  }

  const deleteUser = (user: User) => {
    if (
      !window.confirm(
        `Delete ${user.name} everywhere? They will be removed from all projects and unassigned from all work.`,
      )
    )
      return
    void run(() => api.deleteUser(user.id))
  }

  const deleteProject = () => {
    void run(() => api.deleteProject(project.id)).then(onProjectDeleted)
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <h1>Project settings</h1>
        <button type="button" className="icon-button config-close" title="Close" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="config-sections">
        <section className="config-section">
          <h2>Project</h2>
          <RenameForm
            label="Project name"
            value={project.name}
            onSave={(name) => run(() => api.updateProject(project.id, { name }))}
          />
        </section>

        <section className="config-section">
          <h2>Rooms</h2>
          <ul className="config-list">
            {rooms.map((room) => (
              <li key={room.id} className="config-row">
                <InlineRename
                  value={room.name}
                  onSave={(name) => run(() => api.updateRoom(room.id, { name }))}
                />
                <span className="muted">{pbiCountForRoom(room.id)} PBIs</span>
                <button type="button" className="danger small" onClick={() => deleteRoom(room)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <AddForm
            placeholder="Add room…"
            onAdd={(name) => run(() => api.createRoom(name, project.id))}
          />
        </section>

        <section className="config-section">
          <h2>Features</h2>
          <ul className="config-list">
            {features.map((feature) => (
              <li key={feature.id} className="config-row">
                <InlineRename
                  value={feature.name}
                  onSave={(name) => run(() => api.updateFeature(feature.id, { name }))}
                />
                <span className="muted">{pbiCountForFeature(feature.id)} PBIs</span>
                <button type="button" className="small" onClick={() => onOpenFeature(feature.id)}>
                  Open
                </button>
                <button
                  type="button"
                  className="danger small"
                  onClick={() => deleteFeature(feature)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <AddForm
            placeholder="Add feature…"
            onAdd={(name) => run(() => api.createFeature(name, project.id))}
          />
        </section>

        <section className="config-section">
          <h2>People</h2>
          <ul className="config-list">
            {members.map((user) => (
              <li key={user.id} className="config-row">
                <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span className="config-row-label">
                  {user.name}
                  {user.is_admin && <span className="admin-badge">admin</span>}
                </span>
                {currentUser.is_admin && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={user.is_admin}
                      onChange={(e) =>
                        void run(() => api.updateUser(user.id, { is_admin: e.target.checked }))
                      }
                    />
                    Admin
                  </label>
                )}
                <button type="button" className="small" onClick={() => removeMember(user)}>
                  Remove from project
                </button>
                {currentUser.is_admin && (
                  <button type="button" className="danger small" onClick={() => deleteUser(user)}>
                    Delete user
                  </button>
                )}
              </li>
            ))}
          </ul>
          {nonMembers.length > 0 && (
            <div className="config-add-member">
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value)
                  if (id) void run(() => api.addProjectUser(project.id, id))
                }}
              >
                <option value="">Add existing user…</option>
                {nonMembers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <AddForm
            placeholder="Create new user…"
            onAdd={(name) =>
              run(async () => {
                const user = await api.createUser(name)
                await api.addProjectUser(project.id, user.id)
              })
            }
          />
        </section>

        {currentUser.is_admin && (
          <section className="config-section danger-zone">
            <h2>Danger zone</h2>
            <p className="muted">
              Deleting this project permanently removes all its rooms, features, PBIs, tasks,
              costs and comments. Type <strong>{project.name}</strong> to confirm.
            </p>
            <div className="config-danger-row">
              <input
                value={deleteConfirm}
                placeholder={project.name}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <button
                type="button"
                className="danger"
                disabled={deleteConfirm !== project.name}
                onClick={deleteProject}
              >
                Delete project
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

interface RenameFormProps {
  label: string
  value: string
  onSave: (value: string) => Promise<void> | void
}

function RenameForm({ label, value, onSave }: RenameFormProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) return
    void onSave(trimmed)
  }

  return (
    <form className="add-form" onSubmit={submit} aria-label={label}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" disabled={!draft.trim() || draft.trim() === value}>
        Save
      </button>
    </form>
  )
}

interface InlineRenameProps {
  value: string
  onSave: (value: string) => Promise<void> | void
}

function InlineRename({ value, onSave }: InlineRenameProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        type="button"
        className="config-row-label config-rename"
        title="Rename"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value}
      </button>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed || trimmed === value) return
    void onSave(trimmed)
  }

  return (
    <form className="add-form config-rename-form" onSubmit={submit}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
      />
      <button type="submit" onMouseDown={(e) => e.preventDefault()} disabled={!draft.trim()}>
        Save
      </button>
    </form>
  )
}

interface AddFormProps {
  placeholder: string
  onAdd: (name: string) => Promise<void> | void
}

function AddForm({ placeholder, onAdd }: AddFormProps) {
  const [value, setValue] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = value.trim()
    if (!name) return
    void onAdd(name)
    setValue('')
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" disabled={!value.trim()}>
        +
      </button>
    </form>
  )
}
