import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, FeatureDependency, PBI } from '../api'

interface TimelineProps {
  features: Feature[]
  pbis: PBI[]
  dependencies: FeatureDependency[]
  onSchedule: (featureId: number, start: string | null, end: string | null) => void
  onAddDependency: (featureId: number, pbiId: number) => void
  onRemoveDependency: (featureId: number, dependencyId: number) => void
  onOpenFeature: (featureId: number) => void
}

type Zoom = 'week' | 'month' | 'quarter'

const ZOOM_KEY = 'renovatie.timelineZoom'
const DAY_MS = 86_400_000
const ROW_HEIGHT = 44
const BAR_HEIGHT = 26
// Pixels per day; the header granularity follows the zoom level.
const DAY_WIDTH: Record<Zoom, number> = { week: 44, month: 11, quarter: 4 }
const ZOOMS: Zoom[] = ['week', 'month', 'quarter']

const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00`)

const toIso = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// Calendar-day difference; rounding absorbs DST offsets.
const diffDays = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS)

const startOfWeek = (date: Date): Date => addDays(date, -((date.getDay() + 6) % 7))

const today = (): Date => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

const isoWeek = (date: Date): number => {
  const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(thursday.getFullYear(), 0, 4)
  return 1 + Math.round((diffDays(startOfWeek(week1), thursday) - 3) / 7)
}

interface ScheduledFeature {
  feature: Feature
  start: Date
  end: Date
  done: number
  total: number
}

// How a dependency currently stands, from strong to weak signal:
// conflict — blocker PBI not done and the feature starts before the blocker's
// planned end; unplanned — blocker not on the timeline so nothing can be said;
// done — satisfied; pending — waiting, but the schedule is consistent.
type DepState = 'done' | 'conflict' | 'unplanned' | 'pending'

interface DepInfo {
  dep: FeatureDependency
  pbi: PBI
  blockerFeature: Feature | null
  state: DepState
}

interface DragState {
  featureId: number
  mode: 'move' | 'start' | 'end'
  originX: number
  days: number
  moved: boolean
}

interface Tip {
  x: number
  y: number
  text: string
}

export function Timeline({
  features,
  pbis,
  dependencies,
  onSchedule,
  onAddDependency,
  onRemoveDependency,
  onOpenFeature,
}: TimelineProps) {
  const { t, i18n } = useTranslation()
  const [zoom, setZoom] = useState<Zoom>(() => {
    const stored = localStorage.getItem(ZOOM_KEY)
    return stored === 'week' || stored === 'month' || stored === 'quarter' ? stored : 'month'
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const dayWidth = DAY_WIDTH[zoom]
  const locale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const monthName = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  )
  const monthShort = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale])
  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    [locale],
  )

  const progressOf = (featureId: number): { done: number; total: number } => {
    const scoped = pbis.filter((p) => p.feature_id === featureId)
    return { done: scoped.filter((p) => p.status === 'done').length, total: scoped.length }
  }

  // The drag preview shifts dates locally; the change is only persisted on release.
  const previewDates = (feature: Feature): { start: Date; end: Date } | null => {
    if (feature.start_date === null || feature.end_date === null) return null
    let start = parseDate(feature.start_date)
    let end = parseDate(feature.end_date)
    if (drag && drag.featureId === feature.id) {
      if (drag.mode !== 'end') start = addDays(start, drag.days)
      if (drag.mode !== 'start') end = addDays(end, drag.days)
      if (start > end) {
        if (drag.mode === 'start') start = end
        else end = start
      }
    }
    return { start, end }
  }

  const scheduled: ScheduledFeature[] = useMemo(
    () =>
      features
        .filter((f) => f.start_date !== null && f.end_date !== null)
        .map((f) => ({
          feature: f,
          start: parseDate(f.start_date as string),
          end: parseDate(f.end_date as string),
          ...progressOf(f.id),
        }))
        .sort(
          (a, b) =>
            a.start.getTime() - b.start.getTime() ||
            a.end.getTime() - b.end.getTime() ||
            a.feature.name.localeCompare(b.feature.name),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, pbis],
  )
  const unscheduled = features.filter((f) => f.start_date === null || f.end_date === null)

  // Range: everything scheduled plus today, padded and snapped to Mondays so
  // the weekend shading pattern can anchor at x=0.
  const { rangeStart, totalDays } = useMemo(() => {
    const now = today()
    let min = now
    let max = now
    for (const row of scheduled) {
      if (row.start < min) min = row.start
      if (row.end > max) max = row.end
    }
    const pad = zoom === 'week' ? 7 : zoom === 'month' ? 21 : 45
    const start = startOfWeek(addDays(min, -pad))
    const end = addDays(max, pad)
    return { rangeStart: start, totalDays: diffDays(start, end) + 1 }
  }, [scheduled, zoom])

  const xOf = (date: Date): number => diffDays(rangeStart, date) * dayWidth
  const todayX = xOf(today())

  // Row geometry for the current render, preview included — bars and arrows share it.
  const rows = scheduled.map((row, index) => {
    const dates = previewDates(row.feature) ?? { start: row.start, end: row.end }
    return {
      ...row,
      ...dates,
      index,
      left: xOf(dates.start),
      width: (diffDays(dates.start, dates.end) + 1) * dayWidth,
    }
  })

  const depInfos: DepInfo[] = useMemo(() => {
    return dependencies.flatMap((dep) => {
      const pbi = pbis.find((p) => p.id === dep.depends_on_pbi_id)
      if (!pbi) return []
      const dependent = features.find((f) => f.id === dep.feature_id)
      const blockerFeature =
        pbi.feature_id === null ? null : (features.find((f) => f.id === pbi.feature_id) ?? null)
      let state: DepState = 'pending'
      if (pbi.status === 'done') {
        state = 'done'
      } else if (blockerFeature?.end_date == null) {
        state = 'unplanned'
      } else if (dependent?.start_date != null && dependent.start_date <= blockerFeature.end_date) {
        state = 'conflict'
      }
      return [{ dep, pbi, blockerFeature, state }]
    })
  }, [dependencies, pbis, features])

  const conflictsOf = (featureId: number): DepInfo[] =>
    depInfos.filter((d) => d.dep.feature_id === featureId && d.state === 'conflict')

  // Arrows need both endpoints on the chart.
  const arrows = depInfos.flatMap((info) => {
    const from = rows.find((r) => r.feature.id === info.blockerFeature?.id)
    const to = rows.find((r) => r.feature.id === info.dep.feature_id)
    if (!from || !to) return []
    return [
      {
        key: info.dep.id,
        x1: from.left + from.width,
        y1: from.index * ROW_HEIGHT + ROW_HEIGHT / 2,
        x2: to.left,
        y2: to.index * ROW_HEIGHT + ROW_HEIGHT / 2,
        state: info.state,
      },
    ]
  })

  // Keep today in view (~1/3 from the left) when the view opens or rescales.
  useEffect(() => {
    const container = scrollRef.current
    if (container) {
      container.scrollLeft = Math.max(0, todayX - container.clientWidth / 3)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const changeZoom = (next: Zoom) => {
    setZoom(next)
    localStorage.setItem(ZOOM_KEY, next)
  }

  const scrollToToday = () => {
    scrollRef.current?.scrollTo({
      left: Math.max(0, todayX - scrollRef.current.clientWidth / 3),
      behavior: 'smooth',
    })
  }

  const startDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    featureId: number,
    mode: DragState['mode'],
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is an enhancement; dragging still works while the pointer stays on the bar.
    }
    setDrag({ featureId, mode, originX: event.clientX, days: 0, moved: false })
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const days = Math.round((event.clientX - drag.originX) / dayWidth)
    if (days !== drag.days || !drag.moved) {
      const moved = drag.moved || Math.abs(event.clientX - drag.originX) > 3
      setDrag({ ...drag, days, moved })
    }
  }

  const endDrag = () => {
    if (!drag) return
    const feature = features.find((f) => f.id === drag.featureId)
    setDrag(null)
    if (!feature) return
    if (!drag.moved) {
      setSelectedId(feature.id)
      return
    }
    const dates = previewDates(feature)
    if (
      dates &&
      (toIso(dates.start) !== feature.start_date || toIso(dates.end) !== feature.end_date)
    ) {
      onSchedule(feature.id, toIso(dates.start), toIso(dates.end))
    }
  }

  // Default slot for a newly planned feature: next Monday, two work weeks.
  const planFeature = (featureId: number) => {
    const monday = addDays(startOfWeek(today()), 7)
    onSchedule(featureId, toIso(monday), toIso(addDays(monday, 11)))
    setSelectedId(featureId)
  }

  const showTip = (event: ReactMouseEvent, text: string) =>
    setTip({ x: event.clientX, y: event.clientY, text })

  const selected = selectedId === null ? null : (features.find((f) => f.id === selectedId) ?? null)

  // Header cells for the current zoom.
  const headerTop: { key: string; left: number; width: number; label: string }[] = []
  const headerBottom: {
    key: string
    left: number
    width: number
    label: string
    weekend?: boolean
  }[] = []
  if (zoom === 'quarter') {
    for (
      let cursor = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1);
      diffDays(rangeStart, cursor) < totalDays;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1)
    ) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1)
      const left = Math.max(0, xOf(cursor))
      headerTop.push({
        key: toIso(cursor),
        left,
        width: Math.min(totalDays * dayWidth, xOf(next)) - left,
        label: `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`,
      })
    }
  }
  for (
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    diffDays(rangeStart, cursor) < totalDays;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const left = Math.max(0, xOf(cursor))
    const cell = {
      key: toIso(cursor),
      left,
      width: Math.min(totalDays * dayWidth, xOf(next)) - left,
      label: zoom === 'quarter' ? monthShort.format(cursor) : monthName.format(cursor),
    }
    ;(zoom === 'quarter' ? headerBottom : headerTop).push(cell)
  }
  if (zoom === 'week') {
    for (let day = 0; day < totalDays; day++) {
      const date = addDays(rangeStart, day)
      headerBottom.push({
        key: toIso(date),
        left: day * dayWidth,
        width: dayWidth,
        label: String(date.getDate()),
        weekend: date.getDay() === 0 || date.getDay() === 6,
      })
    }
  } else if (zoom === 'month') {
    for (let day = 0; day < totalDays; day += 7) {
      const date = addDays(rangeStart, day)
      headerBottom.push({
        key: toIso(date),
        left: day * dayWidth,
        width: 7 * dayWidth,
        label: t('timeline.weekNumber', { week: isoWeek(date) }),
      })
    }
  }

  const chartWidth = totalDays * dayWidth
  const chartHeight = Math.max(1, rows.length) * ROW_HEIGHT

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <h2>{t('timeline.title')}</h2>
        <div className="timeline-zoom" role="group" aria-label={t('timeline.zoomLabel')}>
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              className={zoom === z ? 'active' : ''}
              onClick={() => changeZoom(z)}
            >
              {t(`timeline.zoom.${z}`)}
            </button>
          ))}
        </div>
        <button type="button" className="timeline-today-button" onClick={scrollToToday}>
          {t('timeline.today')}
        </button>
      </div>

      {features.length === 0 ? (
        <div className="empty-state">
          <h2>{t('timeline.noFeatures')}</h2>
          <p>{t('timeline.noFeaturesHint')}</p>
        </div>
      ) : (
        <div className="timeline-main">
          <div className="timeline-chart-card">
            <div className="gantt">
              <div className="gantt-labels">
                <div className="gantt-labels-header" />
                {rows.map((row) => (
                  <button
                    key={row.feature.id}
                    type="button"
                    className={`gantt-label${selectedId === row.feature.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(row.feature.id)}
                  >
                    <span className="gantt-label-name">{row.feature.name}</span>
                    {row.total > 0 && (
                      <span className="gantt-label-count">
                        {row.done}/{row.total}
                      </span>
                    )}
                  </button>
                ))}
                {rows.length === 0 && <div className="gantt-label-empty" />}
              </div>
              <div className="gantt-scroll" ref={scrollRef}>
                <div className="gantt-canvas" style={{ width: chartWidth }}>
                  <div className="gantt-header">
                    <div className="gantt-header-row">
                      {headerTop.map((cell) => (
                        <span
                          key={cell.key}
                          className="gantt-header-cell"
                          style={{ left: cell.left, width: cell.width }}
                        >
                          {/* Sticky, so the label stays readable while scrolling within the cell. */}
                          <span className="gantt-header-cell-label">{cell.label}</span>
                        </span>
                      ))}
                    </div>
                    <div className="gantt-header-row">
                      {headerBottom.map((cell) => (
                        <span
                          key={cell.key}
                          className={`gantt-header-cell gantt-header-minor${cell.weekend ? ' weekend' : ''}`}
                          style={{ left: cell.left, width: cell.width }}
                        >
                          {cell.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div
                    className="gantt-body"
                    style={{
                      height: chartHeight,
                      backgroundImage:
                        zoom === 'week'
                          ? // Weekly grid line plus weekend tint; the range starts on a Monday.
                            `repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px ${dayWidth * 7}px),
                             repeating-linear-gradient(90deg, transparent 0 ${dayWidth * 5}px, rgba(38, 40, 46, 0.045) ${dayWidth * 5}px ${dayWidth * 7}px)`
                          : `repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px ${dayWidth * 7}px)`,
                    }}
                  >
                    <div className="gantt-today" style={{ left: todayX }}>
                      <span className="gantt-today-dot" />
                    </div>
                    {rows.map((row) => {
                      const conflicts = conflictsOf(row.feature.id)
                      const percent = row.total === 0 ? 0 : (row.done / row.total) * 100
                      const label =
                        `${dayLabel.format(row.start)} – ${dayLabel.format(row.end)}` +
                        (row.total > 0
                          ? ` · ${t('timeline.progressTip', { done: row.done, total: row.total })}`
                          : '')
                      return (
                        <div
                          key={row.feature.id}
                          className="gantt-row"
                          style={{ top: row.index * ROW_HEIGHT, height: ROW_HEIGHT }}
                        >
                          <div
                            className={`gantt-bar${selectedId === row.feature.id ? ' selected' : ''}${
                              conflicts.length > 0 ? ' conflict' : ''
                            }${drag?.featureId === row.feature.id ? ' dragging' : ''}`}
                            style={{
                              left: row.left,
                              width: Math.max(row.width, dayWidth),
                              height: BAR_HEIGHT,
                              top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${row.feature.name}: ${label}`}
                            onPointerDown={(e) => startDrag(e, row.feature.id, 'move')}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSelectedId(row.feature.id)
                              }
                            }}
                            onMouseMove={(e) => showTip(e, label)}
                            onMouseLeave={() => setTip(null)}
                          >
                            <div className="gantt-bar-fill" style={{ width: `${percent}%` }} />
                            <div
                              className="gantt-handle gantt-handle-start"
                              onPointerDown={(e) => startDrag(e, row.feature.id, 'start')}
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                            />
                            <div
                              className="gantt-handle gantt-handle-end"
                              onPointerDown={(e) => startDrag(e, row.feature.id, 'end')}
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                            />
                          </div>
                          <span
                            className="gantt-bar-caption"
                            style={{ left: row.left + Math.max(row.width, dayWidth) + 8 }}
                          >
                            {conflicts.length > 0 && (
                              <span
                                className="gantt-conflict-badge"
                                title={t('timeline.conflictBadge')}
                              >
                                ⚠
                              </span>
                            )}
                            {row.feature.name}
                          </span>
                        </div>
                      )
                    })}
                    <svg
                      className="gantt-arrows"
                      width={chartWidth}
                      height={chartHeight}
                      aria-hidden="true"
                    >
                      <defs>
                        {['pending', 'done', 'conflict', 'unplanned'].map((state) => (
                          <marker
                            key={state}
                            id={`gantt-arrowhead-${state}`}
                            className={`gantt-arrowhead-${state}`}
                            markerWidth="7"
                            markerHeight="7"
                            refX="6"
                            refY="3.5"
                            orient="auto"
                          >
                            <path d="M0,0 L7,3.5 L0,7 Z" />
                          </marker>
                        ))}
                      </defs>
                      {arrows.map((arrow) => {
                        // Route right out of the blocker, then into the left edge of
                        // the dependent bar; loop around when it starts earlier.
                        const gap = Math.max(16, Math.min(40, (arrow.x2 - arrow.x1) / 2))
                        const path =
                          arrow.x2 - arrow.x1 >= 24
                            ? `M ${arrow.x1} ${arrow.y1} C ${arrow.x1 + gap} ${arrow.y1}, ${arrow.x2 - gap} ${arrow.y2}, ${arrow.x2 - 2} ${arrow.y2}`
                            : `M ${arrow.x1} ${arrow.y1} C ${arrow.x1 + 28} ${arrow.y1}, ${arrow.x2 - 28} ${arrow.y2}, ${arrow.x2 - 2} ${arrow.y2}`
                        return (
                          <path
                            key={arrow.key}
                            className={`gantt-arrow gantt-arrow-${arrow.state}`}
                            d={path}
                            markerEnd={`url(#gantt-arrowhead-${arrow.state})`}
                          />
                        )
                      })}
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {unscheduled.length > 0 && (
              <div className="timeline-unscheduled">
                <h3>{t('timeline.unscheduled')}</h3>
                <div className="timeline-unscheduled-list">
                  {unscheduled.map((feature) => {
                    const progress = progressOf(feature.id)
                    return (
                      <div key={feature.id} className="timeline-unscheduled-chip">
                        <span className="gantt-label-name">{feature.name}</span>
                        {progress.total > 0 && (
                          <span className="gantt-label-count">
                            {progress.done}/{progress.total}
                          </span>
                        )}
                        <button type="button" onClick={() => planFeature(feature.id)}>
                          {t('timeline.plan')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {selected && (
            <SchedulePanel
              feature={selected}
              features={features}
              pbis={pbis}
              depInfos={depInfos}
              progress={progressOf(selected.id)}
              onSchedule={onSchedule}
              onAddDependency={onAddDependency}
              onRemoveDependency={onRemoveDependency}
              onOpenFeature={onOpenFeature}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      {tip && (
        <div className="viz-tooltip" style={{ left: tip.x + 12, top: tip.y + 14 }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}

interface SchedulePanelProps {
  feature: Feature
  features: Feature[]
  pbis: PBI[]
  depInfos: DepInfo[]
  progress: { done: number; total: number }
  onSchedule: TimelineProps['onSchedule']
  onAddDependency: TimelineProps['onAddDependency']
  onRemoveDependency: TimelineProps['onRemoveDependency']
  onOpenFeature: TimelineProps['onOpenFeature']
  onClose: () => void
}

function SchedulePanel({
  feature,
  features,
  pbis,
  depInfos,
  progress,
  onSchedule,
  onAddDependency,
  onRemoveDependency,
  onOpenFeature,
  onClose,
}: SchedulePanelProps) {
  const { t } = useTranslation()

  const myDeps = depInfos.filter((d) => d.dep.feature_id === feature.id)
  // Features that wait on a PBI of this feature.
  const blocking = depInfos.filter((d) => d.pbi.feature_id === feature.id)

  const featureName = (id: number | null): string =>
    id === null ? t('common.none') : (features.find((f) => f.id === id)?.name ?? '')

  // Candidates: any live PBI of another feature not already depended on.
  const candidates = pbis.filter(
    (p) =>
      p.feature_id !== feature.id &&
      p.feature_id !== null &&
      !myDeps.some((d) => d.pbi.id === p.id),
  )
  const candidateGroups = features
    .filter((f) => f.id !== feature.id && candidates.some((p) => p.feature_id === f.id))
    .map((f) => ({ feature: f, pbis: candidates.filter((p) => p.feature_id === f.id) }))

  const setStart = (value: string) => {
    if (value === '') return
    const end = feature.end_date !== null && feature.end_date >= value ? feature.end_date : value
    onSchedule(feature.id, value, end)
  }

  const setEnd = (value: string) => {
    if (value === '') return
    const start =
      feature.start_date !== null && feature.start_date <= value ? feature.start_date : value
    onSchedule(feature.id, start, value)
  }

  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)

  return (
    <aside className="timeline-panel">
      <div className="timeline-panel-header">
        <button
          type="button"
          className="timeline-panel-title"
          title={t('timeline.openFeature')}
          onClick={() => onOpenFeature(feature.id)}
        >
          {feature.name}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </div>

      {progress.total > 0 && (
        <>
          <div className="meter meter-sm">
            <div className="meter-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="timeline-panel-progress">
            {t('timeline.progressTip', { done: progress.done, total: progress.total })}
          </p>
        </>
      )}

      <div className="timeline-panel-dates">
        <label>
          {t('timeline.startDate')}
          <input
            type="date"
            value={feature.start_date ?? ''}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          {t('timeline.endDate')}
          <input
            type="date"
            value={feature.end_date ?? ''}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      {feature.start_date !== null && (
        <button
          type="button"
          className="timeline-unschedule"
          onClick={() => onSchedule(feature.id, null, null)}
        >
          {t('timeline.unschedule')}
        </button>
      )}

      <h4>{t('timeline.dependsOn')}</h4>
      {myDeps.length === 0 && <p className="muted">{t('timeline.noDependencies')}</p>}
      <ul className="timeline-dep-list">
        {myDeps.map((info) => (
          <li key={info.dep.id} className={`timeline-dep timeline-dep-${info.state}`}>
            <span className="timeline-dep-status" aria-hidden="true">
              {info.state === 'done' ? '✓' : info.state === 'conflict' ? '⚠' : '○'}
            </span>
            <span className="timeline-dep-text">
              {t('timeline.dependsOnItem', {
                pbi: info.pbi.title,
                feature: featureName(info.pbi.feature_id),
              })}
              {info.state === 'conflict' && (
                <span className="timeline-dep-note">{t('timeline.conflictNote')}</span>
              )}
              {info.state === 'unplanned' && (
                <span className="timeline-dep-note">{t('timeline.unplannedNote')}</span>
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={t('common.removeItem', { name: info.pbi.title })}
              onClick={() => onRemoveDependency(feature.id, info.dep.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {candidateGroups.length > 0 && (
        <select
          className="timeline-dep-add"
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onAddDependency(feature.id, Number(e.target.value))
          }}
        >
          <option value="">{t('timeline.addDependency')}</option>
          {candidateGroups.map((group) => (
            <optgroup key={group.feature.id} label={group.feature.name}>
              {group.pbis.map((pbi) => (
                <option key={pbi.id} value={pbi.id}>
                  {pbi.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {blocking.length > 0 && (
        <>
          <h4>{t('timeline.blocks')}</h4>
          <ul className="timeline-dep-list">
            {blocking.map((info) => (
              <li key={info.dep.id} className="timeline-dep">
                <span className="timeline-dep-status" aria-hidden="true">
                  {info.state === 'done' ? '✓' : '○'}
                </span>
                <span className="timeline-dep-text">
                  {t('timeline.blocksItem', {
                    feature: featureName(info.dep.feature_id),
                    pbi: info.pbi.title,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
