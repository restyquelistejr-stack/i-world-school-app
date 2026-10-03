// lib/substituteService.ts
// ⭐ Substitute teacher system — helper service
// ⭐ M5 FIX: Robust unflag + leave_id linking on dedupe
// ⭐ v3.3 FIX (A): Timezone bug — string extraction instead of new Date().toISOString()
// ⭐ v3.3 FIX (B): staff_courses has no is_active column — removed filter + added error logs
// ⭐ v3.16: Attendance follows substitute — assign/unassign swap session_attendance.attendee_id
import { supabase } from './supabaseClient';

export type SessionType =
  | 'trial_private'
  | 'trial_group'
  | 'private_session'
  | 'group_session';

export interface SubstituteAssignmentInput {
  session_type: SessionType;
  session_id: string;
  original_teacher_id: string | null;
  leave_id?: string | null;
  leave_reason?: string | null;
  class_id?: string | null;
  course_id?: string | null;
  module_id?: string | null;
  room_id?: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
}

// ==========================================
// SAFE STRING HELPERS
// ==========================================

/**
 * Extract 'YYYY-MM-DD' from a Supabase date/timestamp string.
 * Handles: "2026-09-25" | "2026-09-25T17:00:00" | "2026-09-25 17:00:00+00"
 */
function extractDate(ts: string | null | undefined): string {
  if (!ts) return '';
  return String(ts).slice(0, 10);
}

/**
 * Extract 'HH:mm' from a Supabase timestamp string OR a TIME string.
 * Handles: "2026-09-25T17:00:00" | "2026-09-25 17:00:00" | "17:00:00" | "17:00"
 */
function extractTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const s = String(ts);
  // Full timestamp "YYYY-MM-DDTHH:mm:ss..." → chars 11-16
  if (s.length >= 16 && s[10] === 'T') return s.slice(11, 16);
  // Full timestamp with space "YYYY-MM-DD HH:mm:ss" → chars 11-16
  if (s.length >= 16 && s[10] === ' ') return s.slice(11, 16);
  // TIME "HH:mm:ss" or "HH:mm" → chars 0-5
  return s.slice(0, 5);
}

// ==========================================
// CREATE / DEDUPE
// ==========================================

export async function createSubstituteAssignment(
  input: SubstituteAssignmentInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data: existing } = await supabase
      .from('substitute_assignments')
      .select('id, status, leave_id')
      .eq('session_type', input.session_type)
      .eq('session_id', input.session_id)
      .in('status', ['pending', 'assigned'])
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending' && !existing.leave_id && input.leave_id) {
        await supabase
          .from('substitute_assignments')
          .update({
            leave_id: input.leave_id,
            leave_reason: input.leave_reason || 'leave',
          })
          .eq('id', existing.id);
        console.log(`🔗 Linked existing assignment ${existing.id} to leave ${input.leave_id}`);
      }
      return { success: true, id: existing.id };
    }

    const { data, error } = await supabase
      .from('substitute_assignments')
      .insert({
        session_type: input.session_type,
        session_id: input.session_id,
        original_teacher_id: input.original_teacher_id,
        leave_id: input.leave_id || null,
        leave_reason: input.leave_reason || null,
        class_id: input.class_id || null,
        course_id: input.course_id || null,
        module_id: input.module_id || null,
        room_id: input.room_id || null,
        session_date: input.session_date,
        start_time: input.start_time,
        end_time: input.end_time,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating substitute assignment:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Exception in createSubstituteAssignment:', err);
    return { success: false, error: err.message };
  }
}

export async function createBulkSubstituteAssignments(
  inputs: SubstituteAssignmentInput[]
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  for (const input of inputs) {
    const result = await createSubstituteAssignment(input);
    if (result.success) created++;
    else failed++;
  }

  return { created, failed };
}

export async function cancelSubstituteAssignment(
  sessionType: SessionType,
  sessionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('substitute_assignments')
      .update({ status: 'cancelled' })
      .eq('session_type', sessionType)
      .eq('session_id', sessionId)
      .in('status', ['pending', 'assigned']);

    return !error;
  } catch (err) {
    console.error('Exception in cancelSubstituteAssignment:', err);
    return false;
  }
}

// ==========================================
// SESSION FLAGS
// ==========================================

export async function flagSessionNeedsAttention(
  table: 'bookings' | 'group_class_sessions' | 'trial_class_bookings',
  sessionId: string,
  reason: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update({
        needs_attention: true,
        attention_reason: reason,
      })
      .eq('id', sessionId);

    return !error;
  } catch (err) {
    console.error(`Exception flagging ${table}/${sessionId}:`, err);
    return false;
  }
}

export async function clearSessionAttention(
  table: 'bookings' | 'group_class_sessions' | 'trial_class_bookings',
  sessionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update({
        needs_attention: false,
        attention_reason: null,
      })
      .eq('id', sessionId);

    return !error;
  } catch (err) {
    console.error(`Exception clearing attention ${table}/${sessionId}:`, err);
    return false;
  }
}

// ==========================================
// M5: AUTO-FLAG ON LEAVE APPROVAL
// ==========================================

interface ScanResult {
  scanned: number;
  flagged: number;
  skipped: number;
  failed: number;
  details: Array<{
    sessionType: SessionType;
    sessionId: string;
    sessionDate: string;
    status: 'flagged' | 'skipped' | 'failed';
    error?: string;
  }>;
}

export async function scanAndFlagAffectedSessions(
  staffId: string,
  leaveId: string,
  leaveStart: string,
  leaveEnd: string,
  leaveReason?: string
): Promise<ScanResult> {
  const result: ScanResult = {
    scanned: 0,
    flagged: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  console.log(`🔍 Scanning sessions for teacher ${staffId} from ${leaveStart} to ${leaveEnd}`);

  const isWithinLeave = (dateStr: string): boolean => {
    return dateStr >= leaveStart && dateStr <= leaveEnd;
  };

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const processSession = async (
    sessionType: SessionType,
    sessionId: string,
    sessionDate: string,
    startTime: string,
    endTime: string,
    teacherId: string,
    classId: string | null,
    courseId: string | null,
    moduleId: string | null,
    roomId: string | null,
    table: 'bookings' | 'group_class_sessions' | 'trial_class_bookings'
  ) => {
    if (sessionDate < today) {
      result.scanned++;
      return;
    }
    if (!isWithinLeave(sessionDate)) {
      result.scanned++;
      return;
    }
    result.scanned++;

    const { data: existing } = await supabase
      .from('substitute_assignments')
      .select('id, status, leave_id')
      .eq('session_type', sessionType)
      .eq('session_id', sessionId)
      .in('status', ['pending', 'assigned'])
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending' && !existing.leave_id) {
        const { error: linkError } = await supabase
          .from('substitute_assignments')
          .update({
            leave_id: leaveId,
            leave_reason: leaveReason || 'leave',
          })
          .eq('id', existing.id);

        if (!linkError) {
          console.log(`🔗 Linked existing assignment ${existing.id} to leave ${leaveId}`);
        }
      }
      result.skipped++;
      result.details.push({ sessionType, sessionId, sessionDate, status: 'skipped' });
      return;
    }

    const flagged = await flagSessionNeedsAttention(
      table,
      sessionId,
      `teacher_leave:${leaveReason || 'leave'}`
    );

    if (!flagged) {
      result.failed++;
      result.details.push({ sessionType, sessionId, sessionDate, status: 'failed', error: 'Failed to flag session' });
      return;
    }

    const created = await createSubstituteAssignment({
      session_type: sessionType,
      session_id: sessionId,
      original_teacher_id: teacherId,
      leave_id: leaveId,
      leave_reason: leaveReason || null,
      class_id: classId,
      course_id: courseId,
      module_id: moduleId,
      room_id: roomId,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
    });

    if (created.success) {
      result.flagged++;
      result.details.push({ sessionType, sessionId, sessionDate, status: 'flagged' });
    } else {
      result.failed++;
      result.details.push({ sessionType, sessionId, sessionDate, status: 'failed', error: created.error });
    }
  };

  try {
    // ==========================================
    // 1. SCAN group_class_sessions
    // ==========================================
    const { data: groupSessions, error: gsError } = await supabase
      .from('group_class_sessions')
      .select('*')
      .eq('teacher_id', staffId)
      .gte('session_date', today)
      .lte('session_date', leaveEnd)
      .in('status', ['scheduled', 'ongoing']);

    if (gsError) {
      console.error('❌ Error fetching group sessions:', gsError);
    } else if (groupSessions) {
      console.log(`  → ${groupSessions.length} group sessions in scan window`);
      for (const s of groupSessions) {
        const { data: groupClass } = await supabase
          .from('scheduled_group_classes')
          .select('id, course_id, module_id')
          .eq('id', s.group_class_id)
          .maybeSingle();

        await processSession(
          'group_session',
          s.id,
          String(s.session_date).slice(0, 10),
          String(s.start_time).slice(0, 5),
          String(s.end_time).slice(0, 5),
          staffId,
          s.group_class_id,
          groupClass?.course_id || null,
          groupClass?.module_id || null,
          s.room_id || null,
          'group_class_sessions'
        );
      }
    }

    // ==========================================
    // 2. SCAN bookings (private class sessions)
    // ==========================================
    // ⭐ v3.3 FIX: use extractDate/extractTime — no timezone shift
    const { data: privateBookings, error: pbError } = await supabase
      .from('bookings')
      .select('*')
      .eq('teacher_id', staffId)
      .gte('start_time', `${today}T00:00:00`)
      .lte('start_time', `${leaveEnd}T23:59:59`)
      .in('status', ['confirmed', 'in_progress', 'pending'])
      .or('is_trial.is.null,is_trial.eq.false');

    if (pbError) {
      console.error('❌ Error fetching private bookings:', pbError);
    } else if (privateBookings) {
      console.log(`  → ${privateBookings.length} private bookings in scan window`);
      for (const b of privateBookings) {
        await processSession(
          'private_session',
          b.id,
          extractDate(b.start_time),
          extractTime(b.start_time),
          extractTime(b.end_time),
          staffId,
          b.class_id || null,
          b.course_id || null,
          null,
          b.room_id || null,
          'bookings'
        );
      }
    }

    // ==========================================
    // 3. SCAN trial_class_bookings
    // ==========================================
    const { data: trialBookings, error: tbError } = await supabase
      .from('trial_class_bookings')
      .select('*')
      .eq('selected_teacher_id', staffId)
      .gte('selected_date', today)
      .lte('selected_date', leaveEnd)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

    if (tbError) {
      console.error('❌ Error fetching trial bookings:', tbError);
    } else if (trialBookings) {
      console.log(`  → ${trialBookings.length} trial bookings in scan window`);
      for (const t of trialBookings) {
        if (!t.selected_date || !t.selected_time) continue;

        const startTime = extractTime(t.selected_time);
        const startHour = parseInt(startTime.split(':')[0], 10);
        const startMin = startTime.split(':')[1] || '00';
        const endHour = startHour + (t.hours || 2);
        const endTime = `${String(endHour).padStart(2, '0')}:${startMin}`;

        const isGroupTrial = t.session_type === 'group' && t.selected_group_class_id;

        await processSession(
          isGroupTrial ? 'trial_group' : 'trial_private',
          t.id,
          extractDate(t.selected_date),
          startTime,
          endTime,
          staffId,
          t.selected_group_class_id || null,
          t.course_id || null,
          t.module_id || null,
          t.room_id || null,
          'trial_class_bookings'
        );
      }
    }

    console.log(`✅ Scan complete:`, {
      scanned: result.scanned,
      flagged: result.flagged,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  } catch (err: any) {
    console.error('❌ Exception in scanAndFlagAffectedSessions:', err);
    return result;
  }
}

// ==========================================
// M5 FIX: ROBUST UNFLAG ON LEAVE UN-APPROVE
// ==========================================

export async function unflagSessionsForLeave(
  leaveId: string,
  staffId?: string,
  leaveStart?: string,
  leaveEnd?: string
): Promise<{ unassigned: number; failed: number }> {
  let unassigned = 0;
  let failed = 0;

  try {
    console.log(`🔄 Unflagging sessions for leave ${leaveId}`);

    const { data: byLeaveId, error: e1 } = await supabase
      .from('substitute_assignments')
      .select('id, session_type, session_id, original_teacher_id, session_date, leave_id')
      .eq('leave_id', leaveId)
      .eq('status', 'pending');

    if (e1) console.error('Error fetching by leave_id:', e1);

    let byRange: any[] = [];
    if (staffId && leaveStart && leaveEnd) {
      const { data: byRangeData, error: e2 } = await supabase
        .from('substitute_assignments')
        .select('id, session_type, session_id, original_teacher_id, session_date, leave_id')
        .eq('original_teacher_id', staffId)
        .is('leave_id', null)
        .eq('status', 'pending')
        .gte('session_date', leaveStart)
        .lte('session_date', leaveEnd);

      if (e2) console.error('Error fetching by range:', e2);
      byRange = byRangeData || [];
    }

    const allAssignments = [...(byLeaveId || []), ...byRange];
    const seenIds = new Set<string>();
    const assignments = allAssignments.filter(a => {
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    });

    console.log(`  → Found ${byLeaveId?.length || 0} by leave_id, ${byRange.length} by range`);
    console.log(`  → ${assignments.length} unique assignments to cancel`);

    if (assignments.length === 0) {
      return { unassigned: 0, failed: 0 };
    }

    for (const a of assignments) {
      const table =
        a.session_type === 'group_session' ? 'group_class_sessions' :
        a.session_type === 'private_session' ? 'bookings' :
        'trial_class_bookings';

      const cleared = await clearSessionAttention(table as any, a.session_id);
      if (!cleared) failed++;

      const { error: updateError } = await supabase
        .from('substitute_assignments')
        .update({ status: 'cancelled' })
        .eq('id', a.id);

      if (updateError) {
        console.error(`Error cancelling assignment ${a.id}:`, updateError);
        failed++;
      } else {
        unassigned++;
      }
    }

    console.log(`✅ Unflag complete: ${unassigned} cancelled, ${failed} failed`);
    return { unassigned, failed };
  } catch (err: any) {
    console.error('❌ Exception in unflagSessionsForLeave:', err);
    return { unassigned: 0, failed: 0 };
  }
}

// ==========================================
// M7: SUBSTITUTE DASHBOARD QUERIES
// ==========================================

export interface SubstituteNeed {
  id: string;
  session_type: SessionType;
  session_id: string;
  original_teacher_id: string | null;
  original_teacher_name?: string;
  leave_id: string | null;
  leave_reason: string | null;
  class_id: string | null;
  class_code?: string | null;
  course_id: string | null;
  course_name?: string | null;
  module_id: string | null;
  module_name?: string | null;
  room_id: string | null;
  room_name?: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  substitute_teacher_id: string | null;
  substitute_teacher_name?: string | null;
  notes: string | null;
  created_at: string;

  student_name?: string | null;
  urgency: 'today' | 'tomorrow' | 'this_week' | 'later' | 'past';
  days_until: number;
}

export async function getPendingSubstituteNeeds(): Promise<SubstituteNeed[]> {
  try {
    const { data, error } = await supabase
      .from('substitute_assignments')
      .select('*')
      .in('status', ['pending', 'assigned'])
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching substitute needs:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Batch-collect ids
    const teacherIds = new Set<string>();
    const courseIds = new Set<string>();
    const moduleIds = new Set<string>();
    const roomIds = new Set<string>();
    const classIds = new Set<string>();
    const sessionIdsByType: Record<string, string[]> = {
      group_session: [],
      private_session: [],
      trial_private: [],
      trial_group: [],
    };

    for (const row of data) {
      if (row.original_teacher_id) teacherIds.add(row.original_teacher_id);
      if (row.substitute_teacher_id) teacherIds.add(row.substitute_teacher_id);
      if (row.course_id) courseIds.add(row.course_id);
      if (row.module_id) moduleIds.add(row.module_id);
      if (row.room_id) roomIds.add(row.room_id);
      if (row.class_id) classIds.add(row.class_id);
      if (sessionIdsByType[row.session_type]) {
        sessionIdsByType[row.session_type].push(row.session_id);
      }
    }

    // ⭐ v3.3: Also fetch live session rows to override snapshot times
    const [
      usersRes,
      coursesRes,
      modulesRes,
      roomsRes,
      classesRes,
      groupSessionsRes,
      bookingsRes,
      trialsRes,
    ] = await Promise.all([
      teacherIds.size > 0
        ? supabase.from('users').select('id, full_name').in('id', Array.from(teacherIds))
        : Promise.resolve({ data: [] as any[] }),
      courseIds.size > 0
        ? supabase.from('courses').select('id, name').in('id', Array.from(courseIds))
        : Promise.resolve({ data: [] as any[] }),
      moduleIds.size > 0
        ? supabase.from('course_modules').select('id, title').in('id', Array.from(moduleIds))
        : Promise.resolve({ data: [] as any[] }),
      roomIds.size > 0
        ? supabase.from('rooms').select('id, name').in('id', Array.from(roomIds))
        : Promise.resolve({ data: [] as any[] }),
      classIds.size > 0
        ? supabase.from('classes').select('id, class_code').in('id', Array.from(classIds))
        : Promise.resolve({ data: [] as any[] }),
      sessionIdsByType.group_session.length > 0
        ? supabase
            .from('group_class_sessions')
            .select('id, group_class_id, session_number, session_date, start_time, end_time, room_id, teacher_id')
            .in('id', sessionIdsByType.group_session)
        : Promise.resolve({ data: [] as any[] }),
      sessionIdsByType.private_session.length > 0
        ? supabase
            .from('bookings')
            .select('id, class_id, student_id, start_time, end_time, room_id, teacher_id')
            .in('id', sessionIdsByType.private_session)
        : Promise.resolve({ data: [] as any[] }),
      (sessionIdsByType.trial_private.length + sessionIdsByType.trial_group.length) > 0
        ? supabase
            .from('trial_class_bookings')
            .select('id, student_id, session_type, selected_date, selected_time, hours, room_id, selected_teacher_id')
            .in('id', [
              ...sessionIdsByType.trial_private,
              ...sessionIdsByType.trial_group,
            ])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap: Record<string, string> = {};
    (usersRes.data || []).forEach((u: any) => { userMap[u.id] = u.full_name; });

    const courseMap: Record<string, string> = {};
    (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = c.name; });

    const moduleMap: Record<string, string> = {};
    (modulesRes.data || []).forEach((m: any) => { moduleMap[m.id] = m.title; });

    const roomMap: Record<string, string> = {};
    (roomsRes.data || []).forEach((r: any) => { roomMap[r.id] = r.name; });

    const classCodeMap: Record<string, string> = {};
    (classesRes.data || []).forEach((c: any) => { classCodeMap[c.id] = c.class_code; });

    // ⭐ v3.3: Live session lookup — override snapshot for display
    const liveSessionMap: Record<string, { date: string; start: string; end: string; room_id?: string | null }> = {};

    (groupSessionsRes.data || []).forEach((s: any) => {
      liveSessionMap[s.id] = {
        date: extractDate(s.session_date),
        start: extractTime(s.start_time),
        end: extractTime(s.end_time),
        room_id: s.room_id,
      };
    });

    (bookingsRes.data || []).forEach((b: any) => {
      liveSessionMap[b.id] = {
        date: extractDate(b.start_time),
        start: extractTime(b.start_time),
        end: extractTime(b.end_time),
        room_id: b.room_id,
      };
    });

    (trialsRes.data || []).forEach((t: any) => {
      const start = extractTime(t.selected_time);
      const startHour = parseInt(start.split(':')[0], 10);
      const startMin = start.split(':')[1] || '00';
      const endHour = startHour + (t.hours || 2);
      const end = `${String(endHour).padStart(2, '0')}:${startMin}`;
      liveSessionMap[t.id] = {
        date: extractDate(t.selected_date),
        start,
        end,
        room_id: t.room_id,
      };
    });

    // Resolve student names
    const studentIds = new Set<string>();
    (bookingsRes.data || []).forEach((b: any) => {
      if (b.student_id) studentIds.add(b.student_id);
    });
    (trialsRes.data || []).forEach((t: any) => {
      if (t.student_id) studentIds.add(t.student_id);
    });

    let studentMap: Record<string, string> = {};
    if (studentIds.size > 0) {
      const { data: studentsData } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', Array.from(studentIds));
      (studentsData || []).forEach((s: any) => { studentMap[s.id] = s.full_name; });
    }

    const studentBySessionId: Record<string, string> = {};
    (bookingsRes.data || []).forEach((b: any) => {
      if (b.student_id && studentMap[b.student_id]) {
        studentBySessionId[b.id] = studentMap[b.student_id];
      }
    });
    (trialsRes.data || []).forEach((t: any) => {
      if (t.student_id && studentMap[t.student_id]) {
        studentBySessionId[t.id] = studentMap[t.student_id];
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const needs: SubstituteNeed[] = data.map((row: any) => {
      const live = liveSessionMap[row.session_id];
      const sessionDate = live?.date || extractDate(row.session_date);
      const startTime = live?.start || extractTime(row.start_time);
      const endTime = live?.end || extractTime(row.end_time);
      const roomId = live?.room_id || row.room_id;

      let urgency: SubstituteNeed['urgency'] = 'later';
      let daysUntil = 9999;
      if (sessionDate) {
        const d = new Date(sessionDate + 'T00:00:00');
        daysUntil = Math.floor((d.getTime() - today.getTime()) / 86400000);
        if (daysUntil < 0) urgency = 'past';
        else if (daysUntil === 0) urgency = 'today';
        else if (daysUntil === 1) urgency = 'tomorrow';
        else if (daysUntil <= 7) urgency = 'this_week';
        else urgency = 'later';
      }

      return {
        id: row.id,
        session_type: row.session_type,
        session_id: row.session_id,
        original_teacher_id: row.original_teacher_id,
        original_teacher_name: row.original_teacher_id ? userMap[row.original_teacher_id] : 'Unknown',
        leave_id: row.leave_id,
        leave_reason: row.leave_reason,
        class_id: row.class_id,
        class_code: row.class_id ? classCodeMap[row.class_id] : null,
        course_id: row.course_id,
        course_name: row.course_id ? courseMap[row.course_id] : null,
        module_id: row.module_id,
        module_name: row.module_id ? moduleMap[row.module_id] : null,
        room_id: roomId,
        room_name: roomId ? roomMap[roomId] : null,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        status: row.status,
        substitute_teacher_id: row.substitute_teacher_id,
        substitute_teacher_name: row.substitute_teacher_id
          ? userMap[row.substitute_teacher_id]
          : null,
        notes: row.notes,
        created_at: row.created_at,
        student_name: studentBySessionId[row.session_id] || null,
        urgency,
        days_until: daysUntil,
      };
    });

    return needs;
  } catch (err) {
    console.error('Exception in getPendingSubstituteNeeds:', err);
    return [];
  }
}

// ==========================================
// M8: FIND & ASSIGN SUBSTITUTE
// ==========================================

export interface SubstituteCandidate {
  teacher_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  qualification_source: 'module' | 'course' | 'none';
  specialization?: string | null;
  years_experience?: number | null;
  is_available: boolean;
  is_qualified: boolean;
  availability_issues: string[];
  already_assigned: boolean;
  score: number;
}

export interface FindSubstitutesInput {
  session_type: SessionType;
  session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  course_id: string | null;
  module_id: string | null;
  room_id: string | null;
  original_teacher_id: string | null;
}

export async function findQualifiedSubstitutes(
  input: FindSubstitutesInput
): Promise<SubstituteCandidate[]> {
  try {
    console.log('🔍 Finding substitutes for:', input);

    // ==========================================
    // STEP 1: Build candidate pool
    // ⭐ v3.3 FIX: removed is_active filters that don't exist; log errors
    // ==========================================
    let candidateIds: string[] = [];
    let source: 'module' | 'course' | 'none' = 'none';

    // 1a. Try module-qualified teachers
    if (input.module_id) {
      const { data: moduleTeachers, error: mtError } = await supabase
        .from('teacher_modules')
        .select('teacher_id')
        .eq('module_id', input.module_id);

      if (mtError) {
        console.error('❌ teacher_modules lookup failed:', mtError);
      } else if (moduleTeachers && moduleTeachers.length > 0) {
        candidateIds = moduleTeachers.map((t: any) => t.teacher_id);
        source = 'module';
        console.log(`  → ${candidateIds.length} module-qualified teacher(s)`);
      }
    }

    // 1b. Fallback to course-qualified teachers
    // ⭐ v3.3 FIX: staff_courses has NO is_active column — removed filter
    if (candidateIds.length === 0 && input.course_id) {
      const { data: courseTeachers, error: ctError } = await supabase
        .from('staff_courses')
        .select('staff_id')
        .eq('course_id', input.course_id);

      if (ctError) {
        console.error('❌ staff_courses lookup failed:', ctError);
      } else if (courseTeachers && courseTeachers.length > 0) {
        candidateIds = courseTeachers.map((t: any) => t.staff_id);
        source = 'course';
        console.log(`  → ${candidateIds.length} course-qualified teacher(s)`);
      }
    }

    if (candidateIds.length === 0) {
      console.log('⚠️ No qualified teachers found for this module/course');
      return [];
    }

    // ==========================================
    // STEP 2: Fetch teacher details
    // ==========================================
    const { data: usersData, error: uErr } = await supabase
      .from('users')
      .select('id, full_name, email, phone')
      .in('id', candidateIds)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .order('full_name');

    if (uErr) console.error('❌ users lookup failed:', uErr);

    const { data: profilesData } = await supabase
      .from('teachers')
      .select('id, specialization, years_experience')
      .in('id', candidateIds);

    const profileMap: Record<string, any> = {};
    (profilesData || []).forEach((p: any) => { profileMap[p.id] = p; });

    if (!usersData || usersData.length === 0) {
      console.log('⚠️ No active teacher user records found');
      return [];
    }

    // ==========================================
    // STEP 3: Day of week for the session
    // ==========================================
    const sessionDate = new Date(input.session_date + 'T00:00:00');
    const dayOfWeek = sessionDate.getDay();
    console.log(`  → Session is on day_of_week=${dayOfWeek} (0=Sun, 6=Sat)`);

    // ==========================================
    // STEP 4: Availability windows
    // ==========================================
    const { data: availabilityData, error: avErr } = await supabase
      .from('teacher_availability')
      .select('*')
      .in('teacher_id', candidateIds)
      .eq('is_active', true);

    if (avErr) console.error('❌ teacher_availability lookup failed:', avErr);

    const availabilityByTeacher: Record<string, { start: string; end: string }[]> = {};
    (availabilityData || []).forEach((a: any) => {
      if (a.day_of_week !== dayOfWeek) return;
      if (!availabilityByTeacher[a.teacher_id]) availabilityByTeacher[a.teacher_id] = [];
      availabilityByTeacher[a.teacher_id].push({
        start: extractTime(a.start_time),
        end: extractTime(a.end_time),
      });
    });

    // ==========================================
    // STEP 5: Approved leaves covering the date
    // ==========================================
    const { data: leavesData, error: lErr } = await supabase
      .from('staff_leaves')
      .select('staff_id, start_date, end_date, leave_type')
      .in('staff_id', candidateIds)
      .eq('status', 'approved')
      .lte('start_date', input.session_date)
      .gte('end_date', input.session_date);

    if (lErr) console.error('❌ staff_leaves lookup failed:', lErr);

    const teachersOnLeave = new Set<string>();
    const leaveByTeacher: Record<string, string> = {};
    (leavesData || []).forEach((l: any) => {
      teachersOnLeave.add(l.staff_id);
      leaveByTeacher[l.staff_id] = l.leave_type;
    });

    // ==========================================
    // STEP 6: Conflict checks
    // ⭐ v3.3 FIX: wall-clock string boundaries — no ISO-Z conversion
    // ==========================================
    const sessionStart = `${input.session_date}T${input.start_time}:00`;
    const sessionEnd = `${input.session_date}T${input.end_time}:00`;

    const [bookingsRes, groupSessionsRes, trialsRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('teacher_id, start_time, end_time')
        .in('teacher_id', candidateIds)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .lt('start_time', sessionEnd)
        .gt('end_time', sessionStart),
      supabase
        .from('group_class_sessions')
        .select('teacher_id, start_time, end_time')
        .in('teacher_id', candidateIds)
        .eq('session_date', input.session_date)
        .in('status', ['scheduled', 'ongoing']),
      supabase
        .from('trial_class_bookings')
        .select('selected_teacher_id, selected_time, hours')
        .in('selected_teacher_id', candidateIds)
        .eq('selected_date', input.session_date)
        .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')'),
    ]);

    const conflictDetailsByTeacher: Record<string, string[]> = {};
    const addConflict = (teacherId: string, detail: string) => {
      if (!conflictDetailsByTeacher[teacherId]) conflictDetailsByTeacher[teacherId] = [];
      conflictDetailsByTeacher[teacherId].push(detail);
    };

    // Private bookings
    (bookingsRes.data || []).forEach((b: any) => {
      if (!b.teacher_id) return;
      const start = extractTime(b.start_time);
      const end = extractTime(b.end_time);
      addConflict(b.teacher_id, `Booked ${start}-${end}`);
    });

    // Group sessions (filtered by overlap)
    (groupSessionsRes.data || []).forEach((s: any) => {
      if (!s.teacher_id) return;
      const sStart = extractTime(s.start_time);
      const sEnd = extractTime(s.end_time);
      if (sStart < input.end_time && sEnd > input.start_time) {
        addConflict(s.teacher_id, `Group class ${sStart}-${sEnd}`);
      }
    });

    // Trial bookings
    (trialsRes.data || []).forEach((t: any) => {
      if (!t.selected_teacher_id || !t.selected_time) return;
      const tStart = extractTime(t.selected_time);
      const tHours = t.hours || 2;
      const tEndHour = parseInt(tStart.split(':')[0], 10) + tHours;
      const tEnd = `${String(tEndHour).padStart(2, '0')}:${tStart.split(':')[1] || '00'}`;
      if (tStart < input.end_time && tEnd > input.start_time) {
        addConflict(t.selected_teacher_id, `Trial ${tStart}-${tEnd}`);
      }
    });

    // ==========================================
    // STEP 7: Who's already assigned to THIS session?
    // ==========================================
    const sessionTable =
      input.session_type === 'group_session' ? 'group_class_sessions' :
      input.session_type === 'private_session' ? 'bookings' :
      'trial_class_bookings';

    const { data: sessionRow } = await supabase
      .from(sessionTable as any)
      .select('substitute_teacher_id')
      .eq('id', input.session_id)
      .maybeSingle();

    const currentlyAssignedId = sessionRow ? (sessionRow as any).substitute_teacher_id : null;

    // ==========================================
    // STEP 8: Classify candidates
    // ==========================================
    const candidates: SubstituteCandidate[] = usersData.map((u: any) => {
      const issues: string[] = [];
      let available = true;

      const alreadyAssigned = currentlyAssignedId === u.id;

      // 8a. On leave?
      if (teachersOnLeave.has(u.id)) {
        issues.push(`On leave (${leaveByTeacher[u.id] || 'leave'})`);
        available = false;
      }

      // 8b. Availability window
      const availSlots = availabilityByTeacher[u.id] || [];
      if (availSlots.length === 0) {
        issues.push('No availability for this day');
        available = false;
      } else {
        const withinAnySlot = availSlots.some(
          slot => slot.start <= input.start_time && slot.end >= input.end_time
        );
        if (!withinAnySlot) {
          issues.push(`Not available ${input.start_time}-${input.end_time}`);
          available = false;
        }
      }

      // 8c. Booking conflicts
      const conflicts = conflictDetailsByTeacher[u.id] || [];
      if (conflicts.length > 0) {
        issues.push(...conflicts.slice(0, 2));
        available = false;
      }

      // 8d. Not the original teacher
      if (input.original_teacher_id === u.id) {
        issues.push('Original teacher');
        available = false;
      }

      // Score
      let score = 0;
      if (source === 'module') score += 100;
      if (source === 'course') score += 50;
      if (available) score += 25;
      const profile = profileMap[u.id] || {};
      if (profile.years_experience) score += Math.min(profile.years_experience, 20);

      return {
        teacher_id: u.id,
        full_name: u.full_name,
        email: u.email || null,
        phone: u.phone || null,
        qualification_source: source,
        specialization: profile.specialization || null,
        years_experience: profile.years_experience || null,
        is_available: available,
        is_qualified: true,
        availability_issues: issues,
        already_assigned: alreadyAssigned,
        score,
      };
    });

    // Sort: assigned first, then by score desc, then name asc
    candidates.sort((a, b) => {
      if (a.already_assigned !== b.already_assigned) {
        return a.already_assigned ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.full_name.localeCompare(b.full_name);
    });

    const availCount = candidates.filter(c => c.is_available).length;
    console.log(`✅ Found ${candidates.length} candidates (${availCount} available)`);
    console.table(candidates.map(c => ({
      name: c.full_name,
      available: c.is_available,
      issues: c.availability_issues.join(' | ') || '—',
      source: c.qualification_source,
    })));

    return candidates;
  } catch (err) {
    console.error('❌ Exception in findQualifiedSubstitutes:', err);
    return [];
  }
}

// ==========================================
// ASSIGN / UNASSIGN — ⭐ v3.16 attendance sync
// ==========================================

export async function assignSubstitute(params: {
  assignment_id: string;
  session_type: SessionType;
  session_id: string;
  substitute_teacher_id: string;
  assigned_by?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { assignment_id, session_type, session_id, substitute_teacher_id, assigned_by, notes } = params;

  try {
    console.log('🔄 Assigning substitute:', {
      assignment_id,
      substitute_teacher_id,
      session_type,
      session_id,
    });

    // ── Step 1: fetch the assignment to get original_teacher_id ──
    const { data: assignment, error: fetchErr } = await supabase
      .from('substitute_assignments')
      .select('original_teacher_id')
      .eq('id', assignment_id)
      .single();

    if (fetchErr || !assignment) {
      console.error('Error fetching substitute assignment:', fetchErr);
      return { success: false, error: fetchErr?.message || 'Assignment not found' };
    }

    const originalTeacherId = assignment.original_teacher_id;
    const now = new Date().toISOString();

    // ── Step 2: update substitute_assignments ──
    const { error: assignError } = await supabase
      .from('substitute_assignments')
      .update({
        substitute_teacher_id,
        status: 'assigned',
        assigned_at: now,
        assigned_by: assigned_by || null,
        notes: notes || null,
      })
      .eq('id', assignment_id)
      .select()
      .single();

    if (assignError) {
      console.error('Error updating substitute_assignments:', assignError);
      return { success: false, error: assignError.message };
    }

    // ── Step 3: update the session row ──
    const table =
      session_type === 'group_session' ? 'group_class_sessions' :
      session_type === 'private_session' ? 'bookings' :
      'trial_class_bookings';

    const { error: sessionError } = await supabase
      .from(table)
      .update({
        substitute_teacher_id,
        needs_attention: false,
        attention_reason: null,
      })
      .eq('id', session_id);

    if (sessionError) {
      console.error('Error updating session row:', sessionError);
      return {
        success: true,
        error: `Assignment saved, but session row update failed: ${sessionError.message}`,
      };
    }

    // ── Step 4 (⭐ v3.16): swap the attendance row to the substitute ──
    const syncResult = await syncTeacherAttendanceToSubstitute({
      session_type,
      session_id,
      original_teacher_id: originalTeacherId,
      substitute_teacher_id,
      actor_id: assigned_by || null,
    });

    if (!syncResult.success) {
      console.warn('⚠️ Substitute assigned but attendance sync failed:', syncResult.error);
      // Do NOT fail the whole operation — the assignment is more important than the sync.
      return {
        success: true,
        error: `Assignment saved, but attendance sync failed: ${syncResult.error}`,
      };
    }

    console.log(`✅ Substitute assigned successfully (attendance ${syncResult.action})`);
    return { success: true };
  } catch (err: any) {
    console.error('❌ Exception in assignSubstitute:', err);
    return { success: false, error: err.message };
  }
}

export async function unassignSubstitute(params: {
  assignment_id: string;
  session_type: SessionType;
  session_id: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { assignment_id, session_type, session_id, reason } = params;

  try {
    console.log('🔄 Un-assigning substitute:', { assignment_id, reason });

    // ── Step 1: fetch original_teacher_id ──
    const { data: assignment, error: fetchErr } = await supabase
      .from('substitute_assignments')
      .select('original_teacher_id')
      .eq('id', assignment_id)
      .single();

    if (fetchErr || !assignment) {
      return { success: false, error: fetchErr?.message || 'Assignment not found' };
    }

    const originalTeacherId = assignment.original_teacher_id;

    // ── Step 2: update substitute_assignments ──
    const { error: assignError } = await supabase
      .from('substitute_assignments')
      .update({
        substitute_teacher_id: null,
        status: 'pending',
        assigned_at: null,
        assigned_by: null,
        notes: reason ? `Unassigned: ${reason}` : null,
      })
      .eq('id', assignment_id);

    if (assignError) {
      console.error('Error unassigning:', assignError);
      return { success: false, error: assignError.message };
    }

    // ── Step 3: reset the session row ──
    const table =
      session_type === 'group_session' ? 'group_class_sessions' :
      session_type === 'private_session' ? 'bookings' :
      'trial_class_bookings';

    const { error: sessionError } = await supabase
      .from(table)
      .update({
        substitute_teacher_id: null,
        needs_attention: true,
        attention_reason: 'substitute_unassigned',
      })
      .eq('id', session_id);

    if (sessionError) {
      console.warn('Could not reset session row:', sessionError);
    }

    // ── Step 4 (⭐ v3.16): restore the attendance row to the original teacher ──
    const syncResult = await syncTeacherAttendanceToOriginal({
      session_type,
      session_id,
      original_teacher_id: originalTeacherId,
    });

    if (!syncResult.success) {
      console.warn('⚠️ Unassigned but attendance restore failed:', syncResult.error);
      return {
        success: true,
        error: `Unassigned, but attendance restore failed: ${syncResult.error}`,
      };
    }

    console.log(`✅ Substitute unassigned (attendance ${syncResult.action})`);
    return { success: true };
  } catch (err: any) {
    console.error('❌ Exception in unassignSubstitute:', err);
    return { success: false, error: err.message };
  }
}

// ==========================================
// v3.16 — ATTENDANCE FOLLOWS SUBSTITUTE
// ==========================================

/**
 * When a substitute is assigned, the attendance row for the session must
 * follow the sub — otherwise the Teacher Hours Report pays the wrong person.
 *
 * - Swaps session_attendance.attendee_id from original teacher → sub
 * - Stores original in original_attendee_id (for audit)
 * - Clears any existing payroll override (it belonged to the original)
 * - If no attendance row exists yet, creates one for the sub as 'expected'
 *
 * Safe to call even if nothing needs to change.
 */
export async function syncTeacherAttendanceToSubstitute(params: {
  session_type: SessionType;
  session_id: string;
  original_teacher_id: string | null;
  substitute_teacher_id: string;
  actor_id?: string | null;
}): Promise<{ success: boolean; action: 'updated' | 'created' | 'noop'; error?: string }> {
  const { session_type, session_id, original_teacher_id, substitute_teacher_id, actor_id } = params;

  // Map substituteService session types → attendance session types
  const attendanceSessionType: 'booking' | 'group_session' | 'trial_booking' =
    session_type === 'group_session' ? 'group_session' :
    session_type === 'private_session' ? 'booking' :
    'trial_booking';

  try {
    // Find the existing teacher row
    const { data: existing, error: fetchErr } = await supabase
      .from('session_attendance')
      .select('id, attendee_id, original_attendee_id, is_rendered, override_reason')
      .eq('session_type', attendanceSessionType)
      .eq('session_id', session_id)
      .eq('attendee_type', 'teacher')
      .maybeSingle();

    if (fetchErr) {
      console.error('[syncTeacherAttendanceToSubstitute] fetch failed:', fetchErr);
      return { success: false, action: 'noop', error: fetchErr.message };
    }

    // No row yet → create one for the sub as 'expected'
    if (!existing) {
      const { error: insertErr } = await supabase
        .from('session_attendance')
        .insert({
          session_type: attendanceSessionType,
          session_id,
          attendee_type: 'teacher',
          attendee_id: substitute_teacher_id,
          original_attendee_id: original_teacher_id,
          status: 'expected',
          substituted_at: new Date().toISOString(),
          substituted_by: actor_id || null,
        });

      if (insertErr) {
        console.error('[syncTeacherAttendanceToSubstitute] insert failed:', insertErr);
        return { success: false, action: 'noop', error: insertErr.message };
      }
      return { success: true, action: 'created' };
    }

    // Row already points at the sub → no-op (but keep audit cols fresh)
    if (existing.attendee_id === substitute_teacher_id) {
      return { success: true, action: 'noop' };
    }

    // Swap: original → sub
    const { error: updateErr } = await supabase
      .from('session_attendance')
      .update({
        attendee_id: substitute_teacher_id,
        original_attendee_id: existing.original_attendee_id || existing.attendee_id,
        substituted_at: new Date().toISOString(),
        substituted_by: actor_id || null,
        // Clear any payroll override — it was for the original teacher
        is_rendered: null,
        override_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[syncTeacherAttendanceToSubstitute] update failed:', updateErr);
      return { success: false, action: 'noop', error: updateErr.message };
    }

    console.log(`✅ Attendance ${existing.id} swapped to substitute ${substitute_teacher_id}`);
    return { success: true, action: 'updated' };
  } catch (err: any) {
    console.error('[syncTeacherAttendanceToSubstitute] exception:', err);
    return { success: false, action: 'noop', error: err.message };
  }
}

/**
 * Reverse of the above: when a substitute is unassigned, restore the
 * attendance row to the original teacher.
 */
export async function syncTeacherAttendanceToOriginal(params: {
  session_type: SessionType;
  session_id: string;
  original_teacher_id: string | null;
}): Promise<{ success: boolean; action: 'updated' | 'noop'; error?: string }> {
  const { session_type, session_id, original_teacher_id } = params;

  if (!original_teacher_id) {
    return { success: true, action: 'noop' };
  }

  const attendanceSessionType: 'booking' | 'group_session' | 'trial_booking' =
    session_type === 'group_session' ? 'group_session' :
    session_type === 'private_session' ? 'booking' :
    'trial_booking';

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('session_attendance')
      .select('id, attendee_id, original_attendee_id')
      .eq('session_type', attendanceSessionType)
      .eq('session_id', session_id)
      .eq('attendee_type', 'teacher')
      .maybeSingle();

    if (fetchErr) {
      return { success: false, action: 'noop', error: fetchErr.message };
    }
    if (!existing) {
      return { success: true, action: 'noop' };
    }
    if (existing.attendee_id === original_teacher_id) {
      return { success: true, action: 'noop' };
    }

    const { error: updateErr } = await supabase
      .from('session_attendance')
      .update({
        attendee_id: original_teacher_id,
        original_attendee_id: null,
        substituted_at: null,
        substituted_by: null,
        is_rendered: null,
        override_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateErr) {
      return { success: false, action: 'noop', error: updateErr.message };
    }

    console.log(`✅ Attendance ${existing.id} restored to original teacher ${original_teacher_id}`);
    return { success: true, action: 'updated' };
  } catch (err: any) {
    console.error('[syncTeacherAttendanceToOriginal] exception:', err);
    return { success: false, action: 'noop', error: err.message };
  }
}