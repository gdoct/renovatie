import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PBI, Room, Status, User } from '../api'
import { STATUSES } from '../api'

interface DashboardProps {
  currentUser: User
  users: User[]
  rooms: Room[]
  pbis: PBI[]
  onOpenRoom: (roomId: number) => void
}

interface Tip {
  x: number
  y: number
  text: string
}

function greetingKey(): string {
  const hour = new Date().getHours()
  const part = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  return `dashboard.greeting${part}`
}

function countByStatus(list: PBI[]): Record<Status, number> {
  return Object.fromEntries(
    STATUSES.map((status) => [status, list.filter((p) => p.status === status).length]),
  ) as Record<Status, number>
}

function totalCount(counts: Record<Status, number>): number {
  return STATUSES.reduce((sum, status) => sum + counts[status], 0)
}

export function Dashboard({ currentUser, users, rooms, pbis, onOpenRoom }: DashboardProps) {
  const { t } = useTranslation()
  const [tip, setTip] = useState<Tip | null>(null)

  const showTip = (event: MouseEvent, text: string) =>
    setTip({ x: event.clientX, y: event.clientY, text })
  const hideTip = () => setTip(null)

  const total = pbis.length
  const overall = countByStatus(pbis)
  const completion = total === 0 ? 0 : Math.round((overall.done / total) * 100)

  const allTasks = pbis.flatMap((p) => p.tasks)
  const openTasks = allTasks.filter((t) => t.status !== 'done')
  const myOpenPbis = pbis.filter((p) => p.assignee_id === currentUser.id && p.status !== 'done')
  const myOpenTasks = openTasks.filter((t) => t.assignee_id === currentUser.id)
  const unassignedOpen = pbis.filter((p) => p.assignee_id === null && p.status !== 'done')

  const workloadRows = [
    ...users.map((user) => ({
      key: `user-${user.id}`,
      label: user.name,
      counts: countByStatus(pbis.filter((p) => p.assignee_id === user.id)),
    })),
    {
      key: 'unassigned',
      label: t('common.unassigned'),
      counts: countByStatus(pbis.filter((p) => p.assignee_id === null)),
    },
  ]
  const maxWorkload = Math.max(1, ...workloadRows.map((r) => totalCount(r.counts)))

  return (
    <div className="dashboard">
      <section className="dash-hero">
        <div className="dash-hero-main">
          <p className="dash-greeting">{t(greetingKey(), { name: currentUser.name })}</p>
          <div className="hero-figure">{completion}%</div>
          <div
            className="meter"
            role="img"
            aria-label={t('dashboard.percentDone', { percent: completion })}
            onMouseMove={(e) => showTip(e, t('dashboard.pbisDone', { done: overall.done, total }))}
            onMouseLeave={hideTip}
          >
            <div className="meter-fill" style={{ width: `${completion}%` }} />
          </div>
          <p className="dash-subline">
            {t('dashboard.pbisDone', { done: overall.done, total })} ·{' '}
            {t('dashboard.openTasks', { count: openTasks.length })}
          </p>
        </div>
        <div className="stat-tiles">
          <StatTile
            label={t('dashboard.tileAssigned')}
            value={myOpenPbis.length}
            hint={t('dashboard.tileAssignedHint')}
          />
          <StatTile
            label={t('dashboard.tileOpenTasks')}
            value={myOpenTasks.length}
            hint={t('dashboard.tileOpenTasksHint')}
          />
          <StatTile
            label={t('dashboard.tileInProgress')}
            value={overall.in_progress}
            hint={t('dashboard.tileInProgressHint')}
          />
          <StatTile
            label={t('dashboard.tileUnassigned')}
            value={unassignedOpen.length}
            hint={t('dashboard.tileUnassignedHint')}
          />
        </div>
      </section>

      <section className="dash-charts">
        <div className="chart-card">
          <h3>{t('dashboard.byStatus')}</h3>
          {total === 0 ? (
            <p className="muted">{t('dashboard.noPbis')}</p>
          ) : (
            <>
              <StackedBar counts={overall} scale={1} showTip={showTip} hideTip={hideTip} />
              <Legend />
            </>
          )}
        </div>
        <div className="chart-card">
          <h3>{t('dashboard.workload')}</h3>
          <div className="workload">
            {workloadRows.map((row) => {
              const rowTotal = totalCount(row.counts)
              return (
                <div key={row.key} className="workload-row">
                  <span className="workload-label">{row.label}</span>
                  <div className="workload-bar">
                    {rowTotal > 0 && (
                      <StackedBar
                        counts={row.counts}
                        scale={rowTotal / maxWorkload}
                        showTip={(e, text) => showTip(e, `${row.label} — ${text}`)}
                        hideTip={hideTip}
                      />
                    )}
                    <span className="workload-total">{rowTotal}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <Legend />
        </div>
      </section>

      <h2 className="dash-section-title">{t('common.rooms')}</h2>
      {rooms.length === 0 && <p className="muted">{t('dashboard.noRooms')}</p>}
      <section className="room-grid">
        {rooms.map((room) => {
          const roomPbis = pbis.filter((p) => p.room_id === room.id)
          const counts = countByStatus(roomPbis)
          const roomTotal = roomPbis.length
          const percent = roomTotal === 0 ? 0 : Math.round((counts.done / roomTotal) * 100)
          const roomOpenTasks = roomPbis
            .flatMap((p) => p.tasks)
            .filter((t) => t.status !== 'done').length
          const mine = roomPbis.filter(
            (p) => p.assignee_id === currentUser.id && p.status !== 'done',
          ).length
          return (
            <button
              key={room.id}
              type="button"
              className="room-card"
              onClick={() => onOpenRoom(room.id)}
            >
              <span className="room-card-header">
                <span className="room-card-name">{room.name}</span>
                <span className="room-card-percent">{percent}%</span>
              </span>
              <span className="meter meter-sm">
                <span className="meter-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="room-card-stats">
                {roomTotal === 0 ? (
                  <span className="muted">{t('dashboard.noPbisShort')}</span>
                ) : (
                  STATUSES.map((status) => (
                    <span key={status} className="room-card-stat">
                      <span className={`swatch swatch-${status}`} />
                      {counts[status]} {t(`status.${status}`)}
                    </span>
                  ))
                )}
              </span>
              <span className="room-card-foot">
                {t('dashboard.openTasks', { count: roomOpenTasks })}
                {mine > 0 && ` · ${t('dashboard.assignedToYou', { count: mine })}`}
              </span>
            </button>
          )
        })}
      </section>

      {tip && (
        <div className="viz-tooltip" style={{ left: tip.x + 12, top: tip.y + 14 }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}

interface StatTileProps {
  label: string
  value: number
  hint: string
}

function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  )
}

interface StackedBarProps {
  counts: Record<Status, number>
  scale: number
  showTip: (event: MouseEvent, text: string) => void
  hideTip: () => void
}

function StackedBar({ counts, scale, showTip, hideTip }: StackedBarProps) {
  const { t } = useTranslation()
  const total = totalCount(counts)
  if (total === 0) return null
  return (
    <div className="stacked-bar" style={{ width: `${Math.max(scale * 100, 2)}%` }}>
      {STATUSES.filter((status) => counts[status] > 0).map((status) => (
        <div
          key={status}
          className={`stacked-segment segment-${status}`}
          style={{ flexGrow: counts[status] }}
          onMouseMove={(e) =>
            showTip(e, `${counts[status]} ${t(`status.${status}`).toLowerCase()}`)
          }
          onMouseLeave={hideTip}
        />
      ))}
    </div>
  )
}

function Legend(): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="viz-legend">
      {STATUSES.map((status) => (
        <span key={status} className="viz-legend-item">
          <span className={`swatch swatch-${status}`} />
          {t(`status.${status}`)}
        </span>
      ))}
    </div>
  )
}
