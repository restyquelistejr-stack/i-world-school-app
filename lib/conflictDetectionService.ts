// lib/conflictDetectionService.ts
// ⭐ PHASE 1: Source-tagged conflicts — teacher (soft) vs room (hard/flag)
// ⭐ v3.2 FIX: roomConflictMode ('strict' | 'full') for group vs private handling
import { supabase } from './supabaseClient';

export type ConflictType =
  | 'teacher_leave'
  | 'teacher_conflict'
  | 'room_conflict'
  | 'private_booking'
  | 'group_session'
  | 'trial_booking'
  | 'room_booking';

export interface RawConflict {
  session: {
    session_number: number;
    session_date: string;
    start_time: string;
    end_time: string;
    room_id?: string | null;
    room_name?: string | null;
  };
  teacherId?: string;
  teacherName?: string;
  conflictType: ConflictType;
  conflictData: any;
  date: string;
  time: string;
  description: string;
  /** ⭐ PHASE 1: which detection section produced this */
  source: 'teacher' | 'room';
}

export interface ConflictDetectionInput {
  sessions: Array<{
    session_number: number;
    session_date: string;
    start_time: string;
    end_time: string;
    room_id?: string | null;
    room_name?: string | null;
  }>;
  teacherIds: string[];
  roomId?: string | null;
  teacherNamesById?: Record<string, string>;
  excludeSessionIds?: string[];
  /**
   * ⭐ v3.2 FIX: How thorough should room conflict detection be?
   *   'strict' (default) → only check room_bookings (maintenance/events)
   *                        Use for PRIVATE CLASSES (auto-resolves other rooms)
   *   'full'             → check ALL sources (bookings, group_class_sessions,
   *                        trial_class_bookings, room_bookings)
   *                        Use for GROUP CLASSES (room is fixed → flag)
   */
  roomConflictMode?: 'strict' | 'full';
}

/**
 * Detect ALL conflicts across a set of sessions.
 *
 * Teacher conflicts (source: 'teacher') — always detected:
 *   - teacher leave
 *   - teacher already booked (private/group/trial)
 *
 * Room conflicts (source: 'room') — depends on roomConflictMode:
 *   'strict' → only room_bookings (maintenance/events)
 *   'full'   → room_bookings + teaching sessions (bookings, group, trial)
 *
 * Use 'full' for group classes (fixed room → any occupancy is a flag)
 * Use 'strict' for private classes (system auto-resolves room)
 */
export async function detectAllConflicts(
  input: ConflictDetectionInput
): Promise<RawConflict[]> {
  const {
    sessions,
    teacherIds,
    roomId,
    teacherNamesById = {},
    roomConflictMode = 'strict',
  } = input;
  const conflicts: RawConflict[] = [];

  if (sessions.length === 0) return conflicts;

  const dates = sessions.map(s => s.session_date);
  const startDate = dates.reduce((a, b) => (a < b ? a : b));
  const endDate = dates.reduce((a, b) => (a > b ? a : b));

  // ==========================================
  // 1. TEACHER CONFLICTS (source: 'teacher')
  // ==========================================
  if (teacherIds.length > 0) {
    const [privateBookingsRes, groupSessionsRes, trialBookingsRes, leavesRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .in('teacher_id', teacherIds)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`),
      supabase
        .from('group_class_sessions')
        .select('*')
        .in('teacher_id', teacherIds)
        .gte('session_date', startDate)
        .lte('session_date', endDate)
        .in('status', ['scheduled', 'ongoing']),
      supabase
        .from('trial_class_bookings')
        .select('*')
        .in('selected_teacher_id', teacherIds)
        .gte('selected_date', startDate)
        .lte('selected_date', endDate)
        .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')'),
      supabase
        .from('staff_leaves')
        .select('*')
        .in('staff_id', teacherIds)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate),
    ]);

    for (const session of sessions) {
      const sessionStart = new Date(`${session.session_date}T${session.start_time}:00`);
      const sessionEnd = new Date(`${session.session_date}T${session.end_time}:00`);

      for (const teacherId of teacherIds) {
        const teacherName = teacherNamesById[teacherId] || 'Teacher';

        // 1a. Private booking conflict
        for (const booking of privateBookingsRes.data || []) {
          if (booking.teacher_id !== teacherId) continue;
          const bStart = new Date(booking.start_time);
          const bEnd = new Date(booking.end_time);
          if (sessionStart < bEnd && sessionEnd > bStart) {
            conflicts.push({
              session,
              teacherId,
              teacherName,
              conflictType: 'private_booking',
              conflictData: booking,
              date: session.session_date,
              time: `${session.start_time}-${session.end_time}`,
              description: `Teacher has a private class ${booking.start_time?.slice(11, 16)}-${booking.end_time?.slice(11, 16)}`,
              source: 'teacher',
            });
          }
        }

        // 1b. Group session conflict
        for (const gs of groupSessionsRes.data || []) {
          if (gs.teacher_id !== teacherId) continue;
          if (gs.session_date !== session.session_date) continue;
          const gsStart = new Date(`${gs.session_date}T${gs.start_time}:00`);
          const gsEnd = new Date(`${gs.session_date}T${gs.end_time}:00`);
          if (sessionStart < gsEnd && sessionEnd > gsStart) {
            conflicts.push({
              session,
              teacherId,
              teacherName,
              conflictType: 'group_session',
              conflictData: gs,
              date: session.session_date,
              time: `${session.start_time}-${session.end_time}`,
              description: `Teacher has another group class at the same time`,
              source: 'teacher',
            });
          }
        }

        // 1c. Trial booking conflict
        for (const trial of trialBookingsRes.data || []) {
          if (trial.selected_teacher_id !== teacherId) continue;
          if (trial.selected_date !== session.session_date) continue;
          if (!trial.selected_time) continue;

          const tStart = new Date(`${trial.selected_date}T${trial.selected_time}:00`);
          const tEnd = new Date(tStart);
          tEnd.setHours(tStart.getHours() + (trial.hours || 2));

          if (sessionStart < tEnd && sessionEnd > tStart) {
            conflicts.push({
              session,
              teacherId,
              teacherName,
              conflictType: 'trial_booking',
              conflictData: trial,
              date: session.session_date,
              time: `${session.start_time}-${session.end_time}`,
              description: `Teacher has a trial class at the same time`,
              source: 'teacher',
            });
          }
        }

        // 1d. Teacher leave
        for (const leave of leavesRes.data || []) {
          if (leave.staff_id !== teacherId) continue;
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);
          const sessionDate = new Date(session.session_date);
          if (sessionDate >= leaveStart && sessionDate <= leaveEnd) {
            conflicts.push({
              session,
              teacherId,
              teacherName,
              conflictType: 'teacher_leave',
              conflictData: leave,
              date: session.session_date,
              time: `${session.start_time}-${session.end_time}`,
              description: `Teacher is on ${leave.leave_type || 'leave'}`,
              source: 'teacher',
            });
          }
        }
      }
    }
  }

  // ==========================================
  // 2. ROOM CONFLICTS (source: 'room')
  // ==========================================
  // 'strict' mode: only room_bookings (maintenance / external events).
  //                Used by PrivateForm (auto-resolves to other rooms).
  // 'full' mode:   all sources — private bookings, group sessions,
  //                trial bookings, AND room_bookings.
  //                Used by Group Class creation (fixed room → flag).
  if (roomId) {
    // Always fetch room_bookings
    const roomBookingsPromise = supabase
      .from('room_bookings')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['confirmed', 'pending'])
      .gte('start_time', `${startDate}T00:00:00`)
      .lte('start_time', `${endDate}T23:59:59`);

    // In 'full' mode, also fetch teaching-session conflicts
    const fullModePromises = roomConflictMode === 'full'
      ? [
          supabase
            .from('bookings')
            .select('*')
            .eq('room_id', roomId)
            .in('status', ['confirmed', 'in_progress', 'pending'])
            .gte('start_time', `${startDate}T00:00:00`)
            .lte('start_time', `${endDate}T23:59:59`),
          supabase
            .from('group_class_sessions')
            .select('*')
            .eq('room_id', roomId)
            .gte('session_date', startDate)
            .lte('session_date', endDate)
            .in('status', ['scheduled', 'ongoing']),
          supabase
            .from('trial_class_bookings')
            .select('*')
            .eq('room_id', roomId)
            .gte('selected_date', startDate)
            .lte('selected_date', endDate)
            .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')'),
        ]
      : [Promise.resolve({ data: [] as any[] }), Promise.resolve({ data: [] as any[] }), Promise.resolve({ data: [] as any[] })];

    const [
      roomBookingsRes,
      privateRoomRes,
      groupRoomRes,
      trialRoomRes,
    ] = await Promise.all([
      roomBookingsPromise,
      ...fullModePromises,
    ]);

    for (const session of sessions) {
      const sessionStart = new Date(`${session.session_date}T${session.start_time}:00`);
      const sessionEnd = new Date(`${session.session_date}T${session.end_time}:00`);

      // 2a. Room bookings (always checked)
      for (const rb of roomBookingsRes.data || []) {
        const rbStart = new Date(rb.start_time);
        const rbEnd = new Date(rb.end_time);
        if (sessionStart < rbEnd && sessionEnd > rbStart) {
          conflicts.push({
            session,
            conflictType: 'room_booking',
            conflictData: rb,
            date: session.session_date,
            time: `${session.start_time}-${session.end_time}`,
            description: `Room reserved: ${rb.title || 'Room booking'}`,
            source: 'room',
          });
        }
      }

      // 2b. Private bookings occupying this room (full mode only)
      for (const b of privateRoomRes.data || []) {
        const bStart = new Date(b.start_time);
        const bEnd = new Date(b.end_time);
        if (sessionStart < bEnd && sessionEnd > bStart) {
          conflicts.push({
            session,
            conflictType: 'private_booking',
            conflictData: b,
            date: session.session_date,
            time: `${session.start_time}-${session.end_time}`,
            description: `Room occupied by private class (${b.start_time?.slice(11, 16)}-${b.end_time?.slice(11, 16)})`,
            source: 'room',
          });
        }
      }

      // 2c. Group sessions occupying this room (full mode only)
      for (const gs of groupRoomRes.data || []) {
        if (gs.session_date !== session.session_date) continue;
        const gsStart = new Date(`${gs.session_date}T${gs.start_time}:00`);
        const gsEnd = new Date(`${gs.session_date}T${gs.end_time}:00`);
        if (sessionStart < gsEnd && sessionEnd > gsStart) {
          conflicts.push({
            session,
            conflictType: 'group_session',
            conflictData: gs,
            date: session.session_date,
            time: `${session.start_time}-${session.end_time}`,
            description: `Room occupied by another group class`,
            source: 'room',
          });
        }
      }

      // 2d. Trial bookings occupying this room (full mode only)
      for (const t of trialRoomRes.data || []) {
        if (t.selected_date !== session.session_date) continue;
        if (!t.selected_time) continue;
        const tStart = new Date(`${t.selected_date}T${t.selected_time}:00`);
        const tEnd = new Date(tStart);
        tEnd.setHours(tStart.getHours() + (t.hours || 2));
        if (sessionStart < tEnd && sessionEnd > tStart) {
          conflicts.push({
            session,
            conflictType: 'trial_booking',
            conflictData: t,
            date: session.session_date,
            time: `${session.start_time}-${session.end_time}`,
            description: `Room occupied by trial class`,
            source: 'room',
          });
        }
      }
    }
  }

  // ==========================================
  // 3. DEDUPE (key includes source)
  // ==========================================
  const seen = new Set<string>();
  const dedupedConflicts: RawConflict[] = [];
  for (const c of conflicts) {
    const key = `${c.source}|${c.session.session_number}|${c.conflictType}|${c.teacherId || 'room'}|${c.conflictData?.id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedConflicts.push(c);
  }

  return dedupedConflicts;
}

/**
 * Convert raw conflicts to display-friendly list for the ConflictResolutionModal.
 */
export function buildConflictInfoList(
  conflicts: RawConflict[]
): Array<{
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
  conflictType: string;
  conflictDescription: string;
  teacherName?: string;
}> {
  return conflicts.map(c => ({
    session_number: c.session.session_number,
    session_date: c.session.session_date,
    start_time: c.session.start_time,
    end_time: c.session.end_time,
    conflictType: c.conflictType,
    conflictDescription: c.description,
    teacherName: c.teacherName,
  }));
}

/**
 * Split by source.
 *   teacherConflicts → soft-block via modal (create-as-is / skip)
 *   roomConflicts    → caller decides (group class: flag; private: ignore)
 */
export function splitConflicts(conflicts: RawConflict[]): {
  teacherConflicts: RawConflict[];
  roomConflicts: RawConflict[];
} {
  return {
    teacherConflicts: conflicts.filter(c => c.source === 'teacher'),
    roomConflicts: conflicts.filter(c => c.source === 'room'),
  };
}