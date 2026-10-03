// app/dashboard/reports/teachers/components/TeacherReportSheet.tsx
// ⭐ v3.17 — Header + Daily Ledger + Weekly Summary, with view toggle
'use client'

import { useState } from 'react'
import { TeacherMonth } from '@/lib/reports/teacherHours'
import { TeacherContactInfoById } from '@/components/TeacherContactInfo'
import { DailyLedger } from './DailyLedger'
import { WeeklySummaryTable } from './WeeklySummaryTable'
import { MonthCalendar } from './MonthCalendar'

type InnerView = 'ledger' | 'calendar'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]

function humanDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

function daysInRange(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

export function TeacherReportSheet({
  month,
  startDate,
  endDate,
  viewMode,
  onExportSessions,
  onExportWeekly,
}: {
  month: TeacherMonth
  startDate: string
  endDate: string
  viewMode: 'rendered' | 'scheduled' | 'both'
  onExportSessions: () => void
  onExportWeekly: () => void
}) {
  const [innerView, setInnerView] = useState<InnerView>('ledger')
  const t = month.totals
  const period = startDate.slice(0, 7)

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      {/* ── Header block ───────────────────────────────── */}
      <header className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <TeacherContactInfoById teacherId={month.teacherId} variant="compact" />
            <h2 className="mt-2 text-lg font-semibold text-gray-900">
              Teacher Hours Report · {monthLabel(period)}
            </h2>
            <div className="text-xs text-gray-500 mt-0.5">
              Period: {humanDate(startDate)} – {humanDate(endDate)} · {daysInRange(startDate, endDate)} days
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setInnerView('ledger')}
                className={`px-3 py-1.5 ${innerView === 'ledger' ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                Ledger
              </button>
              <button
                onClick={() => setInnerView('calendar')}
                className={`px-3 py-1.5 ${innerView === 'calendar' ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                Calendar
              </button>
            </div>
            <ExportMenu onSessions={onExportSessions} onWeekly={onExportWeekly} />
          </div>
        </div>

        {/* Headline numbers */}
        <div className="mt-4 flex items-end gap-6 flex-wrap">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium">
              Paid hours
            </div>
            <div className="text-3xl font-bold text-emerald-900 leading-tight">
              {t.rendered.toFixed(2)}h
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <div>
              <div className="text-[10px] uppercase text-gray-500">Scheduled</div>
              <div className="font-medium">{t.scheduled.toFixed(2)}h</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Subbed out</div>
              <div className="font-medium">−{t.subbedOut.toFixed(2)}h</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Subbed in</div>
              <div className="font-medium">+{t.subbedIn.toFixed(2)}h</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Trials (not paid)</div>
              <div className="font-medium text-gray-500">{t.trialHours.toFixed(2)}h</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────── */}
      <div className="p-4 space-y-4">
        {innerView === 'ledger' ? (
          <>
            <DailyLedger month={month} startDate={startDate} endDate={endDate} />
            <WeeklySummaryTable month={month} startDate={startDate} endDate={endDate} />
          </>
        ) : (
          <MonthCalendar
            month={month}
            startDate={startDate}
            endDate={endDate}
            viewMode={viewMode}
          />
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Export dropdown
// ─────────────────────────────────────────────────────────────

function ExportMenu({
  onSessions,
  onWeekly,
}: {
  onSessions: () => void
  onWeekly: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm rounded-md border px-3 py-1.5 bg-white hover:bg-gray-50"
      >
        Export ▾
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-1 z-20 bg-white border rounded-md shadow-lg min-w-[220px]">
            <button
              onClick={() => { setOpen(false); onSessions() }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            >
              📄 Sessions (long format)
            </button>
            <button
              onClick={() => { setOpen(false); onWeekly() }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t"
            >
              📊 Weekly summary
            </button>
          </div>
        </>
      )}
    </div>
  )
}