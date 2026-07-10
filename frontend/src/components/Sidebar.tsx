import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, PBI, Room, User } from '../api'

export type AssigneeFilter = number | 'unassigned'

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  rooms: Room[]
  features: Feature[]
  users: User[]
  pbis: PBI[]
  roomFilter: number[]
  featureFilter: number[]
  assigneeFilter: AssigneeFilter[]
  onRoomFilter: (ids: number[]) => void
  onFeatureFilter: (ids: number[]) => void
  onAssigneeFilter: (filter: AssigneeFilter[]) => void
}

export function Sidebar({
  collapsed,
  onToggle,
  rooms,
  features,
  users,
  pbis,
  roomFilter,
  featureFilter,
  assigneeFilter,
  onRoomFilter,
  onFeatureFilter,
  onAssigneeFilter,
}: SidebarProps) {
  const { t } = useTranslation()
  const progressFor = (predicate: (pbi: PBI) => boolean) => {
    const scoped = pbis.filter(predicate)
    const done = scoped.filter((p) => p.status === 'done').length
    return { done, total: scoped.length }
  }

  if (collapsed) {
    return (
      <aside id="filters-sidebar" className="sidebar collapsed">
        <button
          type="button"
          className="sidebar-toggle"
          title={t('sidebar.showFilters')}
          aria-expanded={false}
          onClick={onToggle}
        >
          ▶
        </button>
      </aside>
    )
  }

  return (
    <aside id="filters-sidebar" className="sidebar">
      <div className="sidebar-header">
        <h2>{t('sidebar.filters')}</h2>
        <button
          type="button"
          className="sidebar-toggle"
          title={t('sidebar.hideFilters')}
          aria-expanded
          onClick={onToggle}
        >
          ◀
        </button>
      </div>
      <section className="sidebar-section">
        <h2>{t('common.rooms')}</h2>
        <button
          type="button"
          className={`filter-row${roomFilter.length === 0 ? ' active' : ''}`}
          onClick={() => onRoomFilter([])}
        >
          {t('sidebar.allRooms')}
        </button>
        <div className="filter-list">
          {rooms.map((room) => {
            const { done, total } = progressFor((p) => p.room_id === room.id)
            return (
              <FilterRow
                key={room.id}
                label={room.name}
                done={done}
                total={total}
                active={roomFilter.includes(room.id)}
                onClick={() => onRoomFilter(toggleValue(roomFilter, room.id))}
              />
            )
          })}
        </div>
      </section>

      <section className="sidebar-section">
        <h2>{t('common.features')}</h2>
        <button
          type="button"
          className={`filter-row${featureFilter.length === 0 ? ' active' : ''}`}
          onClick={() => onFeatureFilter([])}
        >
          {t('sidebar.allFeatures')}
        </button>
        <div className="filter-list">
          {features.map((feature) => {
            const { done, total } = progressFor((p) => p.feature_id === feature.id)
            return (
              <FilterRow
                key={feature.id}
                label={feature.name}
                done={done}
                total={total}
                active={featureFilter.includes(feature.id)}
                onClick={() => onFeatureFilter(toggleValue(featureFilter, feature.id))}
              />
            )
          })}
        </div>
      </section>

      <section className="sidebar-section">
        <h2>{t('common.people')}</h2>
        <button
          type="button"
          className={`filter-row${assigneeFilter.length === 0 ? ' active' : ''}`}
          onClick={() => onAssigneeFilter([])}
        >
          {t('sidebar.everyone')}
        </button>
        {(() => {
          const { done, total } = progressFor((p) => p.assignee_id === null)
          return (
            <FilterRow
              label={t('common.unassigned')}
              done={done}
              total={total}
              active={assigneeFilter.includes('unassigned')}
              avatar={<span className="avatar avatar-empty">?</span>}
              onClick={() => onAssigneeFilter(toggleValue(assigneeFilter, 'unassigned'))}
            />
          )
        })()}
        {users.map((user) => {
          const { done, total } = progressFor((p) => p.assignee_id === user.id)
          return (
            <FilterRow
              key={user.id}
              label={user.name}
              done={done}
              total={total}
              active={assigneeFilter.includes(user.id)}
              avatar={<span className="avatar">{user.name.charAt(0).toUpperCase()}</span>}
              onClick={() => onAssigneeFilter(toggleValue(assigneeFilter, user.id))}
            />
          )
        })}
      </section>
    </aside>
  )
}

interface FilterRowProps {
  label: string
  done: number
  total: number
  active: boolean
  avatar?: ReactNode
  onClick: () => void
}

function FilterRow({ label, done, total, active, avatar, onClick }: FilterRowProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className={`filter-row${active ? ' active' : ''}`}>
      {avatar}
      <button type="button" className="filter-main" onClick={onClick}>
        <span className="filter-label">
          {label}
          <span className="filter-count">
            {done}/{total}
          </span>
        </span>
        <span className="progress-track">
          <span className="progress-fill" style={{ width: `${percent}%` }} />
        </span>
      </button>
    </div>
  )
}
