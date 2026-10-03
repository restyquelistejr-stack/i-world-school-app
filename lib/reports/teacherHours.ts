// lib/reports/teacherHours.ts
// ⭐ v3.18 — Future subbed-in sessions, name enrichment, leave-guard
//
// Changes vs v3.17:
//  1. Future subbed-in sessions now appear on the sub's report (Scheduled-only)
//  2. Subbed-out sessions show "Covered by X"
//  3. Subbed-in sessions show "Sub for X"
//  4. Sub names resolved via subNamesById (works when sub isn't in report set)
//  5. Leave-guard: teacher on approved leave → never paid
//  6. DayItem gains isFuture flag for UI dimming

import { supabase } from '@/lib/supabaseClient'
import { extractDate, extractTime, hoursBetween } from '@/lib/timeUtils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ViewMode = 'rendered' | 'scheduled' | 'both'

export interface DayCell {
  date: string
  rendered: number
  scheduled: number
  subbedOut: number
  subbedIn: number
  trialHours: number
  sessionCount: number
  breakdown: {
    private: number
    group: number
    trialPrivate: number
    trialGroup: number
    trialGroupMerged: number
  }
  onLeave: false | 'full' | 'partial'
  items: DayItem[]
}

export interface DayItem {
  source: 'private' | 'group' | 'trial_private' | 'trial_group'
  sessionId: string
  /** Course / class title, e.g. "Business English" or "MSE Group Class" */
  title: string
  hours: number
  startTime: string
  endTime: string
  role: 'taught' | 'subbed_in' | 'subbed_out' | 'trial'
  attendanceStatus: string | null
  rendered: boolean
  subbedOut: boolean
  subbedIn: boolean
  note: string | null
  overrideReason?: string | null
  /** ⭐ v3.18 — true if session date is in the future (for UI dimming) */
  isFuture: boolean
}

export interface TeacherMonth {
  teacherId: string
  teacherName: string
  days: Record<string, DayCell>
  totals: {
    rendered: number
    scheduled: number
    subbedOut: number
    subbedIn: number
    trialHours: number
  }
}

// ─────────────────────────────────────────────────────────────
// Raw Supabase row types
// ─────────────────────────────────────────────────────────────

type BookingRow = {
  id: string
  teacher_id: string
  course_id: string | null
  start_time: string
  end_time: string
  status: string | null
  is_trial: boolean | null
  is_deleted: boolean | null
  cancelled_at: string | null
}

type GroupSessionRow = {
  id: string
  teacher_id: string
  group_class_id: string | null
  session_date: string
  start_time: string
  end_time: string
  status: string | null
  substitute_teacher_id: string | null
  is_deleted: boolean | null
  cancelled_at: string | null
}

type TrialRow = {
  id: string
  selected_teacher_id: string
  selected_date: string
  selected_time: string
  session_type: string
  hours: number | null
  course_id: string | null
  status: string | null
  is_deleted: boolean | null
  is_converted: boolean | null
  selected_group_class_id: string | null
  substitute_teacher_id: string | null
}

type SubRow = {
  id: string
  session_type: string
  session_id: string
  original_teacher_id: string | null
  substitute_teacher_id: string | null
  session_date: string
  start_time: string | null
  end_time: string | null
  status: string
}

type AttendanceRow = {
  session_type: string
  session_id: string
  attendee_id: string
  status: string | null
  is_rendered: boolean | null
  override_reason: string | null
}

type LeaveRow = {
  staff_id: string
  start_date: string
  end_date: string
  leave_type: string | null
  status: string | null
}

type UserRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const todayLocalStr = (): string => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

const isPastOrToday = (dateStr: string): boolean => dateStr <= todayLocalStr()
const isFuture = (dateStr: string): boolean => dateStr > todayLocalStr()

const emptyDay = (date: string): DayCell => ({
  date,
  rendered: 0,
  scheduled: 0,
  subbedOut: 0,
  subbedIn: 0,
  trialHours: 0,
  sessionCount: 0,
  breakdown: { private: 0, group: 0, trialPrivate: 0, trialGroup: 0, trialGroupMerged: 0 },
  onLeave: false,
  items: [],
})

const addHoursToHHMM = (hhmm: string, hours: number): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + Math.round(hours * 60)
  const H = Math.floor(total / 60) % 24
  const M = total % 60
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────

export async function fetchTeacherHours({
  teacherIds,
  startDate,
  endDate,
}: {
  teacherIds: string[]
  startDate: string
  endDate: string
}): Promise<TeacherMonth[]> {
  if (teacherIds.length === 0) return []

  const ids = teacherIds.join(',')

  const [
    bookingsRes,
    groupRes,
    trialsRes,
    subsRes,
    attendanceRes,
    leavesRes,
    teachersRes,
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id,teacher_id,course_id,start_time,end_time,status,is_trial,is_deleted,cancelled_at')
      .gte('start_time', startDate + 'T00:00:00')
      .lte('start_time', endDate + 'T23:59:59')
      .in('teacher_id', teacherIds)
      .eq('is_deleted', false),

    supabase
      .from('group_class_sessions')
      .select('id,teacher_id,group_class_id,session_date,start_time,end_time,status,substitute_teacher_id,is_deleted,cancelled_at')
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .eq('is_deleted', false),

    supabase
      .from('trial_class_bookings')
      .select('id,selected_teacher_id,selected_date,selected_time,session_type,hours,course_id,status,is_deleted,is_converted,selected_group_class_id,substitute_teacher_id')
      .gte('selected_date', startDate)
      .lte('selected_date', endDate)
      .eq('is_deleted', false)
      .in('selected_teacher_id', teacherIds),

    supabase
      .from('substitute_assignments')
      .select('id,session_type,session_id,original_teacher_id,substitute_teacher_id,session_date,start_time,end_time,status')
      .eq('status', 'assigned')
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .or(`original_teacher_id.in.(${ids}),substitute_teacher_id.in.(${ids})`),

    supabase
      .from('session_attendance')
      .select('session_type,session_id,attendee_id,status,is_rendered,override_reason')
      .eq('attendee_type', 'teacher')
      .in('attendee_id', teacherIds),

    supabase
      .from('staff_leaves')
      .select('staff_id,start_date,end_date,leave_type,status')
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .in('staff_id', teacherIds),

    supabase
      .from('users')
      .select('id,full_name,email,phone')
      .in('id', teacherIds),
  ])

  // ── ⭐ v3.18 — course name lookups ─────────────────────────
  const courseNameById = new Map<string, string>()

  const directCourseIds = new Set<string>()
  ;(bookingsRes.data ?? []).forEach((b: any) => { if (b.course_id) directCourseIds.add(b.course_id) })
  ;(trialsRes.data ?? []).forEach((t: any) => { if (t.course_id) directCourseIds.add(t.course_id) })

  const groupClassIds = new Set<string>()
  ;(groupRes.data ?? []).forEach((s: any) => { if (s.group_class_id) groupClassIds.add(s.group_class_id) })

  const groupClassCourseById = new Map<string, string>()
  if (groupClassIds.size > 0) {
    const { data: gcs } = await supabase
      .from('scheduled_group_classes')
      .select('id, course_id')
      .in('id', [...groupClassIds])
    ;(gcs ?? []).forEach((g: any) => {
      groupClassCourseById.set(g.id, g.course_id)
      if (g.course_id) directCourseIds.add(g.course_id)
    })
  }

  if (directCourseIds.size > 0) {
    const { data: courses } = await supabase
      .from('courses')
      .select('id, name')
      .in('id', [...directCourseIds])
    ;(courses ?? []).forEach((c: any) => courseNameById.set(c.id, c.name))
  }

  // ── ⭐ v3.18 — resolve substitute + original teacher names ──
  //    (needed for "Covered by X" and "Sub for Y" notes; they may not
  //     be in the report's teacherIds set)
  const subTeacherIds = new Set<string>()
  ;(subsRes.data ?? []).forEach((s: any) => {
    if (s.substitute_teacher_id) subTeacherIds.add(s.substitute_teacher_id)
    if (s.original_teacher_id) subTeacherIds.add(s.original_teacher_id)
  })
  // Also include any substitute_teacher_id on group sessions
  ;(groupRes.data ?? []).forEach((g: any) => {
    if (g.substitute_teacher_id) subTeacherIds.add(g.substitute_teacher_id)
  })

  const subNamesById = new Map<string, string>()
  if (subTeacherIds.size > 0) {
    const { data: subUsers } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', [...subTeacherIds])
    ;(subUsers ?? []).forEach((u: any) => subNamesById.set(u.id, u.full_name))
  }

  return buildMonthData({
    teacherIds,
    bookings: (bookingsRes.data ?? []) as BookingRow[],
    groupSessions: (groupRes.data ?? []) as GroupSessionRow[],
    trials: (trialsRes.data ?? []) as TrialRow[],
    subs: (subsRes.data ?? []) as SubRow[],
    attendance: (attendanceRes.data ?? []) as AttendanceRow[],
    leaves: (leavesRes.data ?? []) as LeaveRow[],
    teachers: (teachersRes.data ?? []) as UserRow[],
    startDate,
    endDate,
    courseNameById,
    groupClassCourseById,
    subNamesById,
  })
}

// ─────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────

function buildMonthData({
  teacherIds,
  bookings,
  groupSessions,
  trials,
  subs,
  attendance,
  leaves,
  teachers,
  startDate,
  endDate,
  courseNameById,
  groupClassCourseById,
  subNamesById,
}: {
  teacherIds: string[]
  bookings: BookingRow[]
  groupSessions: GroupSessionRow[]
  trials: TrialRow[]
  subs: SubRow[]
  attendance: AttendanceRow[]
  leaves: LeaveRow[]
  teachers: UserRow[]
  startDate: string
  endDate: string
  courseNameById: Map<string, string>
  groupClassCourseById: Map<string, string>
  subNamesById: Map<string, string>
}): TeacherMonth[] {
  const teacherById = new Map<string, UserRow>(teachers.map(t => [t.id, t]))

  const attByKey = new Map<string, AttendanceRow>()
  for (const a of attendance) {
    attByKey.set(`${a.session_type}:${a.session_id}:${a.attendee_id}`, a)
  }

  const subsByKey = new Map<string, SubRow>()
  for (const s of subs) subsByKey.set(`${s.session_type}:${s.session_id}`, s)

  const months = new Map<string, TeacherMonth>()
  for (const tid of teacherIds) {
    const t = teacherById.get(tid)
    months.set(tid, {
      teacherId: tid,
      teacherName: t?.full_name ?? 'Unknown',
      days: {},
      totals: { rendered: 0, scheduled: 0, subbedOut: 0, subbedIn: 0, trialHours: 0 },
    })
  }

  // ── ⭐ v3.18 — leaves lookup (MUST run before sessions) ────
  const leaveRangesByTeacher = new Map<string, Array<{ start: string; end: string }>>()
  for (const lv of leaves) {
    const ranges = leaveRangesByTeacher.get(lv.staff_id) ?? []
    ranges.push({ start: lv.start_date, end: lv.end_date })
    leaveRangesByTeacher.set(lv.staff_id, ranges)

    const month = months.get(lv.staff_id)
    if (!month) continue
    const d1 = new Date(lv.start_date + 'T00:00:00')
    const d2 = new Date(lv.end_date + 'T00:00:00')
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (ds < startDate || ds > endDate) continue
      const cell = month.days[ds] ?? (month.days[ds] = emptyDay(ds))
      // Provisional — set to 'full'; will be downgraded to 'partial' at the end
      cell.onLeave = 'full'
    }
  }

  const isTeacherOnLeave = (teacherId: string, date: string): boolean => {
    const ranges = leaveRangesByTeacher.get(teacherId)
    if (!ranges) return false
    return ranges.some(r => date >= r.start && date <= r.end)
  }

  // ── private bookings ───────────────────────────────────────
  for (const b of bookings) {
    if (b.is_trial) continue
    const date = extractDate(b.start_time)
    const start = extractTime(b.start_time)
    const end = extractTime(b.end_time)
    const hrs = hoursBetween(start, end)
    const title = b.course_id
      ? courseNameById.get(b.course_id) ?? 'Private class'
      : 'Private class'
    addRealSession({
      teacherId: b.teacher_id,
      date, start, end, hrs,
      source: 'private',
      sessionId: b.id,
      sessionTypeKey: 'booking',
      subsByKey, attByKey, months,
      isPast: isPastOrToday(date),
      cancelled: b.status === 'cancelled' || !!b.cancelled_at,
      title,
      substituteTeacherId: null,
      isTeacherOnLeave,
      subNamesById,
    })
  }

  // ── group sessions ─────────────────────────────────────────
  for (const g of groupSessions) {
    const date = g.session_date
    const start = g.start_time.slice(0, 5)
    const end = g.end_time.slice(0, 5)
    const hrs = hoursBetween(start, end)

    const courseId = g.group_class_id
      ? groupClassCourseById.get(g.group_class_id)
      : undefined
    const title = courseId
      ? courseNameById.get(courseId) ?? 'Group class'
      : 'Group class'

    // Original teacher (may have been subbed out)
    addRealSession({
      teacherId: g.teacher_id,
      date, start, end, hrs,
      source: 'group',
      sessionId: g.id,
      sessionTypeKey: 'group_session',
      subsByKey, attByKey, months,
      isPast: isPastOrToday(date),
      cancelled: g.status === 'cancelled' || !!g.cancelled_at,
      title,
      substituteTeacherId: g.substitute_teacher_id,
      isTeacherOnLeave,
      subNamesById,
    })

    // ⭐ v3.18 — Substitute teacher, regardless of past/future
    if (g.substitute_teacher_id) {
      const subKey = `group_session:${g.id}`
      const assigned = subsByKey.get(subKey)
      const isAssigned = assigned?.status === 'assigned'
      if (isAssigned) {
        addRealSession({
          teacherId: g.substitute_teacher_id,
          date, start, end, hrs,
          source: 'group',
          sessionId: g.id,
          sessionTypeKey: 'group_session',
          subsByKey, attByKey, months,
          isPast: isPastOrToday(date),
          cancelled: g.status === 'cancelled' || !!g.cancelled_at,
          forceSubbedIn: true,
          title,
          substituteTeacherId: g.substitute_teacher_id,
          isTeacherOnLeave,
          subNamesById,
        })
      }
    }
  }

  // ── trials (private + group) ───────────────────────────────
  for (const tr of trials) {
    const date = tr.selected_date
    if (!date) continue
    const start = tr.selected_time.slice(0, 5)
    const end = addHoursToHHMM(start, tr.hours ?? 2)
    const hrs = tr.hours ?? 2
    const isGroup = tr.session_type === 'group'

    let merged = false
    if (isGroup && tr.selected_group_class_id) {
      merged = groupSessions.some(g =>
        g.teacher_id === tr.selected_teacher_id &&
        g.session_date === date &&
        g.start_time.slice(0, 5) === start
      )
    }

    const month = months.get(tr.selected_teacher_id)
    if (!month) continue
    const cell = month.days[date] ?? (month.days[date] = emptyDay(date))
    const trialTitle = tr.course_id
      ? courseNameById.get(tr.course_id) ?? 'Trial'
      : 'Trial'

    if (!merged) {
      cell.trialHours += hrs
      month.totals.trialHours += hrs
      cell.sessionCount += 1
      if (isGroup) cell.breakdown.trialGroup += 1
      else cell.breakdown.trialPrivate += 1
      cell.items.push({
        source: isGroup ? 'trial_group' : 'trial_private',
        sessionId: tr.id,
        title: trialTitle,
        hours: hrs,
        startTime: start,
        endTime: end,
        role: 'trial',
        attendanceStatus: null,
        rendered: false,
        subbedOut: false,
        subbedIn: false,
        note: 'Trial — not paid',
        overrideReason: null,
        isFuture: isFuture(date),
      })
    } else {
      cell.breakdown.trialGroupMerged += 1
    }
  }

  // ── ⭐ v3.18 — enrich notes with real names ────────────────
  for (const month of months.values()) {
    for (const cell of Object.values(month.days)) {
      for (const it of cell.items) {
        // "Sub for X" → resolve via subNamesById (X = original teacher)
        if (it.role === 'subbed_in' && it.note?.startsWith('Sub for ')) {
          const shortId = it.note.slice('Sub for '.length)
          const real = [...subNamesById.entries()].find(([id]) => id.startsWith(shortId))
          if (real) it.note = `Sub for ${real[1]}`
        }
        // "Covered by X" → resolve via subNamesById (X = substitute teacher)
        if (it.role === 'subbed_out' && it.note?.startsWith('Covered by ')) {
          const shortId = it.note.slice('Covered by '.length)
          const real = [...subNamesById.entries()].find(([id]) => id.startsWith(shortId))
          if (real) it.note = `Covered by ${real[1]}`
        }
      }
    }
  }

  // ── ⭐ v3.18 — downgrade onLeave to 'partial' where sessions exist ──
  for (const month of months.values()) {
    for (const cell of Object.values(month.days)) {
      if (cell.onLeave === 'full' && cell.sessionCount > 0) {
        cell.onLeave = 'partial'
      }
    }
  }

  // ── finalize totals ────────────────────────────────────────
  for (const month of months.values()) {
    for (const cell of Object.values(month.days)) {
      month.totals.rendered += cell.rendered
      month.totals.scheduled += cell.scheduled
      month.totals.subbedOut += cell.subbedOut
      month.totals.subbedIn += cell.subbedIn
    }
  }

  return Array.from(months.values())
}

// ─────────────────────────────────────────────────────────────
// One real session → day cell
// ─────────────────────────────────────────────────────────────

function addRealSession({
  teacherId, date, start, end, hrs, source, sessionId, sessionTypeKey,
  subsByKey, attByKey, months, isPast, cancelled, title,
  substituteTeacherId, isTeacherOnLeave, subNamesById,
  forceSubbedIn = false,
}: {
  teacherId: string
  date: string
  start: string
  end: string
  hrs: number
  source: 'private' | 'group' | 'trial_private' | 'trial_group'
  sessionId: string
  sessionTypeKey: 'booking' | 'group_session' | 'trial_booking'
  subsByKey: Map<string, SubRow>
  attByKey: Map<string, AttendanceRow>
  months: Map<string, TeacherMonth>
  isPast: boolean
  cancelled: boolean
  title: string
  substituteTeacherId: string | null
  isTeacherOnLeave: (teacherId: string, date: string) => boolean
  subNamesById: Map<string, string>
  forceSubbedIn?: boolean
}): void {
  const month = months.get(teacherId)
  if (!month) return

  const cell = month.days[date] ?? (month.days[date] = emptyDay(date))

  const att = attByKey.get(`${sessionTypeKey}:${sessionId}:${teacherId}`)
  const sub = subsByKey.get(`${sessionTypeKey}:${sessionId}`)
  const isSubbedOut = !!sub && sub.original_teacher_id === teacherId && sub.status === 'assigned'
  const isSubbedIn = forceSubbedIn || (!!sub && sub.substitute_teacher_id === teacherId && sub.status === 'assigned')

  const onLeave = isTeacherOnLeave(teacherId, date)

  // ── paid rule (v3.18) ──────────────────────────────────────
  // ⚠️ PAYROLL POLICY — v1:
  //   'excused' is treated as UNPAID.
  //   If payroll later says excused absences should be paid,
  //   move 'excused' into PAID_STATUSES.
  const PAID_STATUSES = ['present', 'late']
  const UNPAID_STATUSES = ['excused', 'absent', 'no_show', 'not_expected']

  let rendered: boolean
  if (att?.is_rendered === true) {
    rendered = true                          // manual override wins
  } else if (att?.is_rendered === false) {
    rendered = false                         // manual override wins
  } else if (onLeave) {
    // ⭐ v3.18 — teacher on approved leave → never paid for that session
    // (the substitute, if any, gets paid on their own calendar)
    rendered = false
  } else if (att && PAID_STATUSES.includes(att.status ?? '')) {
    rendered = true
  } else if (att && UNPAID_STATUSES.includes(att.status ?? '')) {
    rendered = false
  } else if (cancelled) {
    rendered = false
  } else if (!isPast) {
    rendered = false
  } else {
    rendered = true
  }

  const scheduledHere = !cancelled && !isSubbedOut && !isSubbedIn ? hrs : 0

  cell.scheduled += scheduledHere
  if (isSubbedOut) cell.subbedOut += hrs
  if (isSubbedIn) cell.subbedIn += hrs
  if (rendered && !isSubbedOut) cell.rendered += hrs
  if (isSubbedIn && isPast && !cancelled) cell.rendered += hrs

  cell.sessionCount += 1
  if (source === 'private') cell.breakdown.private += 1
  else if (source === 'group') cell.breakdown.group += 1

  // ── role + note ────────────────────────────────────────────
  let role: DayItem['role'] = 'taught'
  if (isSubbedOut) role = 'subbed_out'
  else if (isSubbedIn) role = 'subbed_in'

  let note: string | null = null

  if (isSubbedIn && sub?.original_teacher_id) {
    const name = subNamesById.get(sub.original_teacher_id)
    note = name ? `Sub for ${name}` : `Sub for ${sub.original_teacher_id.slice(0, 8)}`
  }
  if (isSubbedOut && substituteTeacherId) {
    const name = subNamesById.get(substituteTeacherId)
    note = name ? `Covered by ${name}` : `Covered by ${substituteTeacherId.slice(0, 8)}`
  }
  if (onLeave && !isSubbedOut && !isSubbedIn) {
    note = 'On leave — not paid'
  }
  if (att?.is_rendered === false && att.override_reason) {
    note = `Manual: ${att.override_reason}`
  } else if (att?.is_rendered === true && att.override_reason) {
    note = `Manual paid: ${att.override_reason}`
  } else if (!rendered && !cancelled && !isSubbedOut && !isSubbedIn && !onLeave) {
    if (att?.status === 'absent') note = 'Absent — not paid'
    else if (att?.status === 'no_show') note = 'No-show — not paid'
    else if (att?.status === 'excused') note = 'Excused — not paid'
    else if (att?.status === 'not_expected') note = 'Not expected — not paid'
  }

  cell.items.push({
    source,
    sessionId,
    title,
    hours: hrs,
    startTime: start,
    endTime: end,
    role,
    attendanceStatus: att?.status ?? null,
    rendered,
    subbedOut: isSubbedOut,
    subbedIn: isSubbedIn,
    note,
    overrideReason: att?.override_reason ?? null,
    isFuture: isFuture(date),
  })
}