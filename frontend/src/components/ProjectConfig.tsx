import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { Feature, PBI, Project, Room, User } from '../api'
import { api, groupByFloor } from '../api'

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
  const { t } = useTranslation()
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
    if (room.is_floor && rooms.some((r) => r.parent_id === room.id)) {
      window.alert(t('config.floorHasRooms', { name: room.name }))
      return
    }
    const count = pbiCountForRoom(room.id)
    if (count > 0) {
      window.alert(t('config.roomHasPbis', { name: room.name, count }))
      return
    }
    if (!window.confirm(t('config.confirmDeleteRoom', { name: room.name }))) return
    void run(() => api.deleteRoom(room.id))
  }

  const floors = rooms.filter((r) => r.is_floor)

  const moveRoomToFloor = (room: Room, parentId: number | null) =>
    void run(() => api.updateRoom(room.id, { parent_id: parentId }))

  const deleteFeature = (feature: Feature) => {
    const count = pbiCountForFeature(feature.id)
    const suffix = count > 0 ? t('config.featurePbisNote', { count }) : ''
    if (!window.confirm(`${t('config.confirmDeleteFeature', { name: feature.name })}${suffix}`))
      return
    void run(() => api.deleteFeature(feature.id))
  }

  const removeMember = (user: User) => {
    if (!window.confirm(t('config.confirmRemoveMember', { name: user.name }))) return
    void run(() => api.removeProjectUser(project.id, user.id))
  }

  const deleteUser = (user: User) => {
    if (!window.confirm(t('config.confirmDeleteUser', { name: user.name }))) return
    void run(() => api.deleteUser(user.id))
  }

  const deleteProject = () => {
    void run(() => api.deleteProject(project.id)).then(onProjectDeleted)
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <h1>{t('app.projectSettings')}</h1>
        <button
          type="button"
          className="icon-button config-close"
          title={t('common.close')}
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="config-sections">
        <section className="config-section">
          <h2>{t('config.project')}</h2>
          <RenameForm
            label={t('config.projectName')}
            value={project.name}
            onSave={(name) => run(() => api.updateProject(project.id, { name }))}
          />
        </section>

        <section className="config-section">
          <h2>{t('common.rooms')}</h2>
          <ul className="config-list">
            {groupByFloor(rooms).map((group) => {
              const roomRow = (room: Room) => (
                <li
                  key={room.id}
                  className={`config-row${group.floor ? ' config-row-nested' : ''}`}
                >
                  <InlineRename
                    value={room.name}
                    onSave={(name) => run(() => api.updateRoom(room.id, { name }))}
                  />
                  {floors.length > 0 && (
                    <select
                      className="config-floor-select"
                      title={t('common.floor')}
                      value={room.parent_id ?? ''}
                      onChange={(e) =>
                        moveRoomToFloor(room, e.target.value === '' ? null : Number(e.target.value))
                      }
                    >
                      <option value="">{t('config.noFloor')}</option>
                      {floors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          {floor.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="muted">
                    {t('config.pbiCount', { count: pbiCountForRoom(room.id) })}
                  </span>
                  <button type="button" className="danger small" onClick={() => deleteRoom(room)}>
                    {t('common.delete')}
                  </button>
                </li>
              )
              if (group.floor === null) return group.rooms.map(roomRow)
              const floor = group.floor
              return (
                <Fragment key={`floor-${floor.id}`}>
                  <li className="config-row config-row-floor">
                    <InlineRename
                      value={floor.name}
                      onSave={(name) => run(() => api.updateRoom(floor.id, { name }))}
                    />
                    <span className="admin-badge">{t('common.floor')}</span>
                    <span className="muted">
                      {t('config.pbiCount', { count: pbiCountForRoom(floor.id) })}
                    </span>
                    <button
                      type="button"
                      className="danger small"
                      onClick={() => deleteRoom(floor)}
                    >
                      {t('common.delete')}
                    </button>
                  </li>
                  {group.rooms.map(roomRow)}
                </Fragment>
              )
            })}
          </ul>
          <AddRoomForm
            floors={floors}
            onAdd={(name, parentId) =>
              run(() => api.createRoom(name, project.id, { parent_id: parentId }))
            }
          />
          <AddForm
            placeholder={t('config.addFloorPlaceholder')}
            onAdd={(name) => run(() => api.createRoom(name, project.id, { is_floor: true }))}
          />
        </section>

        <section className="config-section">
          <h2>{t('common.features')}</h2>
          <ul className="config-list">
            {features.map((feature) => (
              <li key={feature.id} className="config-row">
                <InlineRename
                  value={feature.name}
                  onSave={(name) => run(() => api.updateFeature(feature.id, { name }))}
                />
                <span className="muted">
                  {t('config.pbiCount', { count: pbiCountForFeature(feature.id) })}
                </span>
                <button type="button" className="small" onClick={() => onOpenFeature(feature.id)}>
                  {t('common.open')}
                </button>
                <button
                  type="button"
                  className="danger small"
                  onClick={() => deleteFeature(feature)}
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
          <AddForm
            placeholder={t('config.addFeaturePlaceholder')}
            onAdd={(name) => run(() => api.createFeature(name, project.id))}
          />
        </section>

        <section className="config-section">
          <h2>{t('common.people')}</h2>
          <ul className="config-list">
            {members.map((user) => (
              <li key={user.id} className="config-row">
                <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span className="config-row-label">
                  {user.name}
                  {user.is_admin && <span className="admin-badge">{t('config.adminBadge')}</span>}
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
                    {t('config.admin')}
                  </label>
                )}
                <button type="button" className="small" onClick={() => removeMember(user)}>
                  {t('config.removeFromProject')}
                </button>
                {currentUser.is_admin && (
                  <button type="button" className="danger small" onClick={() => deleteUser(user)}>
                    {t('config.deleteUser')}
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
                <option value="">{t('config.addExistingUser')}</option>
                {nonMembers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <AddForm
            placeholder={t('config.createUserPlaceholder')}
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
            <h2>{t('config.dangerZone')}</h2>
            <p className="muted">
              <Trans
                i18nKey="config.dangerText"
                values={{ name: project.name }}
                components={{ bold: <strong /> }}
              />
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
                {t('config.deleteProject')}
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
  const { t } = useTranslation()
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
        {t('common.save')}
      </button>
    </form>
  )
}

interface InlineRenameProps {
  value: string
  onSave: (value: string) => Promise<void> | void
}

function InlineRename({ value, onSave }: InlineRenameProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        type="button"
        className="config-row-label config-rename"
        title={t('config.rename')}
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
        {t('common.save')}
      </button>
    </form>
  )
}

interface AddRoomFormProps {
  floors: Room[]
  onAdd: (name: string, parentId: number | null) => Promise<void> | void
}

// Add-room form with a floor picker; the chosen floor sticks so several rooms
// can be added to the same floor in a row.
function AddRoomForm({ floors, onAdd }: AddRoomFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void onAdd(
      trimmed,
      parentId !== null && floors.some((f) => f.id === parentId) ? parentId : null,
    )
    setName('')
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        value={name}
        placeholder={t('config.addRoomPlaceholder')}
        onChange={(e) => setName(e.target.value)}
      />
      {floors.length > 0 && (
        <select
          className="config-floor-select"
          title={t('common.floor')}
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{t('config.noFloor')}</option>
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      )}
      <button type="submit" disabled={!name.trim()}>
        +
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
