// app/dashboard/reports/teachers/components/WeeklySummaryTable.tsx
'use client'

import { TeacherMonth } from '@/lib/reports/teacherHours'

interface Props {
  month: TeacherMonth
  startDate: string
  endDate: string
}

const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]

function humanShort(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

interface WeekBucket {
  weekStart: string
  weekEnd: string
  label: string
  days: string[]
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
      label: `${humanShort(days[0])} – ${humanShort(days[6])}`,
      days,
    })
  }
  return weeks
}

export function WeeklySummaryTable({ month, startDate, endDate }: Props) {
  const weeks = buildWeeks(startDate, endDate)

  const totalSessions = Object.values(month.days).reduce(
    (a, c) => a + c.sessionCount, 0
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">📊 Weekly Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Week</th>
              <th className="px-4 py-2 text-right font-medium">Paid hours</th>
              <th className="px-4 py-2 text-right font-medium">Scheduled</th>
              <th className="px-4 py-2 text-right font-medium">Sub out</th>
              <th className="px-4 py-2 text-right font-medium">Sub in</th>
              <th className="px-4 py-2 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {weeks.map(w => {
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
              return (
                <tr key={w.weekStart} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{w.label}</td>
                  <td className="px-4 py-2 text-right font-semibold">{paid.toFixed(2)}h</td>
                  <td className="px-4 py-2 text-right text-gray-600">{sched.toFixed(2)}h</td>
                  <td className="px-4 py-2 text-right text-gray-600">−{out.toFixed(2)}h</td>
                  <td className="px-4 py-2 text-right text-gray-600">+{inH.toFixed(2)}h</td>
                  <td className="px-4 py-2 text-right text-gray-600">{sess}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-200">
            <tr>
              <td className="px-4 py-2">MONTH TOTAL</td>
              <td className="px-4 py-2 text-right">{month.totals.rendered.toFixed(2)}h</td>
              <td className="px-4 py-2 text-right">{month.totals.scheduled.toFixed(2)}h</td>
              <td className="px-4 py-2 text-right">−{month.totals.subbedOut.toFixed(2)}h</td>
              <td className="px-4 py-2 text-right">+{month.totals.subbedIn.toFixed(2)}h</td>
              <td className="px-4 py-2 text-right">{totalSessions}</td>
            </tr>
            <tr className="text-gray-500">
              <td className="px-4 py-2 font-normal">Trials (excluded)</td>
              <td className="px-4 py-2 text-right font-normal">{month.totals.trialHours.toFixed(2)}h</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}