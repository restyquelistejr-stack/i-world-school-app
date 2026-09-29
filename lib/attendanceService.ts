// lib/attendanceService.ts
// ⭐ v3.14c: All attendance creators are idempotent (upsert with ignoreDuplicates)
// - Prevents duplicate rows even if the code path runs twice (React re-renders, retries, parallel calls)
// - Relies on the UNIQUE constraint: (session_type, session_id, attendee_type, attendee_id)
import { supabase } from '@/lib/supabaseClient';

export type SessionType = 'booking' | 'group_session' | 'trial_booking';
export type AttendeeType = 'teacher' | 'student';
export type AttendanceStatus =
  | 'expected'
  | 'present'
  | 'late'
  | 'absent'
  | 'no_show'
  | 'excused'
  | 'not_expected';

export interface AttendanceRow {
  id: string;
  session_type: SessionType;
  session_id: string;
  attendee_type: AttendeeType;
  attendee_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  marked_at: string | null;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterEntry extends AttendanceRow {
  attendee_name?: string;
  attendee_email?: string;
}

/**
 * The UNIQUE key that all creators dedupe on.
 * Kept in a constant so it stays in sync with the DB constraint.
 */
const ATTENDANCE_CONFLICT_KEY =
  'session_type,session_id,attendee_type,attendee_id';

// ============================================================
// CREATE ROWS (idempotent)
// ============================================================

/**
 * Create attendance rows for a private booking (1 teacher + 1 student).
 * Safe to call multiple times — duplicates are ignored.
 */
export async function createAttendanceForBooking(
  bookingId: string,
  teacherId: string | null,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const rows: Array<Partial<AttendanceRow>> = [];

  if (teacherId) {
    rows.push({
      session_type: 'booking',
      session_id: bookingId,
      attendee_type: 'teacher',
      attendee_id: teacherId,
      status: 'expected',
    });
  }

  rows.push({
    session_type: 'booking',
    session_id: bookingId,
    attendee_type: 'student',
    attendee_id: studentId,
    status: 'expected',
  });

  const { error } = await supabase
    .from('session_attendance')
    .upsert(rows, {
      onConflict: ATTENDANCE_CONFLICT_KEY,
      ignoreDuplicates: true,
    });

  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * Create attendance rows for a trial booking (1 teacher + 1 student).
 * Safe to call multiple times.
 */
export async function createAttendanceForTrial(
  trialId: string,
  teacherId: string | null,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const rows: Array<Partial<AttendanceRow>> = [];

  if (teacherId) {
    rows.push({
      session_type: 'trial_booking',
      session_id: trialId,
      attendee_type: 'teacher',
      attendee_id: teacherId,
      status: 'expected',
    });
  }

  rows.push({
    session_type: 'trial_booking',
    session_id: trialId,
    attendee_type: 'student',
    attendee_id: studentId,
    status: 'expected',
  });

  const { error } = await supabase
    .from('session_attendance')
    .upsert(rows, {
      onConflict: ATTENDANCE_CONFLICT_KEY,
      ignoreDuplicates: true,
    });

  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * Create the teacher attendance row for a group session.
 * Safe to call multiple times.
 */
export async function createAttendanceForGroupSession(
  sessionId: string,
  teacherId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: true };

  const { error } = await supabase
    .from('session_attendance')
    .upsert(
      {
        session_type: 'group_session',
        session_id: sessionId,
        attendee_type: 'teacher',
        attendee_id: teacherId,
        status: 'expected',
      },
      {
        onConflict: ATTENDANCE_CONFLICT_KEY,
        ignoreDuplicates: true,
      }
    );

  return error ? { success: false, error: error.message } : { success: true };
}

// ============================================================
// ENROLLMENT HOOKS (idempotent)
// ============================================================

/**
 * Called when a student enrolls in a group class.
 * Creates 'expected' attendance rows for all FUTURE sessions of the class.
 * Safe to call multiple times — existing rows are ignored.
 */
export async function onStudentEnrolledInGroup(
  groupClassId: string,
  studentId: string,
  enrollmentDate?: string
): Promise<{ success: boolean; error?: string; rowsCreated?: number }> {
  const today = enrollmentDate || new Date().toISOString().slice(0, 10);

  const { data: sessions, error: sessionsErr } = await supabase
    .from('group_class_sessions')
    .select('id')
    .eq('group_class_id', groupClassId)
    .gte('session_date', today)
    .is('deleted_at', null)
    .in('status', ['scheduled', 'ongoing']);

  if (sessionsErr) return { success: false, error: sessionsErr.message };
  if (!sessions || sessions.length === 0) return { success: true, rowsCreated: 0 };

  const rows = sessions.map(s => ({
    session_type: 'group_session' as SessionType,
    session_id: s.id,
    attendee_type: 'student' as AttendeeType,
    attendee_id: studentId,
    status: 'expected' as AttendanceStatus,
  }));

  const { error } = await supabase
    .from('session_attendance')
    .upsert(rows, {
      onConflict: ATTENDANCE_CONFLICT_KEY,
      ignoreDuplicates: true,
    });

  if (error) return { success: false, error: error.message };
  return { success: true, rowsCreated: rows.length };
}

/**
 * Called when a student withdraws from a group class.
 * Flips future "expected" rows to "not_expected".
 */
export async function onStudentWithdrawnFromGroup(
  groupClassId: string,
  studentId: string,
  withdrawalDate?: string
): Promise<{ success: boolean; error?: string; rowsUpdated?: number }> {
  const today = withdrawalDate || new Date().toISOString().slice(0, 10);

  const { data: sessions, error: sessionsErr } = await supabase
    .from('group_class_sessions')
    .select('id')
    .eq('group_class_id', groupClassId)
    .gte('session_date', today)
    .is('deleted_at', null);

  if (sessionsErr) return { success: false, error: sessionsErr.message };
  if (!sessions || sessions.length === 0) return { success: true, rowsUpdated: 0 };

  const sessionIds = sessions.map(s => s.id);

  const { data: updated, error } = await supabase
    .from('session_attendance')
    .update({ status: 'not_expected' })
    .eq('attendee_type', 'student')
    .eq('attendee_id', studentId)
    .eq('session_type', 'group_session')
    .in('session_id', sessionIds)
    .eq('status', 'expected')
    .select('id');

  if (error) return { success: false, error: error.message };
  return { success: true, rowsUpdated: updated?.length || 0 };
}

// ============================================================
// TEACHER CHECK-IN
// ============================================================

/**
 * Record a teacher check-in for a session.
 * Idempotent — calling twice just updates the arrival timestamp.
 */
export async function recordTeacherCheckIn(
  sessionType: SessionType,
  sessionId: string,
  teacherId: string,
  options?: { status?: 'present' | 'late' }
): Promise<{ success: boolean; error?: string }> {
  const now = new Date();
  const status = options?.status || 'present';
  const arrival = now.toTimeString().slice(0, 8);

  const { error } = await supabase
    .from('session_attendance')
    .upsert(
      {
        session_type: sessionType,
        session_id: sessionId,
        attendee_type: 'teacher',
        attendee_id: teacherId,
        status,
        arrival_time: arrival,
        marked_at: now.toISOString(),
        marked_by: teacherId,
      },
      { onConflict: ATTENDANCE_CONFLICT_KEY }
    );

  return error ? { success: false, error: error.message } : { success: true };
}

// ============================================================
// MARK ATTENDANCE
// ============================================================

export interface MarkAttendanceInput {
  session_type: SessionType;
  session_id: string;
  attendee_type: AttendeeType;
  attendee_id: string;
  status: AttendanceStatus;
  notes?: string;
  actor_id?: string;
}

export async function markAttendance(
  input: MarkAttendanceInput
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('session_attendance')
    .upsert(
      {
        session_type: input.session_type,
        session_id: input.session_id,
        attendee_type: input.attendee_type,
        attendee_id: input.attendee_id,
        status: input.status,
        marked_at: now,
        marked_by: input.actor_id || null,
        notes: input.notes || null,
      },
      { onConflict: ATTENDANCE_CONFLICT_KEY }
    );

  return error ? { success: false, error: error.message } : { success: true };
}

export async function markAttendanceBulk(
  inputs: MarkAttendanceInput[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  if (inputs.length === 0) return { success: true, count: 0 };

  // ⭐ Dedupe by unique key in case the same attendee is passed twice
  const seen = new Set<string>();
  const deduped = inputs.filter(i => {
    const key = `${i.session_type}|${i.session_id}|${i.attendee_type}|${i.attendee_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = new Date().toISOString();
  const rows = deduped.map(i => ({
    session_type: i.session_type,
    session_id: i.session_id,
    attendee_type: i.attendee_type,
    attendee_id: i.attendee_id,
    status: i.status,
    marked_at: now,
    marked_by: i.actor_id || null,
    notes: i.notes || null,
  }));

  const { error } = await supabase
    .from('session_attendance')
    .upsert(rows, { onConflict: ATTENDANCE_CONFLICT_KEY });

  return error
    ? { success: false, error: error.message }
    : { success: true, count: rows.length };
}

// ============================================================
// ROSTER QUERIES
// ============================================================

/**
 * Get the full roster for a session (teacher + students).
 * Enriches with user name/email.
 */
export async function getSessionRoster(
  sessionType: SessionType,
  sessionId: string
): Promise<{ success: boolean; roster?: RosterEntry[]; error?: string }> {
  const { data, error } = await supabase
    .from('session_attendance')
    .select('*')
    .eq('session_type', sessionType)
    .eq('session_id', sessionId)
    .order('attendee_type', { ascending: false });

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: true, roster: [] };

  const attendeeIds = [...new Set(data.map(r => r.attendee_id))];

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', attendeeIds);

  const userMap: Record<string, { full_name: string; email: string | null }> = {};
  (users || []).forEach((u: any) => {
    userMap[u.id] = { full_name: u.full_name || 'Unknown', email: u.email };
  });

  const roster: RosterEntry[] = data.map(r => ({
    ...r,
    attendee_name: userMap[r.attendee_id]?.full_name || 'Unknown',
    attendee_email: userMap[r.attendee_id]?.email || undefined,
  }));

  return { success: true, roster };
}

// ============================================================
// STATUS LABELS
// ============================================================

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  expected: '⏳ Expected',
  present: '✅ Present',
  late: '⏰ Late',
  absent: '❌ Absent',
  no_show: '🚫 No-show',
  excused: '📝 Excused',
  not_expected: '👻 Not expected',
};

export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  expected: 'bg-gray-100 text-gray-700',
  present: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
  excused: 'bg-blue-100 text-blue-800',
  not_expected: 'bg-gray-50 text-gray-400',
};