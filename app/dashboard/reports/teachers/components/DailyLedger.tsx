// app/dashboard/reports/teachers/components/DailyLedger.tsx
// ⭐ v3.18 — Future clock icon, dimmed informational lines, notes for subs/leave
'use client'

import { TeacherMonth, DayCell, DayItem } from '@/lib/reports/teacherHours'

interface Props {
  month: TeacherMonth
  startDate: string
  endDate: string
}

const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function humanDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`
}

function weekday(yyyymmdd: string): string {
  return WEEKDAY_SHORT[new Date(yyyymmdd + 'T00:00:00').getDay()]
}

function humanRange(d1: string, d2: string): string {
  if (d1 === d2) return humanDate(d1)
  const [y1, m1, day1] = d1.split('-').map(Number)
  const [y2, m2, day2] = d2.split('-').map(Number)
  if (y1 === y2 && m1 === m2) {
    return `${MONTH_SHORT[m1 - 1]} ${day1} – ${day2}, ${y1}`
  }
  if (y1 === y2) {
    return `${MONTH_SHORT[m1 - 1]} ${day1} – ${MONTH_SHORT[m2 - 1]} ${day2}, ${y1}`
  }
  return `${humanDate(d1)} – ${humanDate(d2)}`
}

// ─────────────────────────────────────────────────────────────
// Session line
// ─────────────────────────────────────────────────────────────

function SessionLine({ item }: { item: DayItem }) {
  const isTrial = item.source === 'trial_private' || item.source === 'trial_group'

  // Icon priority:
  //   Trial > subbed out > subbed in > future > taught (paid) > not paid
  const icon =
    isTrial ? '🎯'
    : item.role === 'subbed_out' ? '↪️'
    : item.role === 'subbed_in' ? '↩️'
    : item.isFuture ? '🕐'
    : item.rendered ? '✓'
    : '❌'

  const timeRange = `${item.startTime}–${item.endTime}`

  const lineText =
    item.source === 'trial_group' ? `Trial · ${item.title || 'Group class'}`
    : item.source === 'trial_private' ? `Trial · ${item.title || 'Private'}`
    : item.title || (item.source === 'group' ? 'Group class' : 'Private class')

  // ⭐ v3.18 — Dim informational lines that do NOT contribute to Paid hours.
  // Dim when: not rendered AND not a trial (trials are already informational,
  // but they get their own visual treatment below).
  const isInformational = !item.rendered && !isTrial

  const textClass = isInformational ? 'text-gray-400' : 'text-gray-800'
  const hoursClass = isInformational ? 'text-gray-300' : 'text-gray-600'
  const noteClass = isInformational ? 'text-gray-300 italic' : 'text-gray-500 italic'

  return (
    <div className="flex items-baseline gap-3 py-1 pl-6 text-sm">
      <span className="w-5 text-center text-base">{icon}</span>
      <span className="font-mono text-xs text-gray-500 w-[110px]">{timeRange}</span>
      <span className={`flex-1 ${textClass}`}>{lineText}</span>
      <span className={`text-xs ${hoursClass}`}>{item.hours.toFixed(2)}h</span>
      {item.note && (
        <span className={`text-xs ${noteClass}`}>({item.note})</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Day group
// ─────────────────────────────────────────────────────────────

function DayGroup({ date, cell }: { date: string; cell: DayCell }) {
  const items = [...cell.items].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  )
  const isLeave = cell.onLeave !== false

  // Totals line: show rendered prominently if > 0, else show "no paid hours"
  const paidLabel = cell.rendered > 0
    ? `${cell.rendered.toFixed(2)}h paid`
    : '0.00h paid'

  return (
    <div className={`border-l-2 ${
      isLeave ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
    } pl-2 py-2`}>
      <div className="flex items-baseline justify-between mb-1">
        <div className="font-medium text-gray-800">
          {weekday(date)}, {humanDate(date)}
          {cell.onLeave === 'full' && (
            <span className="ml-2 text-xs text-amber-600">🏖️ On leave</span>
          )}
          {cell.onLeave === 'partial' && (
            <span className="ml-2 text-xs text-amber-600">🏖️ Partial leave</span>
          )}
        </div>
        <div className={`text-sm font-semibold ${
          cell.rendered > 0 ? 'text-gray-900' : 'text-gray-400'
        }`}>
          {paidLabel}
        </div>
      </div>

      {items.map((it, idx) => (
        <SessionLine key={`${it.sessionId}-${idx}`} item={it} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Empty run
// ─────────────────────────────────────────────────────────────

function EmptyRun({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm text-gray-400 italic border-l-2 border-transparent pl-2">
      <span>{humanRange(fromDate, toDate)}</span>
      <span>No sessions</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Row builder
// ─────────────────────────────────────────────────────────────

type LedgerRow =
  | { kind: 'day'; date: string; cell: DayCell }
  | { kind: 'empty'; fromDate: string; toDate: string }

function buildRows(
  month: TeacherMonth,
  startDate: string,
  endDate: string
): LedgerRow[] {
  const rows: LedgerRow[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')

  let cursor = new Date(start)
  let emptyRunFrom: Date | null = null

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const flushEmpty = (toDate: Date) => {
    if (emptyRunFrom) {
      rows.push({ kind: 'empty', fromDate: fmt(emptyRunFrom), toDate: fmt(toDate) })
      emptyRunFrom = null
    }
  }

  while (cursor <= end) {
    const ds = fmt(cursor)
    const cell = month.days[ds]

    // A day "has activity" if it has any items OR is a leave day
    const hasItems = cell && cell.items.length > 0
    const isLeave = cell && cell.onLeave !== false

    if (!hasItems && !isLeave) {
      if (!emptyRunFrom) emptyRunFrom = new Date(cursor)
    } else {
      flushEmpty(new Date(cursor.getTime() - 86400000))
      rows.push({ kind: 'day', date: ds, cell: cell! })
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  flushEmpty(end)
  return rows
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function DailyLedger({ month, startDate, endDate }: Props) {
  const rows = buildRows(month, startDate, endDate)

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-baseline justify-between">
        <h3 className="font-semibold text-gray-800">📅 Daily Ledger</h3>
        <div className="text-sm text-gray-500">
          Month total:{' '}
          <span className="font-semibold text-gray-900">
            {month.totals.rendered.toFixed(2)}h paid
          </span>
        </div>
      </div>

      <div className="px-4 py-2 divide-y divide-gray-100">
        {rows.map((row, idx) => {
          if (row.kind === 'empty') {
            return (
              <EmptyRun
                key={`empty-${idx}`}
                fromDate={row.fromDate}
                toDate={row.toDate}
              />
            )
          }
          return <DayGroup key={row.date} date={row.date} cell={row.cell} />
        })}
      </div>
    </div>
  )
}