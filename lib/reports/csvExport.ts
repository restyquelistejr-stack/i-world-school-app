// lib/reports/csvExport.ts
// ⭐ v3.17 — Three exports: sessions (long), weekly summary, combined sessions
import { TeacherMonth } from './teacherHours'

const BOM = '\uFEFF'

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ─────────────────────────────────────────────────────────────
// Week builder
// ─────────────────────────────────────────────────────────────

interface WeekBucket {
  weekStart: string
  weekEnd: string
  label: string
  days: string[]
}

const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]

function humanDate(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

function buildWeeks(startDate: string, endDate: string): WeekBucket[] {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const startDow = start.getDay() === 0 ? 6 : start.getDay() - 1
  start.setDate(start.getDate() - startDow)

  const weeks: WeekBucket[] = []
  let cur = new Date(start)
  while (cur <= end) {
    const days: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur)
      const pad = (n: number) => String(n).padStart(2, '0')
      days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push({
      weekStart: days[0],
      weekEnd: days[6],
      label: `${humanDate(days[0])} – ${humanDate(days[6])}`,
      days,
    })
  }
  return weeks
}

// ─────────────────────────────────────────────────────────────
// Export 1 — Sessions (long, one row per session)
// ─────────────────────────────────────────────────────────────

export function toSessionsCSV(month: TeacherMonth, period: string): string {
  const header = [
    'Teacher','Period','Date','Weekday','Start','End','Hours',
    'Session type','Class','Role','Paid','Note',
  ].join(',')

  const rows: string[] = [header]
  const sortedDates = Object.keys(month.days).sort()
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  for (const date of sortedDates) {
    const cell = month.days[date]
    if (!cell || cell.items.length === 0) continue
    const wd = WEEKDAYS[new Date(date + 'T00:00:00').getDay()]
    const items = [...cell.items].sort((a, b) => a.startTime.localeCompare(b.startTime))

    for (const it of items) {
      const isTrial = it.source === 'trial_private' || it.source === 'trial_group'
      const sessionType =
        it.source === 'private' ? 'Private'
        : it.source === 'group' ? 'Group'
        : it.source === 'trial_private' ? 'Trial private'
        : 'Trial group'

      const roleLabel =
        it.role === 'subbed_out' ? 'Subbed out'
        : it.role === 'subbed_in' ? 'Subbed in'
        : it.role === 'trial' ? 'Trial'
        : 'Taught'

      const paid = isTrial ? 'No' : (it.rendered ? 'Yes' : 'No')
      const note = isTrial ? 'Trial not paid' : (it.note ?? '')

      rows.push([
        month.teacherName, period, date, wd,
        it.startTime, it.endTime, it.hours.toFixed(2),
        sessionType, it.title || '—',
        roleLabel, paid, note,
      ].map(esc).join(','))
    }
  }
  return rows.join('\n')
}

// ─────────────────────────────────────────────────────────────
// Export 2 — Weekly summary
// ─────────────────────────────────────────────────────────────

export function toWeeklySummaryCSV(
  month: TeacherMonth,
  startDate: string,
  endDate: string
): string {
  const header = [
    'Teacher','Week start','Week end','Week',
    'Paid hours','Scheduled','Sub out','Sub in','Sessions',
  ].join(',')

  const rows: string[] = [header]
  const weeks = buildWeeks(startDate, endDate)

  for (const w of weeks) {
    let paid = 0, sched = 0, out = 0, inH = 0, sess = 0
    for (const d of w.days) {
      if (d < startDate || d > endDate) continue
      const c = month.days[d]
      if (!c) continue
      paid += c.rendered
      sched += c.scheduled
      out += c.subbedOut
      inH += c.subbedIn
      sess += c.sessionCount
    }

    rows.push([
      month.teacherName,
      w.weekStart,
      w.weekEnd,
      w.label,
      paid.toFixed(2),
      sched.toFixed(2),
      (-out).toFixed(2),
      `+${inH.toFixed(2)}`,
      String(sess),
    ].map(esc).join(','))
  }

  // Month total
  const totalSessions = Object.values(month.days).reduce(
    (a, c) => a + c.sessionCount, 0
  )

  rows.push([
    month.teacherName,
    startDate,
    endDate,
    'MONTH TOTAL',
    month.totals.rendered.toFixed(2),
    month.totals.scheduled.toFixed(2),
    (-month.totals.subbedOut).toFixed(2),
    `+${month.totals.subbedIn.toFixed(2)}`,
    String(totalSessions),
  ].map(esc).join(','))

  rows.push([
    month.teacherName,
    '', '',
    'Trials (excluded)',
    month.totals.trialHours.toFixed(2),
    '', '', '', '',
  ].map(esc).join(','))

  return rows.join('\n')
}

// ─────────────────────────────────────────────────────────────
// Export 3 — Combined sessions (all selected teachers)
// ─────────────────────────────────────────────────────────────

export function toCombinedSessionsCSV(
  months: TeacherMonth[],
  period: string
): string {
  const header = [
    'Teacher','Period','Date','Weekday','Start','End','Hours',
    'Session type','Class','Role','Paid','Note',
  ].join(',')

  const rows: string[] = [header]
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  for (const month of months) {
    const sortedDates = Object.keys(month.days).sort()
    for (const date of sortedDates) {
      const cell = month.days[date]
      if (!cell || cell.items.length === 0) continue
      const wd = WEEKDAYS[new Date(date + 'T00:00:00').getDay()]
      const items = [...cell.items].sort((a, b) => a.startTime.localeCompare(b.startTime))

      for (const it of items) {
        const isTrial = it.source === 'trial_private' || it.source === 'trial_group'
        const sessionType =
          it.source === 'private' ? 'Private'
          : it.source === 'group' ? 'Group'
          : it.source === 'trial_private' ? 'Trial private'
          : 'Trial group'

        const roleLabel =
          it.role === 'subbed_out' ? 'Subbed out'
          : it.role === 'subbed_in' ? 'Subbed in'
          : it.role === 'trial' ? 'Trial'
          : 'Taught'

        const paid = isTrial ? 'No' : (it.rendered ? 'Yes' : 'No')
        const note = isTrial ? 'Trial not paid' : (it.note ?? '')

        rows.push([
          month.teacherName, period, date, wd,
          it.startTime, it.endTime, it.hours.toFixed(2),
          sessionType, it.title || '—',
          roleLabel, paid, note,
        ].map(esc).join(','))
      }
    }
  }
  return rows.join('\n')
}