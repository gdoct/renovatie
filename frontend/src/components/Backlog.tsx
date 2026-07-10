import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, PBI, Room, Status, User } from '../api'
import { comparePriority, costAmount, formatEuro, STATUSES } from '../api'

interface BacklogProps {
  pbis: PBI[]
  rooms: Room[]
  features: Feature[]
  users: User[]
  onMove: (pbiId: number, status: Status) => void
  onAssign: (pbiId: number, assigneeId: number | null) => void
  onSelect: (pbiId: number) => void
}

type SortKey = 'priority' | 'title' | 'room' | 'feature' | 'status' | 'assignee' | 'tasks' | 'costs'

interface SortState {
  key: SortKey
  dir: 1 | -1
}

interface BacklogRow {
  pbi: PBI
  rank: number
  roomName: string
  featureName: string
  assigneeName: string
  doneTasks: number
  totalTasks: number
  spent: number
  planned: number
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

function compareRows(a: BacklogRow, b: BacklogRow, key: SortKey): number {
  switch (key) {
    case 'priority':
      return a.rank - b.rank
    case 'title':
      return collator.compare(a.pbi.title, b.pbi.title)
    case 'room':
      return collator.compare(a.roomName, b.roomName)
    case 'feature':
      return collator.compare(a.featureName, b.featureName)
    case 'status':
      return STATUSES.indexOf(a.pbi.status) - STATUSES.indexOf(b.pbi.status)
    case 'assignee':
      return collator.compare(a.assigneeName, b.assigneeName)
    case 'tasks': {
      const ratio = (r: BacklogRow) => (r.totalTasks === 0 ? -1 : r.doneTasks / r.totalTasks)
      return ratio(a) - ratio(b) || a.totalTasks - b.totalTasks
    }
    case 'costs':
      return a.planned - b.planned
  }
}

export function Backlog({
  pbis,
  rooms,
  features,
  users,
  onMove,
  onAssign,
  onSelect,
}: BacklogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'priority', dir: 1 })

  const rows = useMemo(() => {
    const byPriority = [...pbis].sort(comparePriority)
    const needle = query.trim().toLowerCase()
    const filtered = byPriority
      .map((pbi, index): BacklogRow => ({
        pbi,
        rank: index + 1,
        roomName: rooms.find((r) => r.id === pbi.room_id)?.name ?? '',
        featureName: features.find((f) => f.id === pbi.feature_id)?.name ?? '',
        assigneeName: users.find((u) => u.id === pbi.assignee_id)?.name ?? '',
        doneTasks: pbi.tasks.filter((t) => t.status === 'done').length,
        totalTasks: pbi.tasks.length,
        spent: pbi.costs.filter((c) => c.purchased).reduce((sum, c) => sum + costAmount(c), 0),
        planned: pbi.costs.reduce((sum, c) => sum + costAmount(c), 0),
      }))
      .filter((row) => needle === '' || row.pbi.title.toLowerCase().includes(needle))
    return filtered.sort((a, b) => sort.dir * compareRows(a, b, sort.key) || a.rank - b.rank)
  }, [pbis, rooms, features, users, query, sort])

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    )
  }

  if (pbis.length === 0) {
    return <p className="muted">{t('backlog.emptyFiltered')}</p>
  }

  return (
    <div className="backlog">
      <div className="backlog-toolbar">
        <input
          type="search"
          className="backlog-search"
          placeholder={t('backlog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="backlog-count">
          {rows.length === pbis.length
            ? t('backlog.itemCount', { count: pbis.length })
            : t('backlog.itemCountFiltered', { shown: rows.length, total: pbis.length })}
        </span>
      </div>
      <div className="cost-table-wrap">
        <table className="cost-table backlog-table">
          <thead>
            <tr>
              <SortableTh
                label="#"
                k="priority"
                sort={sort}
                onSort={toggleSort}
                className="backlog-col-rank"
              />
              <SortableTh label={t('backlog.workItem')} k="title" sort={sort} onSort={toggleSort} />
              <SortableTh label={t('common.room')} k="room" sort={sort} onSort={toggleSort} />
              <SortableTh label={t('common.feature')} k="feature" sort={sort} onSort={toggleSort} />
              <SortableTh label={t('common.status')} k="status" sort={sort} onSort={toggleSort} />
              <SortableTh
                label={t('common.assignee')}
                k="assignee"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label={t('common.tasks')}
                k="tasks"
                sort={sort}
                onSort={toggleSort}
                className="backlog-col-tasks"
              />
              <SortableTh
                label={t('common.costs')}
                k="costs"
                sort={sort}
                onSort={toggleSort}
                className="cost-col-amount"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { pbi } = row
              const percent =
                row.totalTasks === 0 ? 0 : Math.round((row.doneTasks / row.totalTasks) * 100)
              return (
                <tr
                  key={pbi.id}
                  className={pbi.status === 'done' ? 'backlog-row-done' : ''}
                  onClick={() => onSelect(pbi.id)}
                >
                  <td className="backlog-col-rank">{row.rank}</td>
                  <td>
                    <span className="cost-item-title">{pbi.title}</span>
                    {pbi.description && <span className="cost-item-reason">{pbi.description}</span>}
                  </td>
                  <td>
                    {row.roomName && <span className="badge badge-room">{row.roomName}</span>}
                  </td>
                  <td>
                    {row.featureName && (
                      <span className="badge badge-feature">{row.featureName}</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className={`backlog-select status-${pbi.status}`}
                      value={pbi.status}
                      title={t('common.status')}
                      onChange={(e) => onMove(pbi.id, e.target.value as Status)}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`status.${status}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className={`backlog-select${pbi.assignee_id === null ? ' backlog-select-empty' : ''}`}
                      value={pbi.assignee_id ?? ''}
                      title={t('common.assignee')}
                      onChange={(e) =>
                        onAssign(pbi.id, e.target.value === '' ? null : Number(e.target.value))
                      }
                    >
                      <option value="">{t('common.unassigned')}</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="backlog-col-tasks">
                    {row.totalTasks > 0 ? (
                      <span className="backlog-progress">
                        <span className="progress-track">
                          <span className="progress-fill" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="backlog-progress-count">
                          {row.doneTasks}/{row.totalTasks}
                        </span>
                      </span>
                    ) : (
                      <span className="backlog-empty-cell">—</span>
                    )}
                  </td>
                  <td className="cost-col-amount">
                    {pbi.costs.length > 0 ? (
                      `${formatEuro(row.spent)} / ${formatEuro(row.planned)}`
                    ) : (
                      <span className="backlog-empty-cell">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr className="backlog-no-results">
                <td colSpan={8}>{t('backlog.noMatch', { query: query.trim() })}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface SortableThProps {
  label: string
  k: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  className?: string
}

function SortableTh({ label, k, sort, onSort, className }: SortableThProps) {
  const active = sort.key === k
  return (
    <th
      className={className}
      aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className={`backlog-sort${active ? ' active' : ''}`}
        onClick={() => onSort(k)}
      >
        {label}
        <span className="backlog-sort-arrow">{active ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )
}
