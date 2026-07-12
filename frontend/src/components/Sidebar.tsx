import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, PBI, Room, User } from '../api'
import { groupByFloor, roomScope } from '../api'

export type AssigneeFilter = number | 'unassigned'

const COLLAPSED_FLOORS_KEY = 'sidebar.collapsedFloors'

function loadCollapsedFloors(): number[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_FLOORS_KEY)
    if (raw) return (JSON.parse(raw) as number[]).filter((id) => typeof id === 'number')
  } catch {
    // treat as none collapsed
  }
  return []
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

// Plain click selects a single item (or clears it when it was the only selection);
// shift-click toggles the item within a multi-selection.
function selectValue<T>(values: T[], value: T, additive: boolean): T[] {
  if (additive) return toggleValue(values, value)
  return values.length === 1 && values[0] === value ? [] : [value]
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
  const [collapsedFloors, setCollapsedFloors] = useState<number[]>(loadCollapsedFloors)

  const toggleFloor = (floorId: number) => {
    setCollapsedFloors((current) => {
      const next = toggleValue(current, floorId)
      localStorage.setItem(COLLAPSED_FLOORS_KEY, JSON.stringify(next))
      return next
    })
  }

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
          {groupByFloor(rooms).map((group) => {
            const rows = group.rooms.map((room) => {
              const { done, total } = progressFor((p) => p.room_id === room.id)
              return (
                <FilterRow
                  key={room.id}
                  label={room.name}
                  done={done}
                  total={total}
                  active={roomFilter.includes(room.id)}
                  nested={group.floor !== null}
                  onClick={(e) => onRoomFilter(selectValue(roomFilter, room.id, e.shiftKey))}
                />
              )
            })
            if (group.floor === null) return rows
            const floor = group.floor
            const isCollapsed = collapsedFloors.includes(floor.id)
            // A floor's progress spans its own PBIs plus those of its rooms.
            const scope = roomScope(rooms, floor.id)
            const { done, total } = progressFor((p) => scope.includes(p.room_id))
            return (
              <div key={`floor-${floor.id}`} className="filter-group">
                <FilterRow
                  label={floor.name}
                  done={done}
                  total={total}
                  active={roomFilter.includes(floor.id)}
                  avatar={
                    <button
                      type="button"
                      className="floor-chevron"
                      title={t(isCollapsed ? 'sidebar.expandFloor' : 'sidebar.collapseFloor', {
                        name: floor.name,
                      })}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleFloor(floor.id)}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  }
                  onClick={(e) => onRoomFilter(selectValue(roomFilter, floor.id, e.shiftKey))}
                />
                {!isCollapsed && rows}
              </div>
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
                onClick={(e) => onFeatureFilter(selectValue(featureFilter, feature.id, e.shiftKey))}
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
              onClick={(e) =>
                onAssigneeFilter(selectValue(assigneeFilter, 'unassigned', e.shiftKey))
              }
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
              onClick={(e) => onAssigneeFilter(selectValue(assigneeFilter, user.id, e.shiftKey))}
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
  nested?: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

function FilterRow({ label, done, total, active, avatar, nested, onClick }: FilterRowProps) {
  const { t } = useTranslation()
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className={`filter-row${active ? ' active' : ''}${nested ? ' filter-row-nested' : ''}`}>
      {avatar}
      <button
        type="button"
        className="filter-main"
        title={t('sidebar.shiftClickHint')}
        onClick={onClick}
      >
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
