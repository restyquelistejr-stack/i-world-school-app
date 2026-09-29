// lib/archiveService.ts
// ⭐ v3.14: Soft delete — archive instead of hard delete
import { supabase } from '@/lib/supabaseClient';

export type ArchiveEntityType =
  | 'user' | 'class' | 'scheduled_group_class'
  | 'room' | 'course' | 'course_module'
  | 'booking' | 'trial_booking' | 'group_session'
  | 'group_enrollment' | 'teacher_availability' | 'room_booking';

const TABLE_MAP: Record<ArchiveEntityType, string> = {
  user: 'users',
  class: 'classes',
  scheduled_group_class: 'scheduled_group_classes',
  room: 'rooms',
  course: 'courses',
  course_module: 'course_modules',
  booking: 'bookings',
  trial_booking: 'trial_class_bookings',
  group_session: 'group_class_sessions',
  group_enrollment: 'group_class_enrollments',
  teacher_availability: 'teacher_availability',
  room_booking: 'room_bookings',
};

export interface ArchiveOptions {
  reason: string;
  actorId?: string;
  actorRole?: string;
}

// ============================================================
// GENERIC
// ============================================================
export async function archiveEntity(
  entityType: ArchiveEntityType,
  entityId: string,
  options: ArchiveOptions
): Promise<{ success: boolean; error?: string }> {
  const table = TABLE_MAP[entityType];
  const now = new Date().toISOString();

  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: now,
      deleted_by: options.actorId || null,
      deletion_reason: options.reason,
    })
    .eq('id', entityId);

  if (error) return { success: false, error: error.message };

  await logEntityEvent(entityType, entityId, 'archived', { reason: options.reason }, options);

  return { success: true };
}

export async function reactivateEntity(
  entityType: ArchiveEntityType,
  entityId: string,
  options: { actorId?: string; actorRole?: string }
): Promise<{ success: boolean; error?: string }> {
  const table = TABLE_MAP[entityType];

  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
    })
    .eq('id', entityId);

  if (error) return { success: false, error: error.message };

  await logEntityEvent(entityType, entityId, 'reactivated', {}, options);

  return { success: true };
}

async function logEntityEvent(
  entityType: string,
  entityId: string,
  eventType: string,
  data: Record<string, any>,
  options: { actorId?: string; actorRole?: string }
) {
  await supabase.from('entity_events').insert({
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    event_data: data,
    actor_id: options.actorId || null,
    actor_role: options.actorRole || null,
  });
}

// ============================================================
// SPECIFIC: ARCHIVE A CLASS (private)
// - Archives the class
// - Cancels future sessions (status='cancelled' + cancelled_at)
// - Frees teacher + room naturally (their queries filter by cancelled)
// ============================================================
export async function archiveClass(
  classId: string,
  options: ArchiveOptions
): Promise<{ success: boolean; error?: string; sessionsCancelled?: number }> {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Archive the class
  const res = await archiveEntity('class', classId, options);
  if (!res.success) return res;

  // 2. Cancel future bookings tied to this class
  const { data: cancelledBookings, error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: now,
    })
    .eq('class_id', classId)
    .in('status', ['confirmed', 'in_progress', 'pending'])
    .gte('start_time', `${today}T00:00:00`)
    .select('id');

  if (bookingErr) {
    console.warn('Failed to cancel future bookings:', bookingErr);
  }

  await logEntityEvent('class', classId, 'sessions_cancelled', {
    count: cancelledBookings?.length || 0,
    reason: options.reason,
  }, options);

  return {
    success: true,
    sessionsCancelled: cancelledBookings?.length || 0,
  };
}

// ============================================================
// SPECIFIC: ARCHIVE A SCHEDULED GROUP CLASS
// - Archives the parent
// - Archives future sessions (soft delete, since the whole shell is gone)
// - Archives active enrollments
// ============================================================
export async function archiveScheduledGroupClass(
  groupClassId: string,
  options: ArchiveOptions
): Promise<{ success: boolean; error?: string; sessionsArchived?: number; enrollmentsArchived?: number }> {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Archive the parent
  const res = await archiveEntity('scheduled_group_class', groupClassId, options);
  if (!res.success) return res;

  // 2. Archive future sessions
  const { data: archivedSessions } = await supabase
    .from('group_class_sessions')
    .update({
      deleted_at: now,
      deleted_by: options.actorId || null,
      deletion_reason: options.reason,
    })
    .eq('group_class_id', groupClassId)
    .gte('session_date', today)
    .select('id');

  // 3. Archive active enrollments
  const { data: archivedEnrollments } = await supabase
    .from('group_class_enrollments')
    .update({
      deleted_at: now,
      deleted_by: options.actorId || null,
      deletion_reason: options.reason,
    })
    .eq('group_class_id', groupClassId)
    .eq('status', 'active')
    .select('id');

  await logEntityEvent('scheduled_group_class', groupClassId, 'cascade_archived', {
    sessions_archived: archivedSessions?.length || 0,
    enrollments_archived: archivedEnrollments?.length || 0,
    reason: options.reason,
  }, options);

  return {
    success: true,
    sessionsArchived: archivedSessions?.length || 0,
    enrollmentsArchived: archivedEnrollments?.length || 0,
  };
}

// ============================================================
// SPECIFIC: ARCHIVE A USER (teacher / student / admin)
// - Archives the user
// - Flips is_active = false
// - Future sessions: if teacher, flag sessions for substitute (admin resolves)
// - If student: withdraw from group classes
// ============================================================
export async function archiveUser(
  userId: string,
  options: ArchiveOptions
): Promise<{ success: boolean; error?: string }> {
  // 1. Archive the user
  const res = await archiveEntity('user', userId, options);
  if (!res.success) return res;

  // 2. Flip is_active = false
  await supabase.from('users').update({ is_active: false }).eq('id', userId);

  // 3. If this user is a teacher — flag future sessions
  const { data: futureTeachingSessions } = await supabase
    .from('group_class_sessions')
    .select('id')
    .eq('teacher_id', userId)
    .gte('session_date', new Date().toISOString().slice(0, 10))
    .eq('status', 'scheduled');

  if (futureTeachingSessions && futureTeachingSessions.length > 0) {
    await logEntityEvent('user', userId, 'teacher_has_future_sessions', {
      count: futureTeachingSessions.length,
      note: 'Admin should find substitutes',
    }, options);
  }

  // 4. If this user is a student — withdraw from active enrollments
  const { data: enrollments } = await supabase
    .from('group_class_enrollments')
    .select('id')
    .eq('student_id', userId)
    .eq('status', 'active');

  if (enrollments && enrollments.length > 0) {
    await supabase
      .from('group_class_enrollments')
      .update({
        status: 'withdrawn',
        deleted_at: new Date().toISOString(),
        deleted_by: options.actorId || null,
        deletion_reason: `Student archived: ${options.reason}`,
      })
      .eq('student_id', userId)
      .eq('status', 'active');
  }

  return { success: true };
}