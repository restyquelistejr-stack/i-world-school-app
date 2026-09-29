// app/dashboard/classes/trial-to-register/page.tsx
// ⭐ M9: Added conflict resolution modal for private conversion
// ⭐ v3.7: source_type = 'trial_to_register' + trial_booking_id for traceability
// ⭐ v3.9: Teacher contact info visible in summary
// ⭐ v3.12 FIX: Group trial conversion — enroll into EXISTING group class, no new `classes` row.
// ⭐ v3.14b FIX: private conversion persists student_id + creates attendance rows.
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, addDays } from 'date-fns';
import { makeTimestamp, todayLocalDate, formatLocalDate } from '@/lib/timeUtils';

import ConflictResolutionModal, {
  type ConflictResolutionChoice,
  type ConflictSessionInfo,
} from '@/components/ConflictResolutionModal';
import TeacherContactInfo from '@/components/TeacherContactInfo';
import {
  detectAllConflicts,
  buildConflictInfoList,
  splitConflicts,
} from '@/lib/conflictDetectionService';
import {
  createBulkSubstituteAssignments,
  flagSessionNeedsAttention,
  type SubstituteAssignmentInput,
} from '@/lib/substituteService';
import {
  createAttendanceForBooking,
  onStudentEnrolledInGroup,
} from '@/lib/attendanceService';

// ==========================================
// TYPES
// ==========================================
interface TrialBooking {
  id: string;
  student_id: string | null;
  course_id: string;
  module_id: string;
  session_type: 'private' | 'group';
  hours: number;
  start_date: string;
  selected_teacher_id: string | null;
  selected_group_class_id: string | null;
  selected_date: string;
  selected_time: string;
  room_id: string | null;
  status: string;
  is_converted?: boolean;
  converted_class_id?: string | null;
}

interface Student { id: string; full_name: string; email: string; }

interface Teacher {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  teacher_type?: string;
}

interface GroupClass {
  id: string;
  class_name: string;
  course_id: string;
  module_id: string;
  teacher_ids: string[];
  room_id: string;
  total_sessions: number;
  start_date: string;
  end_date: string;
  schedule_days: number[];
  start_time: string;
  end_time: string;
  max_students: number;
  current_students: number;
  status: string;
  course_name?: string;
  module_name?: string;
  teacher_contacts?: Array<{
    id: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    teacher_type?: string | null;
  }>;
  available_spots?: number;
  is_trial_target?: boolean;
}

interface DayAvailability {
  day: number;
  start_time: string;
  end_time: string;
  available: boolean;
}

// ==========================================
// HELPERS
// ==========================================
function generateClassCode(type: 'private' | 'group'): string {
  const prefix = type === 'private' ? 'PL' : 'GL';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${year}${month}${day}-${random}`;
}

const daysOfWeek = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function formatSupabaseError(err: any): string {
  if (!err) return 'Unknown error';
  const parts: string[] = [];
  if (err.message) parts.push(`Message: ${err.message}`);
  if (err.details) parts.push(`Details: ${err.details}`);
  if (err.hint) parts.push(`Hint: ${err.hint}`);
  if (err.code) parts.push(`Code: ${err.code}`);
  return parts.length > 0 ? parts.join(' | ') : JSON.stringify(err);
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function TrialToRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trialId = searchParams.get('trialId');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trial, setTrial] = useState<TrialBooking | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [groupClass, setGroupClass] = useState<GroupClass | null>(null);

  const [courseName, setCourseName] = useState<string>('');
  const [moduleName, setModuleName] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [roomName, setRoomName] = useState<string>('');

  const [convertedClassCode, setConvertedClassCode] = useState<string>('');
  const [registrationType, setRegistrationType] = useState<'group' | 'private'>('private');

  const [dayAvailability, setDayAvailability] = useState<DayAvailability[]>([
    { day: 0, start_time: '09:00', end_time: '17:00', available: false },
    { day: 1, start_time: '09:00', end_time: '17:00', available: true },
    { day: 2, start_time: '09:00', end_time: '17:00', available: true },
    { day: 3, start_time: '09:00', end_time: '17:00', available: true },
    { day: 4, start_time: '09:00', end_time: '17:00', available: true },
    { day: 5, start_time: '09:00', end_time: '17:00', available: true },
    { day: 6, start_time: '09:00', end_time: '17:00', available: false },
  ]);

  const [hoursPerSession, setHoursPerSession] = useState(2);
  const [numberOfSessions, setNumberOfSessions] = useState(10);

  const [availableGroupClasses, setAvailableGroupClasses] = useState<GroupClass[]>([]);
  const [selectedGroupClassId, setSelectedGroupClassId] = useState<string>('');

  const [generatedSessions, setGeneratedSessions] = useState<any[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ConflictSessionInfo[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // ==========================================
  // LIFECYCLE  // ==========================================
  useEffect(() => {
    if (trialId) {
      loadTrialData();
    } else {
      setError('No trial booking selected');
      setLoading(false);
    }
  }, [trialId]);

  // ==========================================
  // CONVERT TRIAL BOOKING
  // ==========================================
  async function convertTrialBooking(
    id: string,
    newClassId: string,
    convertedType: 'private' | 'group'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = new Date().toISOString();

      const updatePayload: Record<string, any> = {
        status: 'converted',
        is_converted: true,
        converted_at: now,
      };

      if (convertedType === 'private') {
        updatePayload.converted_class_id = newClassId;
      } else {
        updatePayload.converted_class_id = null;
      }

      const { error: trialError } = await supabase
        .from('trial_class_bookings')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (trialError) {
        const errMsg = formatSupabaseError(trialError);
        console.error('❌ Error marking trial as converted:', errMsg);
        return { success: false, error: errMsg };
      }

      const bookingUpdate: Record<string, any> = { status: 'converted' };
      if (convertedType === 'private') {
        bookingUpdate.converted_to_class_id = newClassId;
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .update(bookingUpdate)
        .eq('trial_id', id)
        .eq('is_trial', true)
        .select();

      if (bookingError) {
        console.warn('⚠️ Could not update trial booking:', formatSupabaseError(bookingError));
      }

      return { success: true };
    } catch (err: any) {
      const errMsg = formatSupabaseError(err);
      console.error('❌ Exception in convertTrialBooking:', errMsg);
      return { success: false, error: errMsg };
    }
  }

  // ==========================================
  // LOAD TRIAL DATA
  // ==========================================
  async function loadTrialData() {
    setLoading(true);
    try {
      const { data: trialData, error: trialError } = await supabase
        .from('trial_class_bookings')
        .select('*')
        .eq('id', trialId)
        .single();

      if (trialError || !trialData) {
        setError('Trial booking not found');
        setLoading(false);
        return;
      }

      const alreadyConverted =
        trialData.is_converted === true ||
        trialData.status === 'converted';

      if (alreadyConverted) {
        alert('⚠️ This trial has already been converted to a class.');
        router.push('/dashboard/classes/management');
        return;
      }

      if (trialData.status !== 'active') {
        alert('⚠️ This trial is no longer available for conversion.');
        router.push('/dashboard/classes/management');
        return;
      }

      setTrial(trialData);

      if (trialData.student_id) {
        const { data: studentData } = await supabase
          .from('users')
          .select('id, full_name, email')
          .eq('id', trialData.student_id)
          .single();
        if (studentData) setStudent(studentData);
      }

      if (trialData.selected_teacher_id) {
        const [userRes, profileRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, full_name, email, phone')
            .eq('id', trialData.selected_teacher_id)
            .single(),
          supabase
            .from('teachers')
            .select('teacher_type')
            .eq('id', trialData.selected_teacher_id)
            .maybeSingle(),
        ]);
        if (userRes.data) {
          setTeacher({
            ...userRes.data,
            teacher_type: profileRes.data?.teacher_type || undefined,
          });
        }
      }

      if (trialData.course_id) {
        const { data: courseData } = await supabase
          .from('courses')
          .select('name')
          .eq('id', trialData.course_id)
          .single();
        if (courseData) setCourseName(courseData.name);
      }

      if (trialData.module_id) {
        const { data: moduleData } = await supabase
          .from('course_modules')
          .select('title, level')
          .eq('id', trialData.module_id)
          .single();
        if (moduleData) {
          setModuleName(moduleData.title);
          setLevel(moduleData.level);
        }
      }

      if (trialData.room_id) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', trialData.room_id)
          .single();
        if (roomData) setRoomName(roomData.name);
        else setRoomName(`Room ID: ${trialData.room_id.slice(0, 8)}...`);
      } else {
        setRoomName('⚠️ No room assigned');
      }

      if (trialData.session_type === 'group') {
        if (trialData.selected_group_class_id) {
          await loadGroupClass(trialData.selected_group_class_id);
        }
        await loadAvailableGroupClasses(
          trialData.course_id,
          trialData.selected_group_class_id || undefined
        );
        setRegistrationType('group');
      } else {
        setRegistrationType('private');
        setHoursPerSession(trialData.hours || 2);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function loadGroupClass(groupClassId: string) {
    const { data, error } = await supabase
      .from('scheduled_group_classes')
      .select('*')
      .eq('id', groupClassId)
      .single();
    if (!error && data) setGroupClass(data);
  }

  async function loadAvailableGroupClasses(
    courseId: string,
    pinnedGroupClassId?: string
  ) {
    const enrichedClasses: GroupClass[] = [];

    if (pinnedGroupClassId) {
      const { data: pinned } = await supabase
        .from('scheduled_group_classes')
        .select('*')
        .eq('id', pinnedGroupClassId)
        .maybeSingle();

      if (pinned) {
        const enriched = await enrichGroupClass(pinned as GroupClass, true);
        enrichedClasses.push(enriched);
      }
    }

    const { data: classes, error } = await supabase
      .from('scheduled_group_classes')
      .select('*')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('start_date');

    if (!error && classes) {
      for (const gc of classes) {
        if (enrichedClasses.some(c => c.id === gc.id)) continue;
        const availableSpots = (gc.max_students || 0) - (gc.current_students || 0);
        if (availableSpots <= 0) continue;
        const enriched = await enrichGroupClass(gc as GroupClass, false);
        enrichedClasses.push(enriched);
      }
    }

    enrichedClasses.sort((a, b) => {
      if (a.is_trial_target && !b.is_trial_target) return -1;
      if (!a.is_trial_target && b.is_trial_target) return 1;
      return 0;
    });

    setAvailableGroupClasses(enrichedClasses);

    if (enrichedClasses.length > 0) {
      const trialTarget = enrichedClasses.find(c => c.is_trial_target);
      setSelectedGroupClassId((trialTarget || enrichedClasses[0]).id);
    }
  }

  async function enrichGroupClass(
    gc: GroupClass,
    isTrialTarget: boolean
  ): Promise<GroupClass> {
    let courseNameResult: string | undefined;
    if (gc.course_id) {
      const { data: c } = await supabase
        .from('courses')
        .select('name')
        .eq('id', gc.course_id)
        .single();
      courseNameResult = c?.name;
    }

    let moduleNameResult: string | undefined;
    if (gc.module_id) {
      const { data: m } = await supabase
        .from('course_modules')
        .select('title')
        .eq('id', gc.module_id)
        .single();
      moduleNameResult = m?.title;
    }

    let teacherContacts: GroupClass['teacher_contacts'] = [];
    if (gc.teacher_ids && gc.teacher_ids.length > 0) {
      const [usersRes, profilesRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, phone')
          .in('id', gc.teacher_ids)
          .eq('role', 'teacher'),
        supabase
          .from('teachers')
          .select('id, teacher_type')
          .in('id', gc.teacher_ids),
      ]);
      const profileMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
      teacherContacts = (usersRes.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        teacher_type: profileMap[u.id]?.teacher_type || null,
      }));
    }

    return {
      ...gc,
      course_name: courseNameResult,
      module_name: moduleNameResult,
      teacher_contacts: teacherContacts,
      available_spots: (gc.max_students || 0) - (gc.current_students || 0),
      is_trial_target: isTrialTarget,
    };
  }

  const getAvailableDays = () => dayAvailability.filter(d => d.available).map(d => d.day);
  const getDayAvailability = (day: number) => dayAvailability.find(d => d.day === day);
  const toggleDay = (day: number) => {
    setDayAvailability(prev => prev.map(d => d.day === day ? { ...d, available: !d.available } : d));
  };
  const updateDayTime = (day: number, field: 'start_time' | 'end_time', value: string) => {
    setDayAvailability(prev => prev.map(d => d.day === day ? { ...d, [field]: value } : d));
  };

  async function buildTeacherConflictMap(
    teacherId: string,
    startDate: Date,
    endDateLimit: Date
  ): Promise<Record<string, { start: Date; end: Date }[]>> {
    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDateLimit);
    const conflictMap: Record<string, { start: Date; end: Date }[]> = {};

    const { data: privateBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('teacher_id', teacherId)
      .gte('start_time', startDateStr + 'T00:00:00')
      .lte('start_time', endDateStr + 'T23:59:59')
      .in('status', ['confirmed', 'in_progress', 'pending']);

    if (privateBookings) {
      for (const booking of privateBookings) {
        const dateKey = String(booking.start_time).slice(0, 10);
        if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
        conflictMap[dateKey].push({
          start: new Date(booking.start_time.replace(' ', 'T')),
          end: new Date(booking.end_time.replace(' ', 'T'))
        });
      }
    }

    const { data: groupSessions } = await supabase
      .from('group_class_sessions')
      .select('*')
      .eq('teacher_id', teacherId)
      .gte('session_date', startDateStr)
      .lte('session_date', endDateStr)
      .in('status', ['scheduled', 'ongoing']);

    if (groupSessions) {
      for (const session of groupSessions) {
        const dateKey = session.session_date;
        if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
        conflictMap[dateKey].push({
          start: new Date(`${session.session_date}T${session.start_time}:00`),
          end: new Date(`${session.session_date}T${session.end_time}:00`)
        });
      }
    }

    const { data: trialBookings } = await supabase
      .from('trial_class_bookings')
      .select('*')
      .eq('selected_teacher_id', teacherId)
      .gte('selected_date', startDateStr)
      .lte('selected_date', endDateStr)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')')
      .eq('is_converted', false);

    if (trialBookings) {
      for (const trialItem of trialBookings) {
        if (trialItem.selected_date && trialItem.selected_time) {
          const dateKey = trialItem.selected_date;
          if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
          const tStart = new Date(`${trialItem.selected_date}T${trialItem.selected_time}:00`);
          const tEnd = new Date(tStart);
          tEnd.setHours(tStart.getHours() + (trialItem.hours || 2));
          conflictMap[dateKey].push({ start: tStart, end: tEnd });
        }
      }
    }

    return conflictMap;
  }

  async function buildRoomConflictMap(
    roomId: string,
    startDate: Date,
    endDateLimit: Date
  ): Promise<Record<string, { start: Date; end: Date }[]>> {
    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDateLimit);
    const conflictMap: Record<string, { start: Date; end: Date }[]> = {};

    const { data: privateBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('room_id', roomId)
      .gte('start_time', startDateStr + 'T00:00:00')
      .lte('start_time', endDateStr + 'T23:59:59')
      .in('status', ['confirmed', 'in_progress', 'pending']);

    if (privateBookings) {
      for (const booking of privateBookings) {
        const dateKey = String(booking.start_time).slice(0, 10);
        if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
        conflictMap[dateKey].push({
          start: new Date(booking.start_time.replace(' ', 'T')),
          end: new Date(booking.end_time.replace(' ', 'T'))
        });
      }
    }

    const { data: groupSessions } = await supabase
      .from('group_class_sessions')
      .select('*')
      .eq('room_id', roomId)
      .gte('session_date', startDateStr)
      .lte('session_date', endDateStr)
      .in('status', ['scheduled', 'ongoing']);

    if (groupSessions) {
      for (const session of groupSessions) {
        const dateKey = session.session_date;
        if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
        conflictMap[dateKey].push({
          start: new Date(`${session.session_date}T${session.start_time}:00`),
          end: new Date(`${session.session_date}T${session.end_time}:00`)
        });
      }
    }

    const { data: trialBookings } = await supabase
      .from('trial_class_bookings')
      .select('*')
      .eq('room_id', roomId)
      .gte('selected_date', startDateStr)
      .lte('selected_date', endDateStr)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')')
      .eq('is_converted', false);

    if (trialBookings) {
      for (const trialItem of trialBookings) {
        if (trialItem.selected_date && trialItem.selected_time) {
          const dateKey = trialItem.selected_date;
          if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
          const tStart = new Date(`${trialItem.selected_date}T${trialItem.selected_time}:00`);
          const tEnd = new Date(tStart);
          tEnd.setHours(tStart.getHours() + (trialItem.hours || 2));
          conflictMap[dateKey].push({ start: tStart, end: tEnd });
        }
      }
    }

    const { data: roomBookings } = await supabase
      .from('room_bookings')
      .select('*')
      .eq('room_id', roomId)
      .gte('start_time', startDateStr + 'T00:00:00')
      .lte('start_time', endDateStr + 'T23:59:59')
      .in('status', ['confirmed', 'pending']);

    if (roomBookings) {
      for (const booking of roomBookings) {
        const dateKey = String(booking.start_time).slice(0, 10);
        if (!conflictMap[dateKey]) conflictMap[dateKey] = [];
        conflictMap[dateKey].push({
          start: new Date(booking.start_time.replace(' ', 'T')),
          end: new Date(booking.end_time.replace(' ', 'T'))
        });
      }
    }

    return conflictMap;
  }

  async function generateSchedule() {
    if (!trial) { alert('No trial data found.'); return; }
    const teacherId = trial.selected_teacher_id;
    if (!teacherId) { alert('No teacher assigned to this trial.'); return; }
    const roomId = trial.room_id;
    if (!roomId) { alert('No room assigned to this trial.'); return; }
    if (numberOfSessions < 1) { alert('Please enter at least 1 session.'); return; }
    if (numberOfSessions > 30) { alert('Maximum 30 sessions allowed.'); return; }

    const availableDays = getAvailableDays();
    if (availableDays.length === 0) { alert('Please select at least one preferred day.'); return; }

    setGenerating(true);
    setShowSchedule(false);
    setGeneratedSessions([]);

    try {
      const startDate = new Date(trial.start_date || trial.selected_date);
      const startDateStr = formatLocalDate(startDate);

      const { data: availability, error: availError } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId)
        .eq('is_active', true);

      if (availError) throw new Error('Failed to fetch teacher availability: ' + availError.message);
      if (!availability || availability.length === 0) {
        alert('Teacher availability not found.');
        setGenerating(false);
        return;
      }

      const { data: leaves } = await supabase
        .from('staff_leaves')
        .select('*')
        .eq('staff_id', teacherId)
        .eq('is_active', true)
        .gte('end_date', startDateStr);

      const leaveDates = new Set<string>();
      if (leaves) {
        for (const leave of leaves) {
          let currentDate = new Date(leave.start_date);
          const endDate = new Date(leave.end_date);
          while (currentDate <= endDate) {
            leaveDates.add(formatLocalDate(currentDate));
            currentDate = addDays(currentDate, 1);
          }
        }
      }

      const endDateLimit = addDays(startDate, 180);
      const teacherConflicts = await buildTeacherConflictMap(teacherId, startDate, endDateLimit);
      const roomConflicts = await buildRoomConflictMap(roomId, startDate, endDateLimit);

      const teacherAvailabilityByDay: Record<number, { start_time: string; end_time: string }[]> = {};
      for (const avail of availability) {
        if (!teacherAvailabilityByDay[avail.day_of_week]) teacherAvailabilityByDay[avail.day_of_week] = [];
        teacherAvailabilityByDay[avail.day_of_week].push({
          start_time: avail.start_time,
          end_time: avail.end_time
        });
      }

      const studentAvailabilityMap: Record<number, { start_time: string; end_time: string }> = {};
      for (const day of dayAvailability) {
        if (day.available) {
          studentAvailabilityMap[day.day] = { start_time: day.start_time, end_time: day.end_time };
        }
      }

      const teacherDays = Object.keys(teacherAvailabilityByDay).map(Number);
      const studentDays = Object.keys(studentAvailabilityMap).map(Number);
      const commonDays = studentDays.filter(day => teacherDays.includes(day));

      if (commonDays.length === 0) {
        alert('⚠️ No matching days found between teacher availability and student preferences.');
        setGenerating(false);
        return;
      }

      const sessions: any[] = [];
      let sessionCount = 0;
      let currentDate = new Date(startDate);
      let attempts = 0;
      const maxAttempts = 365;

      while (sessionCount < numberOfSessions && attempts < maxAttempts) {
        attempts++;
        const dayOfWeek = currentDate.getDay();
        const dateStr = formatLocalDate(currentDate);

        if (!commonDays.includes(dayOfWeek)) { currentDate = addDays(currentDate, 1); continue; }
        if (leaveDates.has(dateStr)) { currentDate = addDays(currentDate, 1); continue; }

        const studentDay = studentAvailabilityMap[dayOfWeek];
        const teacherSlots = teacherAvailabilityByDay[dayOfWeek] || [];
        if (!studentDay || teacherSlots.length === 0) { currentDate = addDays(currentDate, 1); continue; }

        const teacherBookedSlots = teacherConflicts[dateStr] || [];
        const roomBookedSlots = roomConflicts[dateStr] || [];

        let foundSlot = null;

        for (const teacherSlot of teacherSlots) {
          const actualStart = teacherSlot.start_time > studentDay.start_time ? teacherSlot.start_time : studentDay.start_time;
          const actualEnd = teacherSlot.end_time < studentDay.end_time ? teacherSlot.end_time : studentDay.end_time;

          const startHour = parseInt(actualStart.split(':')[0]);
          const startMinute = parseInt(actualStart.split(':')[1] || '0');
          const endHour = parseInt(actualEnd.split(':')[0]);
          const endMinute = parseInt(actualEnd.split(':')[1] || '0');

          const availableMinutes = (endHour - startHour) * 60 + (endMinute - startMinute);
          const sessionMinutes = hoursPerSession * 60;
          if (availableMinutes < sessionMinutes) continue;

          const latestStartMinutes = (endHour * 60 + endMinute) - sessionMinutes;
          const latestStartHour = Math.floor(latestStartMinutes / 60);
          const latestStartMin = latestStartMinutes % 60;

          let slotStart = new Date(currentDate);
          slotStart.setHours(startHour, startMinute, 0, 0);
          let found = false;

          while (
            (slotStart.getHours() < latestStartHour ||
              (slotStart.getHours() === latestStartHour && slotStart.getMinutes() <= latestStartMin)) &&
            !found
          ) {
            const slotEnd = new Date(slotStart);
            slotEnd.setHours(slotStart.getHours() + hoursPerSession, slotStart.getMinutes(), 0, 0);

            const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
            const overlapEndMinutes = endHour * 60 + endMinute;

            if (slotEndMinutes > overlapEndMinutes) {
              slotStart.setMinutes(slotStart.getMinutes() + 15);
              continue;
            }

            const hasTeacherConflict = teacherBookedSlots.some((b: any) => slotStart < b.end && slotEnd > b.start);
            if (hasTeacherConflict) {
              slotStart.setMinutes(slotStart.getMinutes() + 15);
              continue;
            }

            const hasRoomConflict = roomBookedSlots.some((b: any) => slotStart < b.end && slotEnd > b.start);
            if (!hasRoomConflict) {
              foundSlot = {
                session_number: sessionCount + 1,
                session_date: dateStr,
                start_time: format(slotStart, 'HH:mm'),
                end_time: format(slotEnd, 'HH:mm'),
                room_id: roomId,
                room_name: roomName
              };
              found = true;
              break;
            }

            slotStart.setMinutes(slotStart.getMinutes() + 15);
          }

          if (found) break;
        }

        if (foundSlot) {
          sessions.push(foundSlot);
          sessionCount++;
        }
        currentDate = addDays(currentDate, 1);
      }

      if (sessions.length < numberOfSessions) {
        alert(`⚠️ Only ${sessions.length} sessions could be generated out of ${numberOfSessions}.`);
        setGenerating(false);
        return;
      }

      setGeneratedSessions(sessions);
      setShowSchedule(true);

    } catch (err: any) {
      console.error('Error generating schedule:', err);
      alert('Error generating schedule: ' + err.message);
    }

    setGenerating(false);
  }

  // ==========================================
  // REGISTER GROUP — v3.14b: add attendance rows
  // ==========================================
  async function handleRegisterGroup() {
    if (!selectedGroupClassId) { alert('Please select a group class.'); return; }
    if (!trial?.student_id) { alert('No student assigned to this trial.'); return; }

    setSubmitting(true);

    try {
      const { data: group, error: gError } = await supabase
        .from('scheduled_group_classes')
        .select('*')
        .eq('id', selectedGroupClassId)
        .single();

      if (gError || !group) throw new Error('Group class not found');

      const { data: existingEnrollment } = await supabase
        .from('group_class_enrollments')
        .select('id')
        .eq('group_class_id', selectedGroupClassId)
        .eq('student_id', trial.student_id)
        .eq('status', 'active')
        .maybeSingle();

      if (existingEnrollment) {
        alert('⚠️ Student is already enrolled in this group class. Marking trial as converted.');
        await convertTrialBooking(trialId!, selectedGroupClassId, 'group');
        router.push(`/dashboard/classes/group-class/view?id=${selectedGroupClassId}`);
        return;
      }

      if ((group.current_students || 0) >= (group.max_students || 0)) {
        throw new Error('This group class is now full. Please pick another.');
      }

      const nowIso = new Date().toISOString();
      const { error: enrollError } = await supabase
        .from('group_class_enrollments')
        .insert({
          group_class_id: selectedGroupClassId,
          student_id: trial.student_id,
          status: 'active',
          enrollment_date: nowIso,
        });

      if (enrollError) {
        throw new Error('Failed to enroll student: ' + enrollError.message);
      }

      // ⭐ v3.14b: attendance rows for future group sessions
      await onStudentEnrolledInGroup(selectedGroupClassId, trial.student_id);

      const { error: countError } = await supabase
        .from('scheduled_group_classes')
        .update({ current_students: (group.current_students || 0) + 1 })
        .eq('id', selectedGroupClassId);

      if (countError) {
        console.warn('⚠️ Could not increment student count:', countError.message);
      }

      const convResult = await convertTrialBooking(trialId!, selectedGroupClassId, 'group');
      if (!convResult.success) {
        alert(
          `⚠️ Student enrolled but trial was not marked as converted.\n\n` +
          `Reason: ${convResult.error}`
        );
        router.push(`/dashboard/classes/group-class/view?id=${selectedGroupClassId}`);
        return;
      }

      alert(
        `✅ Student registered for group class successfully!\n` +
        `Class: ${group.class_name || 'Group Class'}\n` +
        `Student: ${student?.full_name || 'Unknown'}`
      );
      router.push(`/dashboard/classes/group-class/view?id=${selectedGroupClassId}`);

    } catch (err: any) {
      console.error('Group register error:', err);
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // REGISTER PRIVATE
  // ==========================================
  async function handleRegisterPrivate() {
    if (generatedSessions.length === 0) { alert('Please generate a schedule first.'); return; }

    setCheckingConflicts(true);

    try {
      const formattedSessions = generatedSessions.map(s => ({
        session_number: s.session_number || 0,
        session_date: s.session_date,
        start_time: s.start_time,
        end_time: s.end_time,
        room_id: s.room_id,
        room_name: s.room_name,
      }));

      const teacherIds = trial?.selected_teacher_id ? [trial.selected_teacher_id] : [];
      const teacherNamesById: Record<string, string> = {};
      if (trial?.selected_teacher_id && teacher) {
        teacherNamesById[trial.selected_teacher_id] = teacher.full_name;
      }

      const conflicts = await detectAllConflicts({
        sessions: formattedSessions,
        teacherIds,
        roomId: trial?.room_id,
        teacherNamesById,
      });

      setCheckingConflicts(false);

      const { teacherConflicts, roomConflicts } = splitConflicts(conflicts);

      if (roomConflicts.length > 0) {
        let msg = '⚠️ Room conflicts detected!\n\n';
        roomConflicts.forEach((c, i) => {
          msg += `${i + 1}. Session #${c.session.session_number} on ${c.date} at ${c.time}\n   → ${c.description}\n`;
        });
        msg += '\nPlease adjust the schedule before continuing.';
        alert(msg);
        return;
      }

      if (teacherConflicts.length > 0) {
        const infoList = buildConflictInfoList(teacherConflicts).map(info => ({
          ...info,
          teacherPhone: teacher?.phone,
          teacherEmail: teacher?.email,
          teacherType: teacher?.teacher_type,
        }));
        setDetectedConflicts(infoList);
        setShowConflictModal(true);
        return;
      }

      await finalizePrivateRegistration('create_as_is', []);
    } catch (err: any) {
      setCheckingConflicts(false);
      alert('Error: ' + err.message);
    }
  }

  // ==========================================
  // FINALIZE PRIVATE REGISTRATION — v3.14b: attendance rows + student_id
  // ==========================================
  async function finalizePrivateRegistration(
    choice: ConflictResolutionChoice,
    flaggedNumbers: number[]
  ) {
    setSubmitting(true);

    try {
      const sessionsToCreate = choice === 'skip_conflicting'
        ? generatedSessions.filter(s => !flaggedNumbers.includes(s.session_number || 0))
        : generatedSessions;

      if (sessionsToCreate.length === 0) {
        alert('⚠️ Cannot create class — all sessions were conflicting.');
        setSubmitting(false);
        setShowConflictModal(false);
        return;
      }

      const classCode = generateClassCode('private');
      setConvertedClassCode(classCode);

      const { data: newClass, error: classError } = await supabase
        .from('classes')
        .insert({
          class_code: classCode,
          course_id: trial?.course_id,
          module_id: trial?.module_id,
          student_id: trial?.student_id ?? null,
          teacher_id: trial?.selected_teacher_id,
          room_id: trial?.room_id || null,
          max_students: 1,
          total_sessions: sessionsToCreate.length,
          status: 'active',
          class_type: 'private',
          source_type: 'trial_to_register',
          trial_booking_id: trialId,
        })
        .select()
        .single();

      if (classError) {
        console.error('Class creation error:', classError);
        throw new Error('Failed to create class: ' + classError.message);
      }

      const insertedBookings: any[] = [];

      for (let i = 0; i < sessionsToCreate.length; i++) {
        const session = sessionsToCreate[i];

        const startTs = makeTimestamp(session.session_date, session.start_time);
        const [sh, sm] = session.start_time.slice(0, 5).split(':').map(Number);
        const endTotal = sh * 60 + sm + hoursPerSession * 60;
        const endH = Math.floor(endTotal / 60) % 24;
        const endM = endTotal % 60;
        const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        const endTs = makeTimestamp(session.session_date, endTimeStr);

        await supabase.from('class_options').insert({
          class_id: newClass.id,
          teacher_id: trial?.selected_teacher_id,
          room_id: session.room_id || trial?.room_id,
          start_time: startTs,
          end_time: endTs,
          session_index: i + 1,
        });

        const { data: booking } = await supabase
          .from('bookings')
          .insert({
            room_id: session.room_id || trial?.room_id,
            teacher_id: trial?.selected_teacher_id,
            course_id: trial?.course_id,
            student_id: trial?.student_id || null,
            start_time: startTs,
            end_time: endTs,
            status: 'confirmed',
            class_id: newClass.id,
          })
          .select()
          .single();

        if (booking) insertedBookings.push({ ...booking, session_number: session.session_number });
      }

      await supabase.from('class_enrollments').insert({
        class_id: newClass.id,
        student_id: trial?.student_id || null,
        status: 'active'
      });

      // ⭐ v3.14b: attendance rows for each new booking
      for (const b of insertedBookings) {
        await createAttendanceForBooking(b.id, b.teacher_id, b.student_id);
      }

      if (choice === 'create_as_is' && flaggedNumbers.length > 0) {
        const substituteInputs: SubstituteAssignmentInput[] = [];
        const flagPromises: Promise<boolean>[] = [];

        for (const booking of insertedBookings) {
          if (!flaggedNumbers.includes(booking.session_number)) continue;

          const session = generatedSessions.find(s => s.session_number === booking.session_number);
          if (!session) continue;

          flagPromises.push(flagSessionNeedsAttention('bookings', booking.id, 'teacher_conflict'));

          substituteInputs.push({
            session_type: 'private_session',
            session_id: booking.id,
            original_teacher_id: trial?.selected_teacher_id || null,
            class_id: newClass.id,
            course_id: trial?.course_id || null,
            module_id: trial?.module_id || null,
            room_id: session.room_id || null,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
          });
        }

        await Promise.all(flagPromises);
        await createBulkSubstituteAssignments(substituteInputs);
      }

      const convResult = await convertTrialBooking(trialId!, newClass.id, 'private');
      if (!convResult.success) {
        setSubmitting(false);
        alert(
          `⚠️ Class created but trial was not marked as converted.\n\n` +
          `Reason: ${convResult.error}\n\nClass Code: ${classCode}`
        );
        router.push('/dashboard/classes/management');
        return;
      }

      setSubmitting(false);
      setShowConflictModal(false);
      setDetectedConflicts([]);

      const extraInfo = flaggedNumbers.length > 0
        ? `\n\n⚠️ ${flaggedNumbers.length} session(s) flagged for substitute assignment.`
        : '';

      alert(`✅ ${sessionsToCreate.length} sessions scheduled successfully!\nClass Code: ${classCode}${extraInfo}`);
      router.push('/dashboard/classes/management');

    } catch (err: any) {
      console.error('Registration error:', err);
      alert('Error: ' + err.message);
      setSubmitting(false);
    }
  }

  // ==========================================
  // RENDER: DAY AVAILABILITY
  // ==========================================
  const renderDayAvailability = () => {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Student's Weekly Availability *
        </label>
        <div className="space-y-2">
          {daysOfWeek.map((day) => {
            const dayData = getDayAvailability(day.value);
            if (!dayData) return null;

            return (
              <div key={day.value} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`w-24 text-left text-sm font-medium transition ${
                    dayData.available ? 'text-blue-600' : 'text-gray-400'
                  }`}
                >
                  {day.label}
                </button>

                {dayData.available ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-500">From</span>
                    <input
                      type="time"
                      step="900"
                      value={dayData.start_time}
                      onChange={(e) => updateDayTime(day.value, 'start_time', e.target.value)}
                      className="px-2 py-1 border rounded text-sm w-28 bg-white focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">To</span>
                    <input
                      type="time"
                      step="900"
                      value={dayData.end_time}
                      onChange={(e) => updateDayTime(day.value, 'end_time', e.target.value)}
                      className="px-2 py-1 border rounded text-sm w-28 bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Not available</span>
                )}
              </div>
            );
          })}
        </div>
        {getAvailableDays().length === 0 && (
          <p className="text-xs text-red-500 mt-1">⚠️ Please select at least one day</p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !trial) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/classes/management">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <p className="text-yellow-700">{error || 'Trial booking not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">📝 Trial → Class Registration</h1>
        {convertedClassCode && (
          <span className="ml-4 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-mono">
            Class: {convertedClassCode}
          </span>
        )}
      </div>

      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200 mb-6">
        <h3 className="font-semibold text-blue-800 mb-4">📋 Trial Booking Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Student</span>
            <span className="font-medium text-blue-800">{student?.full_name || 'Not assigned'}</span>
            <span className="text-xs text-blue-600 block">{student?.email || ''}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Course</span>
            <span className="font-medium text-blue-800">{courseName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Module</span>
            <span className="font-medium text-blue-800">{moduleName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Level</span>
            <span className="font-medium text-blue-800 capitalize">{level || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Type</span>
            <span className="font-medium text-blue-800 capitalize">{trial.session_type}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Teacher</span>
            {teacher ? (
              <div className="mt-0.5">
                <TeacherContactInfo
                  fullName={teacher.full_name}
                  phone={teacher.phone}
                  email={teacher.email}
                  teacherType={teacher.teacher_type}
                />
              </div>
            ) : (
              <span className="font-medium text-blue-800">N/A</span>
            )}
          </div>
          <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
            <span className="text-yellow-700 text-xs uppercase tracking-wider block">Room</span>
            <span className="font-medium text-yellow-800">{roomName || '⚠️ No room assigned'}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Trial Date</span>
            <span className="font-medium text-blue-800">
              {format(parseISO(trial.selected_date), 'MMMM d, yyyy')}
            </span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Trial Time</span>
            <span className="font-medium text-blue-800">{trial.selected_time || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Duration</span>
            <span className="font-medium text-blue-800">{trial.hours || 2} hours</span>
          </div>
          <div>
            <span className="text-blue-600 text-xs uppercase tracking-wider block">Status</span>
            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
              {trial.status || 'Active'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Choose Registration Type</h2>
        <div className="flex gap-4">
          <button
            onClick={() => setRegistrationType('private')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition ${
              registrationType === 'private'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:border-blue-300'
            }`}
          >
            <div className="font-semibold">Private Lesson</div>
            <div className="text-sm text-gray-500">Generate individual schedule</div>
          </button>
          <button
            onClick={() => setRegistrationType('group')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition ${
              registrationType === 'group'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:border-blue-300'
            }`}
          >
            <div className="font-semibold">Group Session</div>
            <div className="text-sm text-gray-500">Join existing group class</div>
          </button>
        </div>
      </div>

      {registrationType === 'group' ? (
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 space-y-6">
          <h2 className="text-lg font-bold text-gray-800">Select Group Class</h2>

          {availableGroupClasses.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
              <p className="font-medium">No group classes available</p>
              <p className="text-sm mt-1">
                No active group classes were found for this course. You can still register the student as a private lesson above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableGroupClasses.map((gc) => {
                const isSelected = selectedGroupClassId === gc.id;
                const isTarget = gc.is_trial_target;
                return (
                  <div
                    key={gc.id}
                    onClick={() => setSelectedGroupClassId(gc.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                      isSelected
                        ? isTarget
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-blue-600 bg-blue-50'
                        : isTarget
                          ? 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-500'
                          : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {isTarget && (
                          <span className="inline-block mb-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded-full">
                            🎯 THE CLASS STUDENT TRIALED WITH
                          </span>
                        )}
                        <div className="font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                          <span>{gc.class_name || 'Group Class'}</span>
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                            {gc.status}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                            {gc.available_spots} spot{gc.available_spots !== 1 ? 's' : ''} left
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                          <div><span className="text-gray-500">Course:</span> <span className="font-medium">{gc.course_name || '—'}</span></div>
                          <div><span className="text-gray-500">Module:</span> <span className="font-medium">{gc.module_name || '—'}</span></div>
                          <div><span className="text-gray-500">Dates:</span> <span className="font-medium">{gc.start_date} → {gc.end_date}</span></div>
                          <div><span className="text-gray-500">Time:</span> <span className="font-medium">{gc.start_time} - {gc.end_time}</span></div>
                        </div>

                        {gc.teacher_contacts && gc.teacher_contacts.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">Teacher(s):</div>
                            <div className="space-y-1">
                              {gc.teacher_contacts.map(t => (
                                <TeacherContactInfo
                                  key={t.id}
                                  fullName={t.full_name}
                                  phone={t.phone}
                                  email={t.email}
                                  teacherType={t.teacher_type}
                                  compact
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-sm font-medium text-gray-700">
                          {gc.current_students}/{gc.max_students} students
                        </div>
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
                          <div
                            className="h-1.5 bg-blue-600 rounded-full"
                            style={{ width: `${(gc.current_students / gc.max_students) * 100}%` }}
                          />
                        </div>
                        {isSelected && (
                          <div className="mt-2 text-xs font-semibold text-blue-700">✓ Selected</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={handleRegisterGroup}
              disabled={submitting || !selectedGroupClassId || availableGroupClasses.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Registering...
                </>
              ) : (
                '✅ Register for Group Class'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 space-y-6">
          <h2 className="text-lg font-bold text-gray-800">Configure Private Schedule</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Hours per Session</label>
              <select
                value={hoursPerSession}
                onChange={(e) => setHoursPerSession(parseFloat(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value={0.5}>0.5 hours</option>
                <option value={1}>1 hour</option>
                <option value={1.5}>1.5 hours</option>
                <option value={2}>2 hours</option>
                <option value={2.5}>2.5 hours</option>
                <option value={3}>3 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Number of Sessions</label>
              <input
                type="number"
                value={numberOfSessions}
                onChange={(e) => setNumberOfSessions(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-lg bg-white"
                min={1}
                max={30}
              />
              <p className="text-xs text-gray-400 mt-1">Max 30 sessions</p>
            </div>
          </div>

          {renderDayAvailability()}

          <div className="flex justify-end">
            <button
              onClick={generateSchedule}
              disabled={generating || getAvailableDays().length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {generating ? 'Generating...' : '🔄 Generate Schedule Preview'}
            </button>
          </div>

          {showSchedule && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-700 mb-3">
                📅 Generated Schedule ({generatedSessions.length} sessions)
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {generatedSessions.map((session, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">#{idx + 1}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {format(parseISO(session.session_date), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {session.start_time} - {session.end_time}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                            {session.room_name || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleRegisterPrivate}
                  disabled={submitting || generatedSessions.length === 0 || checkingConflicts}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {checkingConflicts ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Checking conflicts...
                    </>
                  ) : submitting ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Registering...
                    </>
                  ) : (
                    '✅ Register Private Class'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConflictResolutionModal
        isOpen={showConflictModal}
        conflicts={detectedConflicts}
        totalSessions={generatedSessions.length}
        onCancel={() => {
          setShowConflictModal(false);
          setDetectedConflicts([]);
        }}
        onConfirm={(choice) => {
          const flaggedNumbers = detectedConflicts.map(c => c.session_number);
          finalizePrivateRegistration(choice, flaggedNumbers);
        }}
      />
    </div>
  );
}