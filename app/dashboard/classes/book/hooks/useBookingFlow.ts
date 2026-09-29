// app/dashboard/classes/book/hooks/useBookingFlow.ts
// ⭐ v3.11 FIX: Trial group bookings now correctly create trial_class_bookings rows
// ⭐ v3.14b: Attendance rows created on every booking/trial/class creation
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { BookingData, GeneratedSession } from '../types';
import { checkMultipleConflicts, formatConflicts } from '@/lib/roomConflictChecker';
import {
  detectAllConflicts,
  splitConflicts,
} from '@/lib/conflictDetectionService';
import {
  createBulkSubstituteAssignments,
  flagSessionNeedsAttention,
  type SubstituteAssignmentInput,
} from '@/lib/substituteService';
import {
  createAttendanceForBooking,
  createAttendanceForTrial,
  onStudentEnrolledInGroup,
} from '@/lib/attendanceService';
import { makeTimestamp, todayLocalDate } from '@/lib/timeUtils';

interface SubmitResult {
  success: boolean;
  message?: string;
  data?: any;
  conflicts?: any[];
  teacherConflicts?: any[];
  roomConflicts?: any[];
}

export function useBookingFlow() {
  const [formData, setFormData] = useState<BookingData>({
    action: 'trial',
    format: 'private',
    hours_per_session: 2,
    number_of_sessions: 10,
    preferred_days: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '11:00',
    generated_sessions: [],
    session_type: 'private',
    is_converted: false,
  });

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      action: 'trial',
      format: 'private',
      hours_per_session: 2,
      number_of_sessions: 10,
      preferred_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '11:00',
      generated_sessions: [],
      session_type: 'private',
      is_converted: false,
    });
  };

  // ==========================================
  // MAIN ROUTER
  // ==========================================
  const submitBooking = async (data: BookingData): Promise<SubmitResult> => {
    try {
      const isGroup = data.isGroupClassBooking && data.selected_group_class_id;
      const isTrial = data.action === 'trial';

      if (isGroup && isTrial) {
        return await submitTrialGroupBooking(data);
      }
      if (isGroup && !isTrial) {
        return await submitGroupClassBooking(data);
      }
      if (data.trialId && data.action === 'register') {
        return await submitTrialConversion(data);
      }
      if (isTrial) {
        return await submitTrialBooking(data);
      }
      return await submitPrivateClassBooking(data);
    } catch (error: any) {
      console.error('Submit error:', error);
      return {
        success: false,
        message: error.message || 'Something went wrong',
      };
    }
  };

  const detectConflictsForCurrentForm = async (
    data: BookingData
  ): Promise<{ conflicts: any[]; teacherConflicts: any[]; roomConflicts: any[] }> => {
    const sessions: GeneratedSession[] = data.generated_sessions || [];
    if (sessions.length === 0) {
      return { conflicts: [], teacherConflicts: [], roomConflicts: [] };
    }

    const formattedSessions = sessions.map((s: GeneratedSession) => ({
      session_number: s.session_number || 0,
      session_date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      room_id: s.room_id,
      room_name: s.room_name,
    }));

    const teacherIds: string[] = data.teacher_id ? [data.teacher_id] : [];
    const teacherNamesById: Record<string, string> = {};
    if (data.teacher_id && sessions[0]?.teacher_name) {
      teacherNamesById[data.teacher_id] = sessions[0].teacher_name;
    }

    const conflicts = await detectAllConflicts({
      sessions: formattedSessions,
      teacherIds,
      roomId: data.room_id || null,
      teacherNamesById,
    });

    const { teacherConflicts, roomConflicts } = splitConflicts(conflicts);
    return { conflicts, teacherConflicts, roomConflicts };
  };

  // ==========================================
  // TRIAL GROUP BOOKING
  // ==========================================
  const submitTrialGroupBooking = async (data: BookingData): Promise<SubmitResult> => {
    const {
      student_id,
      course_id,
      module_id,
      selected_group_class_id,
      teacher_id,
      room_id,
      group_class_data,
      trial_session,
    } = data as any;

    if (!student_id || !course_id || !selected_group_class_id) {
      return { success: false, message: 'Missing student, course, or group class' };
    }

    if (!trial_session?.date || !trial_session?.start_time || !trial_session?.end_time) {
      return { success: false, message: 'Please pick a specific group session date to trial.' };
    }

    const { data: trial, error: trialError } = await supabase
      .from('trial_class_bookings')
      .insert({
        student_id,
        course_id,
        module_id: module_id || null,
        session_type: 'group',
        selected_group_class_id,
        selected_teacher_id:
          trial_session.teacher_id || teacher_id || group_class_data?.teacher_ids?.[0] || null,
        selected_date: trial_session.date,
        selected_time: trial_session.start_time,
        hours: data.hours_per_session || 2,
        start_date: trial_session.date,
        room_id: trial_session.room_id || room_id || null,
        status: 'active',
        is_converted: false,
      })
      .select()
      .single();

    if (trialError || !trial) {
      console.error('Trial group insertion error:', trialError);
      return {
        success: false,
        message: 'Failed to create trial group booking: ' + (trialError?.message || 'unknown'),
      };
    }

    // ⭐ v3.14b: attendance rows for the trial
    await createAttendanceForTrial(
      trial.id,
      trial.selected_teacher_id || null,
      student_id
    );

    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: trial_session.room_id || room_id || null,
        teacher_id: trial_session.teacher_id || teacher_id || null,
        course_id,
        student_id,
        start_time: makeTimestamp(trial_session.date, trial_session.start_time),
        end_time: makeTimestamp(trial_session.date, trial_session.end_time),
        status: 'confirmed',
        class_id: trial.id,
        is_trial: true,
        trial_id: trial.id,
      });

    if (bookingError) {
      console.warn('⚠️ Booking row creation failed:', bookingError);
    }

    return {
      success: true,
      message: 'Trial group booking created. Go to Classes → Management → Trial to Register to convert.',
      data: { trial },
    };
  };

  // ==========================================
  // TRIAL BOOKING (private)
  // ==========================================
  const submitTrialBooking = async (data: BookingData): Promise<SubmitResult> => {
    const {
      student_id,
      course_id,
      module_id,
      teacher_id,
      room_id,
      start_date,
      start_time,
      hours_per_session,
      generated_sessions,
    } = data;

    if (!student_id || !course_id) {
      return { success: false, message: 'Missing student or course' };
    }

    const sessions: GeneratedSession[] = generated_sessions || [];
    const firstSession: GeneratedSession | null = sessions.length > 0 ? sessions[0] : null;

    const sessionType = 'private';
    const sessionDate = firstSession?.date || start_date || todayLocalDate();
    const sessionStartTime = firstSession?.start_time || start_time || '09:00';
    const sessionEndTime = firstSession?.end_time || '11:00';

    const { data: trial, error: trialError } = await supabase
      .from('trial_class_bookings')
      .insert({
        student_id,
        course_id,
        module_id: module_id || null,
        session_type: sessionType,
        hours: hours_per_session || 2,
        start_date: sessionDate,
        selected_teacher_id: teacher_id || firstSession?.teacher_id || null,
        selected_date: sessionDate,
        selected_time: sessionStartTime,
        room_id: room_id || firstSession?.room_id || null,
        status: 'active',
        is_converted: false,
      })
      .select()
      .single();

    if (trialError) {
      console.error('Trial insertion error:', trialError);
      return { success: false, message: 'Failed to create trial: ' + trialError.message };
    }

    // ⭐ v3.14b: attendance rows for the trial
    await createAttendanceForTrial(
      trial.id,
      trial.selected_teacher_id || null,
      student_id
    );

    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: room_id || firstSession?.room_id || null,
        teacher_id: teacher_id || firstSession?.teacher_id || null,
        course_id,
        student_id,
        start_time: makeTimestamp(sessionDate, sessionStartTime),
        end_time: makeTimestamp(sessionDate, sessionEndTime),
        status: 'confirmed',
        class_id: trial.id,
        is_trial: true,
        trial_id: trial.id,
      })
      .select()
      .single();

    if (bookingError) {
      console.warn('Failed to create booking for trial:', bookingError);
    }

    const flaggedNumbers: number[] | undefined = (data as any).flagged_session_numbers;
    const resolution: string | undefined = (data as any).conflict_resolution;

    if (
      flaggedNumbers && flaggedNumbers.length > 0 &&
      resolution === 'create_as_is' &&
      teacher_id
    ) {
      await flagSessionNeedsAttention('trial_class_bookings', trial.id, 'teacher_conflict');

      const substituteInputs: SubstituteAssignmentInput[] = [{
        session_type: 'trial_private',
        session_id: trial.id,
        original_teacher_id: teacher_id,
        class_id: trial.id,
        course_id,
        module_id: module_id || null,
        room_id: room_id || firstSession?.room_id || null,
        session_date: sessionDate,
        start_time: sessionStartTime,
        end_time: sessionEndTime,
      }];

      await createBulkSubstituteAssignments(substituteInputs);
    }

    return {
      success: true,
      message: 'Trial booking created successfully',
      data: { trial },
    };
  };

  const checkConflicts = async (data: BookingData): Promise<{ hasConflict: boolean; message?: string }> => {
    const sessions: GeneratedSession[] = data.generated_sessions || [];
    if (sessions.length === 0) {
      return { hasConflict: false };
    }

    const formattedSessions = sessions.map((s: GeneratedSession) => ({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
    }));

    const result = await checkMultipleConflicts(
      data.room_id || '',
      data.teacher_id || null,
      formattedSessions,
      undefined,
      undefined,
      undefined
    );

    if (result.hasConflict) {
      return {
        hasConflict: true,
        message: `⚠️ Conflicts detected:\n${formatConflicts(result.conflicts)}\n\nPlease resolve these conflicts before confirming.`,
      };
    }

    return { hasConflict: false };
  };

  // ==========================================
  // GROUP CLASS BOOKING (direct enrollment, non-trial)
  // ==========================================
  const submitGroupClassBooking = async (data: BookingData): Promise<SubmitResult> => {
    const { selected_group_class_id, student_id } = data;

    if (!selected_group_class_id || !student_id) {
      return { success: false, message: 'Missing group class or student ID' };
    }

    const { data: existingEnrollment } = await supabase
      .from('group_class_enrollments')
      .select('id')
      .eq('group_class_id', selected_group_class_id)
      .eq('student_id', student_id)
      .eq('status', 'active')
      .single();

    if (existingEnrollment) {
      return { success: false, message: 'Student is already enrolled in this group class' };
    }

    const { data: groupClass, error: gcError } = await supabase
      .from('scheduled_group_classes')
      .select('*')
      .eq('id', selected_group_class_id)
      .single();

    if (gcError || !groupClass) {
      return { success: false, message: 'Group class not found' };
    }

    if (groupClass.current_students >= groupClass.max_students) {
      return { success: false, message: 'This group class is full' };
    }

    const nowIso = new Date().toISOString();

    const { data: enrollment, error: enrollError } = await supabase
      .from('group_class_enrollments')
      .insert({
        group_class_id: selected_group_class_id,
        student_id,
        status: 'active',
        enrollment_date: nowIso,
      })
      .select()
      .single();

    if (enrollError) {
      return { success: false, message: 'Failed to enroll student: ' + enrollError.message };
    }

    // ⭐ v3.14b: create attendance rows for future group sessions
    await onStudentEnrolledInGroup(selected_group_class_id, student_id);

    await supabase
      .from('scheduled_group_classes')
      .update({ current_students: groupClass.current_students + 1 })
      .eq('id', selected_group_class_id);

    if (data.trialId) {
      await supabase
        .from('trial_class_bookings')
        .update({
          status: 'converted',
          is_converted: true,
          converted_at: nowIso,
        })
        .eq('id', data.trialId);

      await supabase
        .from('bookings')
        .update({ status: 'converted' })
        .eq('trial_id', data.trialId)
        .eq('is_trial', true);
    }

    return {
      success: true,
      message: 'Student enrolled in group class',
      data: { enrollment, groupClass },
    };
  };

  // ==========================================
  // TRIAL CONVERSION
  // ==========================================
  const submitTrialConversion = async (data: BookingData): Promise<SubmitResult> => {
    const { trialId, student_id, course_id, module_id } = data;
    const generated_sessions: GeneratedSession[] = data.generated_sessions || [];

    if (!trialId || !student_id || !course_id) {
      return { success: false, message: 'Missing required trial conversion data' };
    }

    if (generated_sessions.length === 0) {
      return { success: false, message: 'No sessions generated for trial conversion' };
    }

    const { teacherConflicts, roomConflicts } = await detectConflictsForCurrentForm(data);

    if (roomConflicts.length > 0) {
      return { success: false, message: 'Room conflicts detected', roomConflicts };
    }

    const conflictResolution: string | undefined = (data as any).conflict_resolution;
    if (
      teacherConflicts.length > 0 &&
      conflictResolution !== 'skip_conflicting' &&
      conflictResolution !== 'create_as_is'
    ) {
      return {
        success: false,
        message: 'Teacher conflicts detected',
        teacherConflicts,
        conflicts: teacherConflicts,
      };
    }

    const flaggedNumbers: number[] | undefined = (data as any).flagged_session_numbers;
    const conflictSessionNumbers = new Set<number>(flaggedNumbers || []);

    const sessionsToCreate: GeneratedSession[] = conflictResolution === 'skip_conflicting'
      ? generated_sessions.filter((s: GeneratedSession) => !conflictSessionNumbers.has(s.session_number || 0))
      : generated_sessions;

    if (sessionsToCreate.length === 0) {
      return { success: false, message: 'All sessions were conflicting' };
    }

    const classCode = generateClassCode('private');
    const { data: newClass, error: classError } = await supabase
      .from('classes')
      .insert({
        course_id,
        module_id,
        student_id,
        teacher_id: data.teacher_id,
        room_id: data.room_id,
        max_students: 1,
        total_sessions: sessionsToCreate.length,
        session_duration: data.hours_per_session || 2,
        hours_per_session: data.hours_per_session || 2,
        status: 'active',
        class_code: classCode,
        class_type: 'private',
        source_type: 'trial_converted',
        trial_booking_id: trialId,
      })
      .select()
      .single();

    if (classError) {
      return { success: false, message: 'Failed to create class: ' + classError.message };
    }

    const classOptions = sessionsToCreate.map((session: GeneratedSession) => ({
      class_id: newClass.id,
      teacher_id: session.teacher_id,
      room_id: session.room_id,
      start_time: makeTimestamp(session.date, session.start_time),
      end_time: makeTimestamp(session.date, session.end_time),
      session_index: session.session_number,
      is_selected: true,
    }));

    const { error: optionsError } = await supabase.from('class_options').insert(classOptions);

    if (optionsError) {
      await supabase.from('classes').delete().eq('id', newClass.id);
      return { success: false, message: 'Failed to create sessions: ' + optionsError.message };
    }

    await supabase.from('class_enrollments').insert({
      class_id: newClass.id,
      student_id,
      status: 'active',
    });

    const nowIso = new Date().toISOString();

    await supabase
      .from('trial_class_bookings')
      .update({
        status: 'converted',
        is_converted: true,
        converted_at: nowIso,
        converted_class_id: newClass.id,
      })
      .eq('id', trialId);

    await supabase
      .from('bookings')
      .update({
        status: 'converted',
        converted_to_class_id: newClass.id,
      })
      .eq('trial_id', trialId)
      .eq('is_trial', true);

    const bookings = sessionsToCreate.map((session: GeneratedSession) => ({
      room_id: session.room_id,
      teacher_id: session.teacher_id,
      course_id,
      student_id,
      start_time: makeTimestamp(session.date, session.start_time),
      end_time: makeTimestamp(session.date, session.end_time),
      status: 'confirmed',
      class_id: newClass.id,
    }));

    const { data: insertedBookings } = await supabase
      .from('bookings')
      .insert(bookings)
      .select();

    // ⭐ v3.14b: attendance rows for each new booking
    for (const b of insertedBookings || []) {
      await createAttendanceForBooking(b.id, b.teacher_id, b.student_id);
    }

    if (
      conflictResolution === 'create_as_is' &&
      flaggedNumbers && flaggedNumbers.length > 0 &&
      insertedBookings
    ) {
      const sessionNumberToBookingId: Record<number, string> = {};
      sessionsToCreate.forEach((s: GeneratedSession, idx: number) => {
        const inserted = insertedBookings[idx];
        const sn = s.session_number || (idx + 1);
        if (inserted) sessionNumberToBookingId[sn] = inserted.id;
      });

      const substituteInputs: SubstituteAssignmentInput[] = [];
      const flagPromises: Promise<boolean>[] = [];

      for (const sn of flaggedNumbers) {
        const bookingId = sessionNumberToBookingId[sn];
        if (!bookingId) continue;

        const session: GeneratedSession | undefined = sessionsToCreate.find(
          (s: GeneratedSession) => (s.session_number ?? 0) === sn
        );
        if (!session) continue;

        flagPromises.push(
          flagSessionNeedsAttention('bookings', bookingId, 'teacher_conflict')
        );

        substituteInputs.push({
          session_type: 'private_session',
          session_id: bookingId,
          original_teacher_id: session.teacher_id,
          class_id: newClass.id,
          course_id,
          module_id: module_id || null,
          room_id: session.room_id,
          session_date: session.date,
          start_time: session.start_time,
          end_time: session.end_time,
        });
      }

      await Promise.all(flagPromises);
      await createBulkSubstituteAssignments(substituteInputs);
    }

    return {
      success: true,
      message: 'Trial converted to class successfully',
      data: { class: newClass },
    };
  };

  // ==========================================
  // PRIVATE CLASS BOOKING
  // ==========================================
  const submitPrivateClassBooking = async (data: BookingData): Promise<SubmitResult> => {
    const {
      student_id,
      course_id,
      module_id,
      hours_per_session,
      teacher_id,
      room_id,
    } = data;
    const generated_sessions: GeneratedSession[] = data.generated_sessions || [];

    if (!student_id || !course_id) {
      return { success: false, message: 'Missing student or course' };
    }

    if (generated_sessions.length === 0) {
      return { success: false, message: 'No sessions generated' };
    }

    const { teacherConflicts, roomConflicts } = await detectConflictsForCurrentForm(data);

    if (roomConflicts.length > 0) {
      return { success: false, message: 'Room conflicts detected', roomConflicts };
    }

    const conflictResolution: string | undefined = (data as any).conflict_resolution;
    if (
      teacherConflicts.length > 0 &&
      conflictResolution !== 'skip_conflicting' &&
      conflictResolution !== 'create_as_is'
    ) {
      return {
        success: false,
        message: 'Teacher conflicts detected',
        teacherConflicts,
        conflicts: teacherConflicts,
      };
    }

    const flaggedNumbers: number[] | undefined = (data as any).flagged_session_numbers;
    const conflictSessionNumbers = new Set<number>(flaggedNumbers || []);

    const sessionsToCreate: GeneratedSession[] = conflictResolution === 'skip_conflicting'
      ? generated_sessions.filter((s: GeneratedSession) => !conflictSessionNumbers.has(s.session_number || 0))
      : generated_sessions;

    if (sessionsToCreate.length === 0) {
      return { success: false, message: 'All sessions were conflicting' };
    }

    const classCode = generateClassCode('private');
    const { data: newClass, error: classError } = await supabase
      .from('classes')
      .insert({
        course_id,
        module_id,
        student_id,
        teacher_id,
        room_id,
        max_students: 1,
        total_sessions: sessionsToCreate.length,
        session_duration: hours_per_session || 2,
        hours_per_session: hours_per_session || 2,
        status: 'active',
        class_code: classCode,
        class_type: 'private',
        source_type: 'new',
      })
      .select()
      .single();

    if (classError) {
      return { success: false, message: 'Failed to create class: ' + classError.message };
    }

    const classOptions = sessionsToCreate.map((session: GeneratedSession) => ({
      class_id: newClass.id,
      teacher_id: session.teacher_id,
      room_id: session.room_id,
      start_time: makeTimestamp(session.date, session.start_time),
      end_time: makeTimestamp(session.date, session.end_time),
      session_index: session.session_number,
      is_selected: true,
    }));

    const { error: optionsError } = await supabase.from('class_options').insert(classOptions);

    if (optionsError) {
      await supabase.from('classes').delete().eq('id', newClass.id);
      return { success: false, message: 'Failed to create sessions: ' + optionsError.message };
    }

    await supabase.from('class_enrollments').insert({
      class_id: newClass.id,
      student_id,
      status: 'active',
    });

    const bookings = sessionsToCreate.map((session: GeneratedSession) => ({
      room_id: session.room_id,
      teacher_id: session.teacher_id,
      course_id,
      student_id,
      start_time: makeTimestamp(session.date, session.start_time),
      end_time: makeTimestamp(session.date, session.end_time),
      status: 'confirmed',
      class_id: newClass.id,
    }));

    const { data: insertedBookings } = await supabase
      .from('bookings')
      .insert(bookings)
      .select();

    // ⭐ v3.14b: attendance rows for each new booking
    for (const b of insertedBookings || []) {
      await createAttendanceForBooking(b.id, b.teacher_id, b.student_id);
    }

    if (
      conflictResolution === 'create_as_is' &&
      flaggedNumbers && flaggedNumbers.length > 0 &&
      insertedBookings
    ) {
      const sessionNumberToBookingId: Record<number, string> = {};
      sessionsToCreate.forEach((s: GeneratedSession, idx: number) => {
        const inserted = insertedBookings[idx];
        const sn = s.session_number || (idx + 1);
        if (inserted) sessionNumberToBookingId[sn] = inserted.id;
      });

      const substituteInputs: SubstituteAssignmentInput[] = [];
      const flagPromises: Promise<boolean>[] = [];

      for (const sn of flaggedNumbers) {
        const bookingId = sessionNumberToBookingId[sn];
        if (!bookingId) continue;

        const session: GeneratedSession | undefined = sessionsToCreate.find(
          (s: GeneratedSession) => (s.session_number ?? 0) === sn
        );
        if (!session) continue;

        flagPromises.push(
          flagSessionNeedsAttention('bookings', bookingId, 'teacher_conflict')
        );

        substituteInputs.push({
          session_type: 'private_session',
          session_id: bookingId,
          original_teacher_id: session.teacher_id,
          class_id: newClass.id,
          course_id,
          module_id: module_id || null,
          room_id: session.room_id,
          session_date: session.date,
          start_time: session.start_time,
          end_time: session.end_time,
        });
      }

      await Promise.all(flagPromises);
      await createBulkSubstituteAssignments(substituteInputs);
    }

    return {
      success: true,
      message: 'Class created successfully',
      data: { class: newClass },
    };
  };

  const generateClassCode = (type: 'private' | 'group'): string => {
    const prefix = type === 'private' ? 'PL' : 'GL';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `${prefix}-${year}${month}${day}-${random}`;
  };

  return {
    formData,
    updateField,
    submitBooking,
    resetForm,
    detectConflictsForCurrentForm,
  };
}