// app/dashboard/reports/teachers/page.tsx
// ⭐ v3.17 — Wired to the new TeacherReportSheet + 3 CSV exports
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchTeacherHours, TeacherMonth } from '@/lib/reports/teacherHours'
import { supabase } from '@/lib/supabaseClient'
import {
  toSessionsCSV,
  toWeeklySummaryCSV,
  toCombinedSessionsCSV,
  downloadCSV,
} from '@/lib/reports/csvExport'
import { TeacherPicker } from './components/TeacherPicker'
import { MonthNavigator } from './components/MonthNavigator'
import { ViewToggle } from './components/ViewToggle'
import { TeacherReportSheet } from './components/TeacherReportSheet'

type ViewMode = 'rendered' | 'scheduled' | 'both'

export default function TeacherHoursPage() {
  const [allTeachers, setAllTeachers] = useState<{ id: string; full_name: string }[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [month, setMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [view, setView] = useState<ViewMode>('both')
  const [data, setData] = useState<TeacherMonth[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('users')
      .select('id,full_name')
      .eq('role', 'teacher')
      .order('full_name')
      .then(({ data }) => setAllTeachers(data ?? []))
  }, [])

  const { startDate, endDate } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return { startDate: fmt(first), endDate: fmt(last) }
  }, [month])

  const activeIds = selected.length ? selected : allTeachers.map(t => t.id)
  const activeKey = activeIds.join(',')

  useEffect(() => {
    if (!activeIds.length) return
    setLoading(true)
    fetchTeacherHours({ teacherIds: activeIds, startDate, endDate })
      .then(setData)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, startDate, endDate])

  const exportSessionsOne = (m: TeacherMonth) =>
    downloadCSV(
      `teacher-hours-${m.teacherName.replace(/\s+/g, '_')}-${month}-sessions.csv`,
      toSessionsCSV(m, month)
    )

  const exportWeeklyOne = (m: TeacherMonth) =>
    downloadCSV(
      `teacher-hours-${m.teacherName.replace(/\s+/g, '_')}-${month}-weekly.csv`,
      toWeeklySummaryCSV(m, startDate, endDate)
    )

  const exportCombined = () =>
    downloadCSV(
      `teacher-hours-${month}-combined.csv`,
      toCombinedSessionsCSV(data, month)
    )

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <TeacherPicker all={allTeachers} selected={selected} setSelected={setSelected} />
        <MonthNavigator month={month} setMonth={setMonth} />
        <ViewToggle view={view} setView={setView} />
        <button
          onClick={exportCombined}
          className="ml-auto rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm"
        >
          Export combined sessions CSV
        </button>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}

      <div className="space-y-8">
        {data.map(m => (
          <TeacherReportSheet
            key={m.teacherId}
            month={m}
            startDate={startDate}
            endDate={endDate}
            viewMode={view}
            onExportSessions={() => exportSessionsOne(m)}
            onExportWeekly={() => exportWeeklyOne(m)}
          />
        ))}
      </div>
    </div>
  )
}