// lib/roomConflictChecker.ts
// ⭐ v3.7: Enriched conflict details for Room Conflict Resolution Modal
import { supabase } from './supabaseClient';

export type ConflictType =
  | 'private_booking'
  | 'group_session'
  | 'room_booking'
  | 'teacher_leave'
  | 'trial_booking';

export interface Conflict {
  // ⭐ v3.7: unique per conflict, for React keys
  conflictId: string;

  type: ConflictType;
  date: string;              // "YYYY-MM-DD"
  start_time: string;        // ⭐ actual conflicting slot start "HH:mm"
  end_time: string;          // ⭐ actual conflicting slot end "HH:mm"
  room_id: string;
  teacher_id?: string;
  details: any;

  // ⭐ v3.7: enriched display fields for the modal
  title?: string;            // Course name / class name / booking title
  class_code?: string;       // PL-XXX-XXX / TPL-XXX / TGL-XXX / ROOM-XXX
  teacher_name?: string;
  student_count?: number;

  // ⭐ v3.7: original requested slot (for "your request" context)
  requested_start_time?: string;
  requested_end_time?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: Conflict[];
  teacherConflicts: Conflict[];
  roomConflicts: Conflict[];
}

export interface RoomConflictCheckParams {
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeBookingId?: string;
  excludeGroupSessionId?: string;
  excludeRoomBookingId?: string;
  excludeTrialId?: string;
}

export interface TeacherConflictCheckParams {
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeBookingId?: string;
  excludeGroupSessionId?: string;
  excludeTrialId?: string;
}

// ==========================================
// HELPERS
// ==========================================

/** Convert "HH:mm" to minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to "HH:mm" */
function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Compute overlap of two time ranges in minutes. Returns null if no overlap. */
function computeOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): { start: number; end: number } | null {
  const s = Math.max(startA, startB);
  const e = Math.min(endA, endB);
  if (s < e) return { start: s, end: e };
  return null;
}

/** Fetch course names for a list of course_ids */
async function fetchCourseNames(courseIds: string[]): Promise<Record<string, string>> {
  if (courseIds.length === 0) return {};
  const { data } = await supabase
    .from('courses')
    .select('id, name')
    .in('id', [...new Set(courseIds)]);
  const map: Record<string, string> = {};
  (data || []).forEach((c: any) => { map[c.id] = c.name; });
  return map;
}

/** Fetch teacher names for a list of teacher_ids */
async function fetchTeacherNames(teacherIds: string[]): Promise<Record<string, string>> {
  if (teacherIds.length === 0) return {};
  const { data } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', [...new Set(teacherIds)]);
  const map: Record<string, string> = {};
  (data || []).forEach((t: any) => { map[t.id] = t.full_name; });
  return map;
}

/** Fetch class records for a list of class_ids */
async function fetchClassRecords(classIds: string[]): Promise<Record<string, any>> {
  if (classIds.length === 0) return {};
  const { data } = await supabase
    .from('classes')
    .select('id, class_code, course_id, module_id')
    .in('id', [...new Set(classIds)]);
  const map: Record<string, any> = {};
  (data || []).forEach((c: any) => { map[c.id] = c; });
  return map;
}

/** Fetch group class records for a list of group_class_ids */
async function fetchGroupClassRecords(groupClassIds: string[]): Promise<Record<string, any>> {
  if (groupClassIds.length === 0) return {};
  const { data } = await supabase
    .from('scheduled_group_classes')
    .select('id, class_name, course_id, current_students')
    .in('id', [...new Set(groupClassIds)]);
  const map: Record<string, any> = {};
  (data || []).forEach((g: any) => { map[g.id] = g; });
  return map;
}

// ==========================================
// ROOM CONFLICTS
// ==========================================

/**
 * Check room conflicts across ALL booking types.
 * Returns conflicts with enriched details (title, code, teacher, student count).
 * The `start_time` / `end_time` fields on each conflict reflect the OVERLAPPING
 * portion (not the full booking slot), so the UI can highlight the exact clash.
 */
export async function checkRoomConflicts(
  params: RoomConflictCheckParams
): Promise<Conflict[]> {
  const {
    roomId,
    date,
    startTime,
    endTime,
    excludeBookingId,
    excludeGroupSessionId,
    excludeRoomBookingId,
    excludeTrialId,
  } = params;

  const conflicts: Conflict[] = [];
  if (!roomId || !date || !startTime || !endTime) return conflicts;

  const reqStartMin = toMinutes(startTime);
  const reqEndMin = toMinutes(endTime);

  // ==========================================
  // 1. Private class sessions (bookings)
  // ==========================================
  let bookingQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, teacher_id, class_id, student_id, room_id, is_trial')
    .eq('room_id', roomId)
    .in('status', ['confirmed', 'in_progress', 'pending'])
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`);

  if (excludeBookingId) bookingQuery = bookingQuery.neq('id', excludeBookingId);

  const { data: privateBookings } = await bookingQuery;

  // Batch-fetch lookups for private bookings
  const bookingClassIds = [...new Set((privateBookings || []).map((b: any) => b.class_id).filter(Boolean))];
  const bookingTeacherIds = [...new Set((privateBookings || []).map((b: any) => b.teacher_id).filter(Boolean))];

  const [classRecords, bookingTeacherMap] = await Promise.all([
    fetchClassRecords(bookingClassIds),
    fetchTeacherNames(bookingTeacherIds),
  ]);

  const bookingCourseIds = [...new Set(Object.values(classRecords).map((c: any) => c.course_id).filter(Boolean))];
  const bookingCourseMap = await fetchCourseNames(bookingCourseIds);

  for (const b of privateBookings || []) {
    if (b.is_trial === true) continue;   // trials handled separately

    const bStartMin = toMinutes(String(b.start_time).slice(11, 16));
    const bEndMin = toMinutes(String(b.end_time).slice(11, 16));
    const overlap = computeOverlap(reqStartMin, reqEndMin, bStartMin, bEndMin);
    if (!overlap) continue;

    const cls = b.class_id ? classRecords[b.class_id] : null;

    conflicts.push({
      conflictId: `booking-${b.id}`,
      type: 'private_booking',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: roomId,
      teacher_id: b.teacher_id,
      details: b,
      title: cls?.course_id ? (bookingCourseMap[cls.course_id] || 'Private Class') : 'Private Class',
      class_code: cls?.class_code,
      teacher_name: b.teacher_id ? bookingTeacherMap[b.teacher_id] : undefined,
      student_count: b.student_id ? 1 : 0,
    });
  }

  // ==========================================
  // 2. Group class sessions
  // ==========================================
  let groupQuery = supabase
    .from('group_class_sessions')
    .select('id, session_date, start_time, end_time, teacher_id, group_class_id, room_id')
    .eq('room_id', roomId)
    .eq('session_date', date)
    .in('status', ['scheduled', 'ongoing']);

  if (excludeGroupSessionId) groupQuery = groupQuery.neq('id', excludeGroupSessionId);

  const { data: groupSessions } = await groupQuery;

  const groupIds = [...new Set((groupSessions || []).map((g: any) => g.group_class_id).filter(Boolean))];
  const groupTeacherIds = [...new Set((groupSessions || []).map((g: any) => g.teacher_id).filter(Boolean))];

  const [groupRecords, groupTeacherMap] = await Promise.all([
    fetchGroupClassRecords(groupIds),
    fetchTeacherNames(groupTeacherIds),
  ]);

  for (const gs of groupSessions || []) {
    const gsStartMin = toMinutes(String(gs.start_time).slice(0, 5));
    const gsEndMin = toMinutes(String(gs.end_time).slice(0, 5));
    const overlap = computeOverlap(reqStartMin, reqEndMin, gsStartMin, gsEndMin);
    if (!overlap) continue;

    const group = groupRecords[gs.group_class_id];

    conflicts.push({
      conflictId: `group-${gs.id}`,
      type: 'group_session',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: roomId,
      teacher_id: gs.teacher_id,
      details: gs,
      title: group?.class_name || 'Group Class',
      class_code: group?.id ? `GL-${group.id.slice(0, 8)}` : undefined,
      teacher_name: gs.teacher_id ? groupTeacherMap[gs.teacher_id] : undefined,
      student_count: group?.current_students || 0,
    });
  }

  // ==========================================
  // 3. Trial class bookings
  // ==========================================
  let trialQuery = supabase
    .from('trial_class_bookings')
    .select('id, selected_date, selected_time, hours, room_id, selected_teacher_id, course_id, session_type, student_id')
    .eq('room_id', roomId)
    .eq('selected_date', date)
    .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

  if (excludeTrialId) trialQuery = trialQuery.neq('id', excludeTrialId);

  const { data: trialBookings } = await trialQuery;

  const trialTeacherIds = [...new Set((trialBookings || []).map((t: any) => t.selected_teacher_id).filter(Boolean))];
  const trialCourseIds = [...new Set((trialBookings || []).map((t: any) => t.course_id).filter(Boolean))];

  const [trialTeacherMap, trialCourseMap] = await Promise.all([
    fetchTeacherNames(trialTeacherIds),
    fetchCourseNames(trialCourseIds),
  ]);

  for (const t of trialBookings || []) {
    if (!t.selected_time) continue;

    const tStartMin = toMinutes(String(t.selected_time).slice(0, 5));
    const tEndMin = tStartMin + (t.hours || 2) * 60;
    const overlap = computeOverlap(reqStartMin, reqEndMin, tStartMin, tEndMin);
    if (!overlap) continue;

    const isGroup = t.session_type === 'group';

    conflicts.push({
      conflictId: `trial-${t.id}`,
      type: 'trial_booking',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: roomId,
      teacher_id: t.selected_teacher_id,
      details: t,
      title: t.course_id ? (trialCourseMap[t.course_id] || (isGroup ? 'Trial Group' : 'Trial Class')) : (isGroup ? 'Trial Group' : 'Trial Class'),
      class_code: t.id ? `${isGroup ? 'TGL' : 'TPL'}-${t.id.slice(0, 8)}` : undefined,
      teacher_name: t.selected_teacher_id ? trialTeacherMap[t.selected_teacher_id] : undefined,
      student_count: t.student_id ? 1 : 0,
    });
  }

  // ==========================================
  // 4. Room bookings
  // ==========================================
  let roomQuery = supabase
    .from('room_bookings')
    .select('id, title, start_time, end_time, teacher_id, student_count, requestor_name')
    .eq('room_id', roomId)
    .in('status', ['confirmed', 'pending'])
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`);

  if (excludeRoomBookingId) roomQuery = roomQuery.neq('id', excludeRoomBookingId);

  const { data: roomBookings } = await roomQuery;

  const rbTeacherIds = [...new Set((roomBookings || []).map((r: any) => r.teacher_id).filter(Boolean))];
  const rbTeacherMap = await fetchTeacherNames(rbTeacherIds);

  for (const rb of roomBookings || []) {
    const rbStartMin = toMinutes(String(rb.start_time).slice(11, 16));
    const rbEndMin = toMinutes(String(rb.end_time).slice(11, 16));
    const overlap = computeOverlap(reqStartMin, reqEndMin, rbStartMin, rbEndMin);
    if (!overlap) continue;

    conflicts.push({
      conflictId: `room-booking-${rb.id}`,
      type: 'room_booking',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: roomId,
      teacher_id: rb.teacher_id,
      details: rb,
      title: rb.title || 'Room Booking',
      class_code: rb.id ? `ROOM-${rb.id.slice(0, 8)}` : undefined,
      teacher_name: rb.teacher_id ? rbTeacherMap[rb.teacher_id] : undefined,
      student_count: rb.student_count || 0,
    });
  }

  return conflicts;
}

// ==========================================
// TEACHER CONFLICTS
// ==========================================

export async function checkTeacherConflicts(
  params: TeacherConflictCheckParams
): Promise<Conflict[]> {
  const {
    teacherId,
    date,
    startTime,
    endTime,
    excludeBookingId,
    excludeGroupSessionId,
    excludeTrialId,
  } = params;

  const conflicts: Conflict[] = [];
  if (!teacherId || !date || !startTime || !endTime) return conflicts;

  const reqStartMin = toMinutes(startTime);
  const reqEndMin = toMinutes(endTime);

  // 1. Teacher's private bookings
  let bookingQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, teacher_id, class_id, room_id, student_id, is_trial')
    .eq('teacher_id', teacherId)
    .in('status', ['confirmed', 'in_progress', 'pending'])
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`);

  if (excludeBookingId) bookingQuery = bookingQuery.neq('id', excludeBookingId);

  const { data: privateBookings } = await bookingQuery;

  const bookingClassIds = [...new Set((privateBookings || []).map((b: any) => b.class_id).filter(Boolean))];
  const classRecords = await fetchClassRecords(bookingClassIds);
  const bookingCourseIds = [...new Set(Object.values(classRecords).map((c: any) => c.course_id).filter(Boolean))];
  const courseMap = await fetchCourseNames(bookingCourseIds);

  for (const b of privateBookings || []) {
    if (b.is_trial === true) continue;

    const bStartMin = toMinutes(String(b.start_time).slice(11, 16));
    const bEndMin = toMinutes(String(b.end_time).slice(11, 16));
    const overlap = computeOverlap(reqStartMin, reqEndMin, bStartMin, bEndMin);
    if (!overlap) continue;

    const cls = b.class_id ? classRecords[b.class_id] : null;

    conflicts.push({
      conflictId: `teacher-booking-${b.id}`,
      type: 'private_booking',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: b.room_id || '',
      teacher_id: teacherId,
      details: b,
      title: cls?.course_id ? (courseMap[cls.course_id] || 'Private Class') : 'Private Class',
      class_code: cls?.class_code,
      student_count: b.student_id ? 1 : 0,
    });
  }

  // 2. Teacher's group class sessions
  let groupQuery = supabase
    .from('group_class_sessions')
    .select('id, session_date, start_time, end_time, teacher_id, group_class_id, room_id')
    .eq('teacher_id', teacherId)
    .eq('session_date', date)
    .in('status', ['scheduled', 'ongoing']);

  if (excludeGroupSessionId) groupQuery = groupQuery.neq('id', excludeGroupSessionId);

  const { data: groupSessions } = await groupQuery;

  const groupIds = [...new Set((groupSessions || []).map((g: any) => g.group_class_id).filter(Boolean))];
  const groupRecords = await fetchGroupClassRecords(groupIds);

  for (const gs of groupSessions || []) {
    const gsStartMin = toMinutes(String(gs.start_time).slice(0, 5));
    const gsEndMin = toMinutes(String(gs.end_time).slice(0, 5));
    const overlap = computeOverlap(reqStartMin, reqEndMin, gsStartMin, gsEndMin);
    if (!overlap) continue;

    const group = groupRecords[gs.group_class_id];

    conflicts.push({
      conflictId: `teacher-group-${gs.id}`,
      type: 'group_session',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: gs.room_id || '',
      teacher_id: teacherId,
      details: gs,
      title: group?.class_name || 'Group Class',
      class_code: group?.id ? `GL-${group.id.slice(0, 8)}` : undefined,
      student_count: group?.current_students || 0,
    });
  }

  // 3. Teacher's trial class bookings
  let trialQuery = supabase
    .from('trial_class_bookings')
    .select('id, selected_date, selected_time, hours, room_id, selected_teacher_id, course_id, session_type, student_id')
    .eq('selected_teacher_id', teacherId)
    .eq('selected_date', date)
    .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

  if (excludeTrialId) trialQuery = trialQuery.neq('id', excludeTrialId);

  const { data: trialBookings } = await trialQuery;

  const trialCourseIds = [...new Set((trialBookings || []).map((t: any) => t.course_id).filter(Boolean))];
  const trialCourseMap = await fetchCourseNames(trialCourseIds);

  for (const t of trialBookings || []) {
    if (!t.selected_time) continue;

    const tStartMin = toMinutes(String(t.selected_time).slice(0, 5));
    const tEndMin = tStartMin + (t.hours || 2) * 60;
    const overlap = computeOverlap(reqStartMin, reqEndMin, tStartMin, tEndMin);
    if (!overlap) continue;

    const isGroup = t.session_type === 'group';

    conflicts.push({
      conflictId: `teacher-trial-${t.id}`,
      type: 'trial_booking',
      date,
      start_time: fromMinutes(overlap.start),
      end_time: fromMinutes(overlap.end),
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: t.room_id || '',
      teacher_id: teacherId,
      details: t,
      title: t.course_id ? (trialCourseMap[t.course_id] || (isGroup ? 'Trial Group' : 'Trial Class')) : (isGroup ? 'Trial Group' : 'Trial Class'),
      class_code: t.id ? `${isGroup ? 'TGL' : 'TPL'}-${t.id.slice(0, 8)}` : undefined,
      student_count: t.student_id ? 1 : 0,
    });
  }

  // 4. Teacher leaves
  const { data: leaves } = await supabase
    .from('staff_leaves')
    .select('*')
    .eq('staff_id', teacherId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date);

  if (leaves && leaves.length > 0) {
    const leave = leaves[0];
    conflicts.push({
      conflictId: `teacher-leave-${leave.id}`,
      type: 'teacher_leave',
      date,
      start_time: startTime,
      end_time: endTime,
      requested_start_time: startTime,
      requested_end_time: endTime,
      room_id: '',
      teacher_id: teacherId,
      details: leave,
      title: `${leave.leave_type || 'Leave'} (approved)`,
      class_code: undefined,
    });
  }

  return conflicts;
}

// ==========================================
// COMBINED HELPERS (unchanged API)
// ==========================================

export async function checkAllConflicts(
  roomId: string,
  teacherId: string | null,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string,
  excludeGroupSessionId?: string,
  excludeRoomBookingId?: string,
  excludeTrialId?: string
): Promise<ConflictCheckResult> {
  const roomConflicts: Conflict[] = [];
  const teacherConflicts: Conflict[] = [];

  if (roomId) {
    const roomResults = await checkRoomConflicts({
      roomId, date, startTime, endTime,
      excludeBookingId, excludeGroupSessionId, excludeRoomBookingId, excludeTrialId,
    });
    roomConflicts.push(...roomResults);
  }

  if (teacherId) {
    const teacherResults = await checkTeacherConflicts({
      teacherId, date, startTime, endTime,
      excludeBookingId, excludeGroupSessionId, excludeTrialId,
    });
    teacherConflicts.push(...teacherResults);
  }

  const allConflicts = [...roomConflicts, ...teacherConflicts];
  return {
    hasConflict: allConflicts.length > 0,
    conflicts: allConflicts,
    roomConflicts,
    teacherConflicts,
  };
}

export async function checkMultipleConflicts(
  roomId: string,
  teacherId: string | null,
  sessions: Array<{ date: string; start_time: string; end_time: string }>,
  excludeBookingId?: string,
  excludeGroupSessionId?: string,
  excludeRoomBookingId?: string,
  excludeTrialId?: string
): Promise<ConflictCheckResult> {
  const allRoomConflicts: Conflict[] = [];
  const allTeacherConflicts: Conflict[] = [];

  for (const session of sessions) {
    const result = await checkAllConflicts(
      roomId, teacherId, session.date, session.start_time, session.end_time,
      excludeBookingId, excludeGroupSessionId, excludeRoomBookingId, excludeTrialId
    );
    allRoomConflicts.push(...result.roomConflicts);
    allTeacherConflicts.push(...result.teacherConflicts);
  }

  const allConflicts = [...allRoomConflicts, ...allTeacherConflicts];
  return {
    hasConflict: allConflicts.length > 0,
    conflicts: allConflicts,
    roomConflicts: allRoomConflicts,
    teacherConflicts: allTeacherConflicts,
  };
}

/**
 * Legacy text formatter — used by older callers. Now includes title when available.
 */
export function formatConflicts(conflicts: Conflict[]): string {
  if (conflicts.length === 0) return 'No conflicts found.';

  const grouped = conflicts.reduce((acc, c) => {
    const key = c.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {} as Record<string, Conflict[]>);

  let message = '';
  for (const [date, dateConflicts] of Object.entries(grouped)) {
    message += `\n📅 ${date}:\n`;
    for (const c of dateConflicts) {
      const timeStr = `${c.start_time} - ${c.end_time}`;
      const label = c.title || c.type.replace('_', ' ');
      const code = c.class_code ? ` (${c.class_code})` : '';
      const teacher = c.teacher_name ? ` · 👨‍🏫 ${c.teacher_name}` : '';
      switch (c.type) {
        case 'private_booking':
          message += `   ❌ ${label}${code} at ${timeStr}${teacher}\n`;
          break;
        case 'group_session':
          message += `   ❌ ${label}${code} at ${timeStr}${teacher}\n`;
          break;
        case 'trial_booking':
          message += `   ❌ ${label}${code} at ${timeStr}${teacher}\n`;
          break;
        case 'room_booking':
          message += `   ❌ ${label}${code} at ${timeStr}\n`;
          break;
        case 'teacher_leave':
          message += `   ❌ ${label} — teacher is on leave\n`;
          break;
        default:
          message += `   ❌ Conflict at ${timeStr}\n`;
      }
    }
  }
  return message;
}