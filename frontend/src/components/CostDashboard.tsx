import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Cost, PBI, Room } from '../api'
import { costAmount, formatEuro } from '../api'

interface CostDashboardProps {
  rooms: Room[]
  pbis: PBI[]
  onToggleCost: (costId: number, purchased: boolean) => void
  onSelectCost: (costId: number) => void
}

interface Tip {
  x: number
  y: number
  text: string
}

interface CostEntry {
  cost: Cost
  pbi: PBI
  room: Room | null
}

type PurchasedFilter = 'all' | 'open' | 'purchased'

const sum = (entries: CostEntry[]): number =>
  entries.reduce((total, e) => total + costAmount(e.cost), 0)

// Fixed categorical slot order (validated for CVD safety on a white surface);
// rooms keep their slot while checkboxes toggle, so colors never reshuffle.
const SLICE_COLORS = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
  'var(--cat-8)',
]
const OTHER_COLOR = 'var(--cat-other)'

export function CostDashboard({ rooms, pbis, onToggleCost, onSelectCost }: CostDashboardProps) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [roomFilter, setRoomFilter] = useState<number | null>(null)
  const [purchasedFilter, setPurchasedFilter] = useState<PurchasedFilter>('all')
  const [uncheckedRooms, setUncheckedRooms] = useState<ReadonlySet<number>>(new Set())

  const showTip = (event: MouseEvent, text: string) =>
    setTip({ x: event.clientX, y: event.clientY, text })
  const hideTip = () => setTip(null)

  const entries = useMemo<CostEntry[]>(
    () =>
      pbis.flatMap((pbi) =>
        pbi.costs.map((cost) => ({
          cost,
          pbi,
          room: rooms.find((r) => r.id === pbi.room_id) ?? null,
        })),
      ),
    [pbis, rooms],
  )

  const purchased = entries.filter((e) => e.cost.purchased)
  const planned = sum(entries)
  const spent = sum(purchased)
  const remaining = planned - spent
  const spentPercent = planned === 0 ? 0 : Math.round((spent / planned) * 100)

  const roomRows = rooms
    .map((room) => {
      const roomEntries = entries.filter((e) => e.room?.id === room.id)
      return {
        room,
        total: sum(roomEntries),
        spent: sum(roomEntries.filter((e) => e.cost.purchased)),
        count: roomEntries.length,
      }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total)

  // Past 8 rooms the smallest ones share one gray "Other" slice — more hues
  // would stop being distinguishable.
  const coloredCount =
    roomRows.length <= SLICE_COLORS.length ? roomRows.length : SLICE_COLORS.length - 1
  const rowColor = (index: number): string =>
    index < coloredCount ? SLICE_COLORS[index] : OTHER_COLOR

  const toggleRoom = (roomId: number) =>
    setUncheckedRooms((current) => {
      const next = new Set(current)
      if (next.has(roomId)) {
        next.delete(roomId)
      } else {
        next.add(roomId)
      }
      return next
    })

  const checkedRows = roomRows.filter((row) => !uncheckedRooms.has(row.room.id))
  const foldedRows = checkedRows.filter((row) => roomRows.indexOf(row) >= coloredCount)
  const slices: Slice[] = checkedRows
    .filter((row) => roomRows.indexOf(row) < coloredCount && row.total > 0)
    .map((row) => ({
      key: `room-${row.room.id}`,
      label: row.room.name,
      value: row.total,
      color: rowColor(roomRows.indexOf(row)),
      tip: `${row.room.name} — ${formatEuro(row.total)} planned · ${formatEuro(row.spent)} spent`,
    }))
  const foldedTotal = foldedRows.reduce((total, row) => total + row.total, 0)
  if (foldedTotal > 0) {
    const foldedSpent = foldedRows.reduce((total, row) => total + row.spent, 0)
    slices.push({
      key: 'other',
      label: `Other (${foldedRows.length} rooms)`,
      value: foldedTotal,
      color: OTHER_COLOR,
      tip: `Other (${foldedRows.length} rooms) — ${formatEuro(foldedTotal)} planned · ${formatEuro(foldedSpent)} spent`,
    })
  }
  const pieTotal = checkedRows.reduce((total, row) => total + row.total, 0)

  const listed = entries
    .filter(
      (e) =>
        (roomFilter === null || e.room?.id === roomFilter) &&
        (purchasedFilter === 'all' ||
          (purchasedFilter === 'purchased' ? e.cost.purchased : !e.cost.purchased)),
    )
    .sort(
      (a, b) =>
        Number(a.cost.purchased) - Number(b.cost.purchased) ||
        costAmount(b.cost) - costAmount(a.cost) ||
        a.cost.id - b.cost.id,
    )
  const listedEstimated = listed.reduce((total, e) => total + (e.cost.estimated_cost ?? 0), 0)
  const listedActual = listed.reduce((total, e) => total + (e.cost.actual_cost ?? 0), 0)

  return (
    <div className="dashboard">
      <section className="dash-hero">
        <div className="dash-hero-main">
          <p className="dash-greeting">Renovation costs</p>
          <div className="hero-figure">{formatEuro(spent)}</div>
          <div
            className="meter"
            role="img"
            aria-label={`${formatEuro(spent)} spent of ${formatEuro(planned)} planned`}
            onMouseMove={(e) =>
              showTip(e, `${formatEuro(spent)} spent of ${formatEuro(planned)} planned`)
            }
            onMouseLeave={hideTip}
          >
            <div className="meter-fill" style={{ width: `${spentPercent}%` }} />
          </div>
          <p className="dash-subline">
            {spentPercent}% of {formatEuro(planned)} planned · {purchased.length} of{' '}
            {entries.length} item{entries.length === 1 ? '' : 's'} purchased
          </p>
        </div>
        <div className="stat-tiles">
          <StatTile label="Planned" value={formatEuro(planned)} hint="all cost items" />
          <StatTile label="Spent" value={formatEuro(spent)} hint="purchased items" />
          <StatTile label="Still to buy" value={formatEuro(remaining)} hint="open items" />
          <StatTile
            label="Purchased"
            value={`${purchased.length}/${entries.length}`}
            hint="items checked off"
          />
        </div>
      </section>

      <section className="dash-charts">
        <div className="chart-card">
          <h3>Cost per room</h3>
          {roomRows.length === 0 ? (
            <p className="muted">No costs yet — add them on a PBI.</p>
          ) : (
            <div className="cost-pie">
              {pieTotal > 0 ? (
                <Donut slices={slices} total={pieTotal} showTip={showTip} hideTip={hideTip} />
              ) : (
                <p className="muted cost-pie-empty">
                  {checkedRows.length === 0
                    ? 'No rooms selected — tick a room to include it.'
                    : 'No amounts yet for the selected rooms.'}
                </p>
              )}
              <ul className="cost-pie-legend">
                {roomRows.map((row, index) => (
                  <li key={row.room.id}>
                    <label className="cost-legend-row">
                      <input
                        type="checkbox"
                        checked={!uncheckedRooms.has(row.room.id)}
                        onChange={() => toggleRoom(row.room.id)}
                      />
                      <span className="swatch" style={{ background: rowColor(index) }} />
                      <span className="cost-legend-name">{row.room.name}</span>
                      <span className="cost-legend-amount">{formatEuro(row.total)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {coloredCount < roomRows.length && (
                <p className="muted cost-pie-note">
                  The smallest rooms are grouped as one gray “Other” slice.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="cost-list-head">
        <h2 className="dash-section-title">Purchase list</h2>
        <div className="cost-filters">
          <select
            value={roomFilter ?? ''}
            onChange={(e) => setRoomFilter(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">All rooms</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <select
            value={purchasedFilter}
            onChange={(e) => setPurchasedFilter(e.target.value as PurchasedFilter)}
          >
            <option value="all">All items</option>
            <option value="open">Still to buy</option>
            <option value="purchased">Purchased</option>
          </select>
        </div>
      </div>

      {listed.length === 0 ? (
        <p className="muted">
          {entries.length === 0
            ? 'No costs yet — open a PBI and add its expected purchases.'
            : 'No cost items match these filters.'}
        </p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th className="cost-col-check" aria-label="Purchased" />
                <th>Item</th>
                <th>Room</th>
                <th>PBI</th>
                <th className="cost-col-amount">Estimated</th>
                <th className="cost-col-amount">Actual</th>
              </tr>
            </thead>
            <tbody>
              {listed.map(({ cost, pbi, room }) => (
                <tr
                  key={cost.id}
                  className={cost.purchased ? 'cost-row-purchased' : ''}
                  onClick={() => onSelectCost(cost.id)}
                >
                  <td className="cost-col-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={cost.purchased}
                      title={cost.purchased ? 'Mark as not purchased' : 'Mark as purchased'}
                      onChange={(e) => onToggleCost(cost.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <span className="cost-item-title">{cost.title}</span>
                    {cost.reason && <span className="cost-item-reason">{cost.reason}</span>}
                  </td>
                  <td>{room?.name ?? '—'}</td>
                  <td className="cost-col-pbi">{pbi.title}</td>
                  <td className="cost-col-amount">
                    {cost.estimated_cost === null ? '—' : formatEuro(cost.estimated_cost)}
                  </td>
                  <td className="cost-col-amount">
                    {cost.actual_cost === null ? '—' : formatEuro(cost.actual_cost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="cost-col-check" />
                <td colSpan={3}>
                  Total ({listed.length} item{listed.length === 1 ? '' : 's'})
                </td>
                <td className="cost-col-amount">{formatEuro(listedEstimated)}</td>
                <td className="cost-col-amount">{formatEuro(listedActual)}</td>
              </tr>
            </tfoot>
          </table>
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

interface Slice {
  key: string
  label: string
  value: number
  color: string
  tip: string
}

interface DonutProps {
  slices: Slice[]
  total: number
  showTip: (event: MouseEvent, text: string) => void
  hideTip: () => void
}

// Donut pie: each slice is a circle stroke segment via dasharray, which gives a
// 2px surface gap between slices and the center hole for free.
function Donut({ slices, total, showTip, hideTip }: DonutProps) {
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const drawn = slices.filter((s) => s.value > 0)
  const gap = drawn.length > 1 ? 2 : 0
  let position = 0
  return (
    <svg
      viewBox="0 0 200 200"
      className="cost-donut"
      role="img"
      aria-label={`Cost per room: ${drawn.map((s) => `${s.label} ${formatEuro(s.value)}`).join(', ')}`}
    >
      <g transform="rotate(-90 100 100)">
        {drawn.map((slice) => {
          const length = (slice.value / total) * circumference
          const offset = -(position + gap / 2)
          position += length
          const dash = Math.max(length - gap, 0.5)
          return (
            <circle
              key={slice.key}
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="34"
              strokeDasharray={gap === 0 ? undefined : `${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              pointerEvents="visibleStroke"
              onMouseMove={(e) => showTip(e, slice.tip)}
              onMouseLeave={hideTip}
            />
          )
        })}
      </g>
      <text x="100" y="97" textAnchor="middle" className="cost-donut-total">
        {formatEuro(total)}
      </text>
      <text x="100" y="115" textAnchor="middle" className="cost-donut-hint">
        planned
      </text>
    </svg>
  )
}

interface StatTileProps {
  label: string
  value: string
  hint: string
}

function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value stat-value-money">{value}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  )
}
