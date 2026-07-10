import { Fragment, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, PBI, Room, Status, User } from '../api'
import { comparePriority, costAmount, formatEuro, STATUSES } from '../api'

interface BoardProps {
  pbis: PBI[]
  rooms: Room[]
  features: Feature[]
  users: User[]
  onMove: (pbiId: number, status: Status, priority?: number) => void
  onAssign: (pbiId: number, assigneeId: number | null) => void
  onToggleTask: (taskId: number, done: boolean) => void
  onToggleCost: (costId: number, purchased: boolean) => void
  onSelect: (pbiId: number) => void
}

interface DropTarget {
  status: Status
  index: number
}

const HIDDEN_COLUMNS_KEY = 'board.hiddenColumns'
const HIDEABLE_STATUSES: Status[] = ['todo', 'done']

function loadHiddenColumns(): Status[] {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (raw) return (JSON.parse(raw) as Status[]).filter((s) => HIDEABLE_STATUSES.includes(s))
  } catch {
    // fall through to the legacy key
  }
  return localStorage.getItem('board.hideBacklog') === 'true' ? ['todo'] : []
}

export function Board({
  pbis,
  rooms,
  features,
  users,
  onMove,
  onAssign,
  onToggleTask,
  onToggleCost,
  onSelect,
}: BoardProps) {
  const { t } = useTranslation()
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Status[]>(loadHiddenColumns)

  const toggleColumn = (status: Status) => {
    setHiddenColumns((hidden) => {
      const next = hidden.includes(status)
        ? hidden.filter((s) => s !== status)
        : [...hidden, status]
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(next))
      return next
    })
  }

  const clearDrag = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleDrop = (event: DragEvent, status: Status, cards: PBI[]) => {
    event.preventDefault()
    const index = dropTarget?.status === status ? dropTarget.index : cards.length
    clearDrag()
    const id = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isNaN(id)) return
    // New priority is the midpoint of the visible neighbours around the drop slot.
    // Only the dragged PBI is written; everything else keeps its priority.
    const others = cards.filter((p) => p.id !== id)
    const draggedAt = cards.findIndex((p) => p.id === id)
    const slot = draggedAt !== -1 && draggedAt < index ? index - 1 : index
    const above = slot > 0 ? others[slot - 1] : undefined
    const below = slot < others.length ? others[slot] : undefined
    let priority: number | undefined
    if (above && below) priority = (above.priority + below.priority) / 2
    else if (above) priority = above.priority + 1
    else if (below) priority = below.priority - 1
    onMove(id, status, priority)
  }

  return (
    <div className="board">
      {STATUSES.map((status) => {
        const cards = pbis.filter((p) => p.status === status).sort(comparePriority)
        const indicatorAt = dropTarget?.status === status ? dropTarget.index : null
        if (hiddenColumns.includes(status)) {
          return (
            <button
              key={status}
              type="button"
              className="column column-collapsed"
              title={t('board.showColumn', { column: t(`status.${status}`) })}
              onClick={() => toggleColumn(status)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                clearDrag()
                const id = Number(e.dataTransfer.getData('text/plain'))
                if (!Number.isNaN(id)) onMove(id, status)
              }}
            >
              <span className="collapsed-label">{t(`status.${status}`)}</span>
              <span className="count">{cards.length}</span>
            </button>
          )
        }
        return (
          <section
            key={status}
            className={`column column-${status}${indicatorAt !== null ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDropTarget({ status, index: cards.length })
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
            }}
            onDrop={(e) => handleDrop(e, status, cards)}
          >
            <h2 className="column-title">
              {t(`status.${status}`)}
              <span className="count">{cards.length}</span>
              {HIDEABLE_STATUSES.includes(status) && (
                <button
                  type="button"
                  className="column-hide"
                  title={t('board.hideColumn', { column: t(`status.${status}`) })}
                  onClick={() => toggleColumn(status)}
                >
                  {status === 'done' ? '»' : '«'}
                </button>
              )}
            </h2>
            <div className="column-cards">
              {cards.map((pbi, index) => (
                <Fragment key={pbi.id}>
                  {indicatorAt === index && <div className="drop-indicator" />}
                  <PBICard
                    pbi={pbi}
                    room={rooms.find((r) => r.id === pbi.room_id)}
                    feature={features.find((f) => f.id === pbi.feature_id)}
                    users={users}
                    dragging={draggingId === pbi.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(pbi.id))
                      setDraggingId(pbi.id)
                    }}
                    onDragEnd={clearDrag}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const rect = e.currentTarget.getBoundingClientRect()
                      const before = e.clientY < rect.top + rect.height / 2
                      setDropTarget({ status, index: before ? index : index + 1 })
                    }}
                    onAssign={onAssign}
                    onToggleTask={onToggleTask}
                    onToggleCost={onToggleCost}
                    onSelect={onSelect}
                  />
                </Fragment>
              ))}
              {indicatorAt === cards.length && <div className="drop-indicator" />}
            </div>
          </section>
        )
      })}
    </div>
  )
}

interface PBICardProps {
  pbi: PBI
  room: Room | undefined
  feature: Feature | undefined
  users: User[]
  dragging: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onAssign: (pbiId: number, assigneeId: number | null) => void
  onToggleTask: (taskId: number, done: boolean) => void
  onToggleCost: (costId: number, purchased: boolean) => void
  onSelect: (pbiId: number) => void
}

function PBICard({
  pbi,
  room,
  feature,
  users,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onAssign,
  onToggleTask,
  onToggleCost,
  onSelect,
}: PBICardProps) {
  const { t } = useTranslation()
  const doneTasks = pbi.tasks.filter((task) => task.status === 'done').length
  const assignee = users.find((u) => u.id === pbi.assignee_id)
  const spent = pbi.costs.filter((c) => c.purchased).reduce((sum, c) => sum + costAmount(c), 0)
  const planned = pbi.costs.reduce((sum, c) => sum + costAmount(c), 0)

  return (
    <article
      className={`card${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={() => onSelect(pbi.id)}
    >
      <h3 className="card-title">{pbi.title}</h3>
      <div className="card-meta">
        {room && <span className="badge badge-room">{room.name}</span>}
        {feature && <span className="badge badge-feature">{feature.name}</span>}
        {pbi.tasks.length > 0 && (
          <span className="badge badge-tasks">
            {t('board.tasksCount', { done: doneTasks, total: pbi.tasks.length })}
          </span>
        )}
        {pbi.costs.length > 0 && (
          <span className="badge badge-costs" title={t('board.spentPlanned')}>
            {formatEuro(spent)} / {formatEuro(planned)}
          </span>
        )}
      </div>
      <div className="card-assignee" onClick={(e) => e.stopPropagation()}>
        <span className={`avatar avatar-sm${assignee ? '' : ' avatar-empty'}`}>
          {assignee ? assignee.name.charAt(0).toUpperCase() : '?'}
        </span>
        <select
          className="assignee-select"
          value={pbi.assignee_id ?? ''}
          title={t('common.assignee')}
          onChange={(e) => onAssign(pbi.id, e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{t('common.unassigned')}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      {pbi.costs.length > 0 && (
        <ul className="card-costs">
          {pbi.costs.map((cost) => (
            <li key={cost.id} className={`card-cost${cost.purchased ? ' cost-purchased' : ''}`}>
              <input
                type="checkbox"
                className="cost-check"
                checked={cost.purchased}
                title={cost.purchased ? t('costs.markNotPurchased') : t('costs.markPurchased')}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggleCost(cost.id, e.target.checked)}
              />
              <span className="cost-title">{cost.title}</span>
              <span className="cost-amount">{formatEuro(costAmount(cost))}</span>
            </li>
          ))}
        </ul>
      )}
      {pbi.tasks.length > 0 && (
        <ul className="card-tasks">
          {pbi.tasks.map((task) => (
            <li key={task.id} className={`card-task task-${task.status}`}>
              <input
                type="checkbox"
                className="task-check"
                checked={task.status === 'done'}
                title={task.status === 'done' ? t('tasks.reopen') : t('tasks.markDone')}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggleTask(task.id, e.target.checked)}
              />
              <span className="task-title">{task.title}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
