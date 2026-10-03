// app/dashboard/reports/teachers/components/MonthCalendar.tsx
// ⭐ v3.16b: Compact grid — fixed columns, small empty cells, no duplicate footer
'use client'

import { TeacherMonth, DayCell } from '@/lib/reports/teacherHours'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface WeekBucket {
  weekStart: string
  weekNumber: number
  days: string[]
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function buildWeeks(startDate: string, endDate: string): WeekBucket[] {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const startDow = start.getDay() === 0 ? 6 : start.getDay() - 1
  start.setDate(start.getDate() - startDow)

  const weeks: WeekBucket[] = []
  let cur = new Date(start)
  while (cur <= end) {
    const weekStart = new Date(cur)
    const days: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur)
      const pad = (n: number) => String(n).padStart(2, '0')
      days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push({ weekStart: days[0], weekNumber: isoWeekNumber(weekStart), days })
  }
  return weeks
}

// ─────────────────────────────────────────────────────────────
// Day cell — COMPACT
// ─────────────────────────────────────────────────────────────

function DayCellView({
  cell,
  inMonth,
  isToday,
  viewMode,
}: {
  cell?: DayCell
  inMonth: boolean
  isToday: boolean
  viewMode: 'rendered' | 'scheduled' | 'both'
}) {
  const dayNum = cell?.date.slice(8) ?? ''

  // Out-of-month → empty gray box
  if (!inMonth) {
    return (
      <div className="rounded border border-gray-100 bg-gray-50/60 h-16 p-1.5">
        <div className="text-[10px] text-gray-300">{dayNum}</div>
      </div>
    )
  }

  // In-month, no sessions
  if (!cell || cell.sessionCount === 0) {
    return (
      <div
        className={`rounded border bg-white h-16 p-1.5 ${
          isToday ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-200'
        }`}
      >
        <div className={`text-[10px] ${isToday ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
          {dayNum}
        </div>
        {cell?.onLeave && (
          <div className="text-[10px] text-amber-600 mt-0.5">🏖️</div>
        )}
      </div>
    )
  }

  const top =
    viewMode === 'rendered' ? cell.rendered :
    viewMode === 'scheduled' ? cell.scheduled :
    cell.rendered

  const bg = cell.onLeave ? 'bg-amber-50/70' : 'bg-white'
  const ring = isToday ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-200'

  return (
    <div className={`rounded border h-16 p-1.5 text-[11px] leading-tight ${bg} ${ring}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-[10px] ${isToday ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
          {dayNum}
        </span>
        <span className="text-xs font-semibold">{top.toFixed(2)}h</span>
      </div>
      {viewMode === 'both' && (
        <>
          <div className="text-gray-500 text-[10px]">
            S {cell.scheduled.toFixed(2)} · −{cell.subbedOut.toFixed(2)} · +{cell.subbedIn.toFixed(2)}
          </div>
        </>
      )}
      <div className="text-gray-500 text-[10px]">
        {cell.sessionCount}s
        {cell.breakdown.private ? ` 📚${cell.breakdown.private}` : ''}
        {cell.breakdown.group ? ` 👥${cell.breakdown.group}` : ''}
        {(cell.breakdown.trialPrivate + cell.breakdown.trialGroup) > 0
          ? ` 🎯${cell.breakdown.trialPrivate + cell.breakdown.trialGroup}` : ''}
        {cell.onLeave ? ' 🏖️' : ''}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main calendar — no in-component footer
// ─────────────────────────────────────────────────────────────

export function MonthCalendar({
  month,
  startDate,
  endDate,
  viewMode,
}: {
  month: TeacherMonth
  startDate: string
  endDate: string
  viewMode: 'rendered' | 'scheduled' | 'both'
}) {
  const weeks = buildWeeks(startDate, endDate)

  const today = (() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  const inMonth = (d: string) => d >= startDate && d <= endDate

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-[36px] text-left text-[10px] font-medium text-gray-400 uppercase">
              Wk
            </th>
            {DAY_LABELS.map(d => (
              <th key={d} className="text-left text-xs text-gray-500 font-medium px-1">
                {d}
              </th>
            ))}
            <th className="text-left text-xs text-gray-500 font-medium px-1 w-[80px]">
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map(w => {
            const wk = w.days.reduce(
              (acc, d) => {
                if (!inMonth(d)) return acc
                const c = month.days[d]
                if (c) {
                  acc.rendered += c.rendered
                  acc.scheduled += c.scheduled
                  acc.out += c.subbedOut
                  acc.in += c.subbedIn
                }
                return acc
              },
              { rendered: 0, scheduled: 0, out: 0, in: 0 }
            )
            return (
              <tr key={w.weekStart}>
                <td className="align-top">
                  <div className="pt-1 text-[10px] text-gray-400 text-center">
                    W{w.weekNumber}
                  </div>
                </td>
                {w.days.map(d => (
                  <td key={d} className="align-top">
                    <DayCellView
                      cell={month.days[d]}
                      inMonth={inMonth(d)}
                      isToday={d === today}
                      viewMode={viewMode}
                    />
                  </td>
                ))}
                <td className="align-top">
                  <div className="rounded bg-gray-50 p-1.5 text-[11px] leading-tight h-16">
                    <div className="font-semibold">{wk.rendered.toFixed(2)}h</div>
                    <div className="text-gray-500 text-[10px]">
                      S {wk.scheduled.toFixed(2)}
                    </div>
                    <div className="text-gray-500 text-[10px]">
                      −{wk.out.toFixed(2)} / +{wk.in.toFixed(2)}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}