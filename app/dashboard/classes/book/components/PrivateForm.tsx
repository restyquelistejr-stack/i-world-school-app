// app/dashboard/classes/book/components/PrivateForm.tsx
// ⭐ PHASE 2: Room auto-resolution + teacher conflict modal
// ⭐ v3.9: Teacher contact info (phone, email, type) visible everywhere
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { BookingData, DAYS_OF_WEEK, GeneratedSession } from '../types';
import { format, addDays, parseISO } from 'date-fns';
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
import { findFreeRoomForSlot } from '@/lib/roomResolutionService';
import { formatLocalDate } from '@/lib/timeUtils';

// ==========================================
// INTERFACES
// ==========================================
interface PrivateFormProps {
  data: BookingData;
  onChange: (field: string, value: any) => void;
  onBack: () => void;
  onContinue: () => void;
  isTrial: boolean;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  teacher_type?: string;
  specialization?: string;
  years_experience?: number;
  hourly_rate?: number;
  profile_headline?: string;
  bio?: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

interface DayAvailability {
  day: number;
  isAvailable: boolean;
  start_time: string;
  end_time: string;
}

interface AvailableSlot {
  teacher_id: string;
  teacher_name: string;
  room_id: string;
  room_name: string;
  date: string;
  start_time: string;
  end_time: string;
  session_number: number;
  match_score: number;
}

interface TeacherSchedule {
  teacher_id: string;
  teacher_name: string;
  sessions: AvailableSlot[];
  totalSessions: number;
  coverage: number;
}

export default function PrivateForm({
  data,
  onChange,
  onBack,
  onContinue,
  isTrial
}: PrivateFormProps) {
  // ==========================================
  // STATE
  // ==========================================
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [teacherOptions, setTeacherOptions] = useState<TeacherSchedule[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [generatedSessions, setGeneratedSessions] = useState<AvailableSlot[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [teacherProfiles, setTeacherProfiles] = useState<Record<string, Teacher>>({});

  const [dayAvailability, setDayAvailability] = useState<DayAvailability[]>([
    { day: 0, isAvailable: false, start_time: '09:00', end_time: '17:00' },
    { day: 1, isAvailable: true, start_time: '09:00', end_time: '17:00' },
    { day: 2, isAvailable: true, start_time: '09:00', end_time: '17:00' },
    { day: 3, isAvailable: true, start_time: '09:00', end_time: '17:00' },
    { day: 4, isAvailable: true, start_time: '09:00', end_time: '17:00' },
    { day: 5, isAvailable: true, start_time: '09:00', end_time: '17:00' },
    { day: 6, isAvailable: false, start_time: '09:00', end_time: '17:00' },
  ]);

  const [hoursPerSession, setHoursPerSession] = useState(2);
  const [numberOfSessions, setNumberOfSessions] = useState(10);
  const [startDate, setStartDate] = useState<string>('');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courseName, setCourseName] = useState('');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ConflictSessionInfo[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // LOAD INITIAL DATA
  // ==========================================
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name, capacity')
        .eq('is_active', true)
        .order('name');
      setRooms(roomsData || []);

      const { data: teachersData } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'teacher')
        .eq('is_active', true)
        .order('full_name');
      setTeachers(teachersData || []);

      const { data: profilesData } = await supabase
        .from('teachers')
        .select('*')
        .eq('is_active', true);

      if (profilesData) {
        const profileMap: Record<string, Teacher> = {};
        profilesData.forEach((p: any) => {
          const teacher = teachersData?.find((t: any) => t.id === p.id);
          if (teacher) {
            profileMap[p.id] = {
              id: p.id,
              full_name: teacher.full_name || '',
              email: teacher.email || '',
              phone: teacher.phone || '',
              teacher_type: p.teacher_type || '',
              specialization: p.specialization || '',
              years_experience: p.years_experience || 0,
              hourly_rate: p.hourly_rate || 0,
              profile_headline: p.profile_headline || '',
              bio: p.bio || '',
            };
          }
        });
        setTeacherProfiles(profileMap);
      }

      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      setStartDate(format(defaultDate, 'yyyy-MM-dd'));

      if (data.course_id) {
        const { data: course } = await supabase
          .from('courses')
          .select('name')
          .eq('id', data.course_id)
          .single();
        if (course) setCourseName(course.name);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  // ==========================================
  // AVAILABILITY FUNCTIONS
  // ==========================================
  const updateDayAvailability = useCallback((dayIndex: number, field: keyof DayAvailability, value: any) => {
    const updated = [...dayAvailability];
    updated[dayIndex] = { ...updated[dayIndex], [field]: value };
    setDayAvailability(updated);
  }, [dayAvailability]);

  const toggleDay = useCallback((dayIndex: number) => {
    const updated = [...dayAvailability];
    updated[dayIndex] = {
      ...updated[dayIndex],
      isAvailable: !updated[dayIndex].isAvailable
    };
    setDayAvailability(updated);
  }, [dayAvailability]);

  const toggleExpandTeacher = useCallback((teacherId: string) => {
    setExpandedTeacher(expandedTeacher === teacherId ? null : teacherId);
  }, [expandedTeacher]);

  // ==========================================
  // GET QUALIFIED TEACHERS
  // ==========================================
  const getQualifiedTeachers = useCallback(async () => {
    if (!data.course_id) return [];

    let qualifiedTeacherIds: string[] = [];

    if (data.module_id) {
      const { data: moduleTeachers } = await supabase
        .from('teacher_modules')
        .select('teacher_id')
        .eq('module_id', data.module_id)
        .eq('is_active', true);
      if (moduleTeachers && moduleTeachers.length > 0) {
        qualifiedTeacherIds = moduleTeachers.map(t => t.teacher_id);
      }
    }

    if (qualifiedTeacherIds.length === 0 && data.course_id) {
      const { data: courseTeachers } = await supabase
        .from('staff_courses')
        .select('staff_id')
        .eq('course_id', data.course_id)
        .eq('is_active', true);
      if (courseTeachers && courseTeachers.length > 0) {
        qualifiedTeacherIds = courseTeachers.map(t => t.staff_id);
      }
    }

    if (qualifiedTeacherIds.length === 0) {
      const { data: allTeachers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'teacher')
        .eq('is_active', true);
      if (allTeachers) {
        qualifiedTeacherIds = allTeachers.map(t => t.id);
      }
    }

    return qualifiedTeacherIds;
  }, [data.course_id, data.module_id]);

  // ==========================================
  // HELPERS
  // ==========================================
  const normalizeTime = useCallback((timeStr: string): string => {
    let time = timeStr;
    if (time.includes(':')) {
      const parts = time.split(':');
      time = parts[0] + ':' + parts[1];
    }
    return time;
  }, []);

  const hasSlotConflict = useCallback((
    slotStart: Date,
    slotEnd: Date,
    bookings: { start: Date; end: Date }[]
  ): boolean => {
    return bookings.some((b) => (slotStart < b.end && slotEnd > b.start));
  }, []);

  const findAvailableRoom = useCallback((
    slotStart: Date,
    slotEnd: Date,
    roomIds: string[],
    roomBookingsByRoom: Record<string, { start: Date; end: Date }[]>,
    usedRoomsOnDate: Set<string>
  ): Room | null => {
    for (const roomId of roomIds) {
      if (usedRoomsOnDate.has(roomId)) continue;
      const roomBookingsList = roomBookingsByRoom[roomId] || [];
      const hasRoomConflict = hasSlotConflict(slotStart, slotEnd, roomBookingsList);
      if (!hasRoomConflict) {
        const room = rooms.find(r => r.id === roomId);
        if (room) return room;
      }
    }
    return null;
  }, [rooms, hasSlotConflict]);

  // ==========================================
  // GENERATE FULL SCHEDULE
  // ==========================================
  const generateFullSchedule = useCallback(async (
    teacherId: string,
    teacherName: string,
    startDateTime: Date,
    totalSessions: number,
    dayAvailability: DayAvailability[],
    teacherAvailability: any,
    leaveDatesByTeacher: any,
    bookingsByTeacher: any,
    roomBookingsByRoom: any
  ): Promise<AvailableSlot[]> => {
    const sessions: AvailableSlot[] = [];
    let currentDate = new Date(startDateTime);
    let sessionCount = 0;
    let attempts = 0;
    const maxAttempts = 365 * 2;

    const studentAvailableDays = dayAvailability
      .filter(d => d.isAvailable)
      .reduce((acc, d) => {
        acc[d.day] = { start: d.start_time, end: d.end_time };
        return acc;
      }, {} as Record<number, { start: string; end: string }>);

    const teacherAvailByDay = teacherAvailability[teacherId] || {};
    const roomIds = rooms.map(r => r.id);
    const roomsUsedPerDate: Record<string, Set<string>> = {};

    while (sessionCount < totalSessions && attempts < maxAttempts) {
      attempts++;
      const dayOfWeek = currentDate.getDay();
      const dateStr = formatLocalDate(currentDate);

      const studentDay = studentAvailableDays[dayOfWeek];
      if (!studentDay) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      if (leaveDatesByTeacher[teacherId]?.has(dateStr)) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      const availSlots = teacherAvailByDay[dayOfWeek] || [];
      if (availSlots.length === 0) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      if (!roomsUsedPerDate[dateStr]) {
        roomsUsedPerDate[dateStr] = new Set();
      }

      let foundSlot = null;
      for (const avail of availSlots) {
        let availStart = normalizeTime(avail.start);
        let availEnd = normalizeTime(avail.end);

        const overlapStart = availStart > studentDay.start ? availStart : studentDay.start;
        const overlapEnd = availEnd < studentDay.end ? availEnd : studentDay.end;

        if (overlapStart >= overlapEnd) continue;

        const overlapStartHour = parseInt(overlapStart.split(':')[0]);
        const overlapStartMin = parseInt(overlapStart.split(':')[1] || '0');
        const overlapEndHour = parseInt(overlapEnd.split(':')[0]);
        const overlapEndMin = parseInt(overlapEnd.split(':')[1] || '0');

        const availableMinutes = (overlapEndHour - overlapStartHour) * 60 + (overlapEndMin - overlapStartMin);
        const sessionMinutes = hoursPerSession * 60;

        if (availableMinutes < sessionMinutes) continue;

        const latestStartMinutes = (overlapEndHour * 60 + overlapEndMin) - sessionMinutes;
        const latestStartHour = Math.floor(latestStartMinutes / 60);
        const latestStartMin = latestStartMinutes % 60;

        let slotStart = new Date(currentDate);
        slotStart.setHours(overlapStartHour, overlapStartMin, 0, 0);

        let found = false;

        while ((slotStart.getHours() < latestStartHour ||
                (slotStart.getHours() === latestStartHour && slotStart.getMinutes() <= latestStartMin)) && !found) {

          const slotEnd = new Date(slotStart);
          slotEnd.setHours(slotStart.getHours() + hoursPerSession, slotStart.getMinutes(), 0, 0);

          const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
          const overlapEndMinutes = overlapEndHour * 60 + overlapEndMin;

          if (slotEndMinutes > overlapEndMinutes) {
            slotStart.setMinutes(slotStart.getMinutes() + 15);
            continue;
          }

          const teacherBookings = bookingsByTeacher[teacherId] || [];
          const hasTeacherConflict = hasSlotConflict(slotStart, slotEnd, teacherBookings);

          if (!hasTeacherConflict) {
            const availableRoom = findAvailableRoom(
              slotStart,
              slotEnd,
              roomIds,
              roomBookingsByRoom,
              roomsUsedPerDate[dateStr]
            );

            if (availableRoom) {
              foundSlot = {
                teacher_id: teacherId,
                teacher_name: teacherName,
                room_id: availableRoom.id,
                room_name: availableRoom.name,
                date: dateStr,
                start_time: format(slotStart, 'HH:mm'),
                end_time: format(slotEnd, 'HH:mm'),
                session_number: sessionCount + 1,
                match_score: 100
              };
              found = true;
              roomsUsedPerDate[dateStr].add(availableRoom.id);
              break;
            }
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

    return sessions;
  }, [rooms, hoursPerSession, hasSlotConflict, normalizeTime, findAvailableRoom]);

  // ==========================================
  // BUILD COMPLETE CONFLICT MAPS
  // ==========================================
  const buildConflictMaps = useCallback(async (
    startDateTime: Date,
    endDateTime: Date,
    qualifiedTeacherIds: string[]
  ) => {
    const startDateStr = formatLocalDate(startDateTime);
    const endDateStr = formatLocalDate(endDateTime);

    const { data: leavesData } = await supabase
      .from('staff_leaves')
      .select('*')
      .in('staff_id', qualifiedTeacherIds)
      .eq('is_active', true)
      .gte('end_date', startDateStr);

    const leaveDatesByTeacher: Record<string, Set<string>> = {};
    if (leavesData) {
      for (const leave of leavesData) {
        if (!leaveDatesByTeacher[leave.staff_id]) {
          leaveDatesByTeacher[leave.staff_id] = new Set();
        }
        let current = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        while (current <= end) {
          leaveDatesByTeacher[leave.staff_id].add(formatLocalDate(current));
          current = addDays(current, 1);
        }
      }
    }

    const { data: privateBookings } = await supabase
      .from('bookings')
      .select('*')
      .in('teacher_id', qualifiedTeacherIds)
      .gte('start_time', startDateTime.toISOString())
      .lte('start_time', endDateTime.toISOString())
      .in('status', ['confirmed', 'in_progress', 'pending']);

    const { data: groupSessionsForTeachers } = await supabase
      .from('group_class_sessions')
      .select('*')
      .in('teacher_id', qualifiedTeacherIds)
      .gte('session_date', startDateStr)
      .lte('session_date', endDateStr)
      .in('status', ['scheduled', 'ongoing']);

    const { data: trialBookingsForTeachers } = await supabase
      .from('trial_class_bookings')
      .select('*')
      .in('selected_teacher_id', qualifiedTeacherIds)
      .gte('selected_date', startDateStr)
      .lte('selected_date', endDateStr)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

    const { data: allPrivateBookingsForRooms } = await supabase
      .from('bookings')
      .select('room_id, start_time, end_time')
      .not('room_id', 'is', null)
      .gte('start_time', startDateTime.toISOString())
      .lte('start_time', endDateTime.toISOString())
      .in('status', ['confirmed', 'in_progress', 'pending']);

    const { data: allGroupSessionsForRooms } = await supabase
      .from('group_class_sessions')
      .select('room_id, session_date, start_time, end_time')
      .not('room_id', 'is', null)
      .gte('session_date', startDateStr)
      .lte('session_date', endDateStr)
      .in('status', ['scheduled', 'ongoing']);

    const { data: allTrialBookingsForRooms } = await supabase
      .from('trial_class_bookings')
      .select('room_id, selected_date, selected_time, hours')
      .not('room_id', 'is', null)
      .gte('selected_date', startDateStr)
      .lte('selected_date', endDateStr)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

    const { data: allRoomBookings } = await supabase
      .from('room_bookings')
      .select('room_id, start_time, end_time')
      .not('room_id', 'is', null)
      .gte('start_time', startDateTime.toISOString())
      .lte('start_time', endDateTime.toISOString())
      .in('status', ['confirmed', 'pending']);

    const bookingsByTeacher: Record<string, { start: Date; end: Date }[]> = {};

    if (privateBookings) {
      for (const booking of privateBookings) {
        if (!bookingsByTeacher[booking.teacher_id]) {
          bookingsByTeacher[booking.teacher_id] = [];
        }
        bookingsByTeacher[booking.teacher_id].push({
          start: new Date(booking.start_time),
          end: new Date(booking.end_time)
        });
      }
    }

    if (groupSessionsForTeachers) {
      for (const session of groupSessionsForTeachers) {
        if (session.teacher_id) {
          if (!bookingsByTeacher[session.teacher_id]) {
            bookingsByTeacher[session.teacher_id] = [];
          }
          const sessionStart = new Date(`${session.session_date}T${session.start_time}:00`);
          const sessionEnd = new Date(`${session.session_date}T${session.end_time}:00`);
          bookingsByTeacher[session.teacher_id].push({
            start: sessionStart,
            end: sessionEnd
          });
        }
      }
    }

    if (trialBookingsForTeachers) {
      for (const trial of trialBookingsForTeachers) {
        if (trial.selected_teacher_id && trial.selected_time) {
          if (!bookingsByTeacher[trial.selected_teacher_id]) {
            bookingsByTeacher[trial.selected_teacher_id] = [];
          }
          const trialStart = new Date(`${trial.selected_date}T${trial.selected_time}:00`);
          const trialEnd = new Date(trialStart);
          trialEnd.setHours(trialStart.getHours() + (trial.hours || 2));
          bookingsByTeacher[trial.selected_teacher_id].push({
            start: trialStart,
            end: trialEnd
          });
        }
      }
    }

    const roomBookingsByRoom: Record<string, { start: Date; end: Date }[]> = {};

    if (allRoomBookings) {
      for (const booking of allRoomBookings) {
        if (!roomBookingsByRoom[booking.room_id]) {
          roomBookingsByRoom[booking.room_id] = [];
        }
        roomBookingsByRoom[booking.room_id].push({
          start: new Date(booking.start_time),
          end: new Date(booking.end_time)
        });
      }
    }

    if (allPrivateBookingsForRooms) {
      for (const booking of allPrivateBookingsForRooms) {
        if (booking.room_id) {
          if (!roomBookingsByRoom[booking.room_id]) {
            roomBookingsByRoom[booking.room_id] = [];
          }
          roomBookingsByRoom[booking.room_id].push({
            start: new Date(booking.start_time),
            end: new Date(booking.end_time)
          });
        }
      }
    }

    if (allGroupSessionsForRooms) {
      for (const session of allGroupSessionsForRooms) {
        if (session.room_id) {
          if (!roomBookingsByRoom[session.room_id]) {
            roomBookingsByRoom[session.room_id] = [];
          }
          const sessionStart = new Date(`${session.session_date}T${session.start_time}:00`);
          const sessionEnd = new Date(`${session.session_date}T${session.end_time}:00`);
          roomBookingsByRoom[session.room_id].push({
            start: sessionStart,
            end: sessionEnd
          });
        }
      }
    }

    if (allTrialBookingsForRooms) {
      for (const trial of allTrialBookingsForRooms) {
        if (trial.room_id && trial.selected_time) {
          if (!roomBookingsByRoom[trial.room_id]) {
            roomBookingsByRoom[trial.room_id] = [];
          }
          const trialStart = new Date(`${trial.selected_date}T${trial.selected_time}:00`);
          const trialEnd = new Date(trialStart);
          trialEnd.setHours(trialStart.getHours() + (trial.hours || 2));
          roomBookingsByRoom[trial.room_id].push({
            start: trialStart,
            end: trialEnd
          });
        }
      }
    }

    return { leaveDatesByTeacher, bookingsByTeacher, roomBookingsByRoom };
  }, []);

  // ==========================================
  // FIND TEACHER OPTIONS - REGISTRATION MODE
  // ==========================================
  const findRegistrationOptions = useCallback(async () => {
    if (!data.course_id) {
      alert('Please select a course first.');
      return;
    }

    const availableDays = dayAvailability.filter(d => d.isAvailable);
    if (availableDays.length === 0) {
      alert('Please select at least one day when you are available.');
      return;
    }

    for (const day of availableDays) {
      if (day.start_time >= day.end_time) {
        const dayName = DAYS_OF_WEEK.find(d => d.value === day.day)?.label;
        alert(`Start time must be before end time for ${dayName}.`);
        return;
      }
    }

    if (!startDate) {
      alert('Please select a start date.');
      return;
    }

    setSearching(true);
    setShowResults(false);
    setTeacherOptions([]);
    setSelectedTeacherId(null);
    setGeneratedSessions([]);

    try {
      const startDateTime = new Date(startDate);
      const qualifiedTeacherIds = await getQualifiedTeachers();

      if (qualifiedTeacherIds.length === 0) {
        alert('No qualified teachers found for this course.');
        setSearching(false);
        return;
      }

      const { data: availabilityData } = await supabase
        .from('teacher_availability')
        .select('*')
        .in('teacher_id', qualifiedTeacherIds)
        .eq('is_active', true);

      if (!availabilityData || availabilityData.length === 0) {
        alert('No teacher availability found.');
        setSearching(false);
        return;
      }

      const oneYearLater = new Date(startDateTime);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      const { leaveDatesByTeacher, bookingsByTeacher, roomBookingsByRoom } = await buildConflictMaps(
        startDateTime,
        oneYearLater,
        qualifiedTeacherIds
      );

      const teacherAvailability: Record<string, Record<number, { start: string; end: string }[]>> = {};
      for (const avail of availabilityData) {
        if (!teacherAvailability[avail.teacher_id]) {
          teacherAvailability[avail.teacher_id] = {};
        }
        if (!teacherAvailability[avail.teacher_id][avail.day_of_week]) {
          teacherAvailability[avail.teacher_id][avail.day_of_week] = [];
        }
        teacherAvailability[avail.teacher_id][avail.day_of_week].push({
          start: avail.start_time,
          end: avail.end_time
        });
      }

      const teacherSchedules: TeacherSchedule[] = [];
      const batchSize = 5;

      for (let i = 0; i < qualifiedTeacherIds.length; i += batchSize) {
        const batch = qualifiedTeacherIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (teacherId) => {
          const teacherName = teachers.find(t => t.id === teacherId)?.full_name || 'Unknown';

          const schedule = await generateFullSchedule(
            teacherId,
            teacherName,
            startDateTime,
            numberOfSessions,
            dayAvailability,
            teacherAvailability,
            leaveDatesByTeacher,
            bookingsByTeacher,
            roomBookingsByRoom
          );

          if (schedule.length > 0) {
            return {
              teacher_id: teacherId,
              teacher_name: teacherName,
              sessions: schedule,
              totalSessions: numberOfSessions,
              coverage: schedule.length
            };
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((r): r is TeacherSchedule => r !== null);
        teacherSchedules.push(...validResults);
      }

      teacherSchedules.sort((a, b) => b.coverage - a.coverage);

      const minCoverage = Math.ceil(numberOfSessions * 0.5);
      const filteredSchedules = teacherSchedules.filter(t => t.coverage >= minCoverage);

      setTeacherOptions(filteredSchedules);

      if (filteredSchedules.length === 0) {
        alert(`No teacher can cover at least ${minCoverage} out of ${numberOfSessions} sessions. Please adjust your preferences.`);
        setShowResults(true);
        setSearching(false);
        return;
      }

      const bestTeacher = filteredSchedules[0];
      setSelectedTeacherId(bestTeacher.teacher_id);
      setGeneratedSessions(bestTeacher.sessions);
      setShowResults(true);

      const sessionsToSave: GeneratedSession[] = bestTeacher.sessions.map(slot => ({
        session_number: slot.session_number,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        teacher_id: slot.teacher_id,
        teacher_name: slot.teacher_name,
        room_id: slot.room_id,
        room_name: slot.room_name,
        match_score: slot.match_score
      }));

      onChange('generated_sessions', sessionsToSave);
      onChange('teacher_id', bestTeacher.teacher_id);
      onChange('room_id', bestTeacher.sessions[0]?.room_id);
      onChange('start_date', bestTeacher.sessions[0]?.date);
      onChange('start_time', bestTeacher.sessions[0]?.start_time);
      onChange('end_time', bestTeacher.sessions[0]?.end_time);
      onChange('hours_per_session', hoursPerSession);
      onChange('number_of_sessions', numberOfSessions);
      onChange('preferred_days', dayAvailability.filter(d => d.isAvailable).map(d => d.day));

    } catch (error: any) {
      console.error('Error finding options:', error);
      alert('Error: ' + error.message);
    }

    setSearching(false);
  }, [data.course_id, data.module_id, dayAvailability, startDate, numberOfSessions, teachers, hoursPerSession, onChange, getQualifiedTeachers, generateFullSchedule, buildConflictMaps]);

  // ==========================================
  // FIND TEACHER OPTIONS - TRIAL MODE
  // ==========================================
  const findTrialOptions = useCallback(async () => {
    if (!data.course_id) {
      alert('Please select a course first.');
      return;
    }

    const availableDays = dayAvailability.filter(d => d.isAvailable);
    if (availableDays.length === 0) {
      alert('Please select at least one day when you are available.');
      return;
    }

    for (const day of availableDays) {
      if (day.start_time >= day.end_time) {
        const dayName = DAYS_OF_WEEK.find(d => d.value === day.day)?.label;
        alert(`Start time must be before end time for ${dayName}.`);
        return;
      }
    }

    if (!startDate) {
      alert('Please select a start date.');
      return;
    }

    setSearching(true);
    setShowResults(false);
    setTeacherOptions([]);
    setSelectedTeacherId(null);
    setGeneratedSessions([]);

    try {
      const startDateTime = new Date(startDate);
      const qualifiedTeacherIds = await getQualifiedTeachers();

      if (qualifiedTeacherIds.length === 0) {
        alert('No qualified teachers found for this course.');
        setSearching(false);
        return;
      }

      const { data: availabilityData } = await supabase
        .from('teacher_availability')
        .select('*')
        .in('teacher_id', qualifiedTeacherIds)
        .eq('is_active', true);

      if (!availabilityData || availabilityData.length === 0) {
        alert('No teacher availability found.');
        setSearching(false);
        return;
      }

      const oneYearLater = new Date(startDateTime);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      const { leaveDatesByTeacher, bookingsByTeacher, roomBookingsByRoom } = await buildConflictMaps(
        startDateTime,
        oneYearLater,
        qualifiedTeacherIds
      );

      const teacherAvailability: Record<string, Record<number, { start_time: string; end_time: string }[]>> = {};
      for (const avail of availabilityData) {
        if (!teacherAvailability[avail.teacher_id]) {
          teacherAvailability[avail.teacher_id] = {};
        }
        if (!teacherAvailability[avail.teacher_id][avail.day_of_week]) {
          teacherAvailability[avail.teacher_id][avail.day_of_week] = [];
        }
        teacherAvailability[avail.teacher_id][avail.day_of_week].push({
          start_time: avail.start_time,
          end_time: avail.end_time
        });
      }

      const teacherSlotsMap: Record<string, AvailableSlot[]> = {};
      let currentDate = new Date(startDateTime);
      const searchEndDate = new Date(startDateTime);
      searchEndDate.setDate(searchEndDate.getDate() + 30);
      let attempts = 0;
      const maxAttempts = 30;

      while (currentDate <= searchEndDate && attempts < maxAttempts) {
        attempts++;
        const dayOfWeek = currentDate.getDay();
        const dateStr = formatLocalDate(currentDate);

        if (!dayAvailability[dayOfWeek]?.isAvailable) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        const studentDay = dayAvailability[dayOfWeek];
        if (!studentDay) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        const roomsUsedOnDate = new Set<string>();

        for (const teacherId of qualifiedTeacherIds) {
          if (teacherSlotsMap[teacherId] && teacherSlotsMap[teacherId].length >= 3) {
            continue;
          }

          if (leaveDatesByTeacher[teacherId]?.has(dateStr)) {
            continue;
          }

          const availSlots = teacherAvailability[teacherId]?.[dayOfWeek] || [];
          if (availSlots.length === 0) continue;

          for (const avail of availSlots) {
            let availStart = normalizeTime(avail.start_time);
            let availEnd = normalizeTime(avail.end_time);

            const overlapStart = availStart > studentDay.start_time ? availStart : studentDay.start_time;
            const overlapEnd = availEnd < studentDay.end_time ? availEnd : studentDay.end_time;

            if (overlapStart >= overlapEnd) continue;

            const overlapStartHour = parseInt(overlapStart.split(':')[0]);
            const overlapStartMin = parseInt(overlapStart.split(':')[1] || '0');
            const overlapEndHour = parseInt(overlapEnd.split(':')[0]);
            const overlapEndMin = parseInt(overlapEnd.split(':')[1] || '0');
            const availableMinutes = (overlapEndHour - overlapStartHour) * 60 + (overlapEndMin - overlapStartMin);
            const sessionMinutes = hoursPerSession * 60;

            if (availableMinutes < sessionMinutes) continue;

            const latestStartMinutes = (overlapEndHour * 60 + overlapEndMin) - sessionMinutes;
            const latestStartHour = Math.floor(latestStartMinutes / 60);
            const latestStartMin = latestStartMinutes % 60;

            let slotStart = new Date(currentDate);
            slotStart.setHours(overlapStartHour, overlapStartMin, 0, 0);

            let found = false;

            while ((slotStart.getHours() < latestStartHour ||
                    (slotStart.getHours() === latestStartHour && slotStart.getMinutes() <= latestStartMin)) && !found) {

              const slotEnd = new Date(slotStart);
              slotEnd.setHours(slotStart.getHours() + hoursPerSession, slotStart.getMinutes(), 0, 0);

              const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
              const overlapEndMinutes = overlapEndHour * 60 + overlapEndMin;

              if (slotEndMinutes > overlapEndMinutes) {
                slotStart.setMinutes(slotStart.getMinutes() + 15);
                continue;
              }

              const teacherBookings = bookingsByTeacher[teacherId] || [];
              const hasTeacherConflict = hasSlotConflict(slotStart, slotEnd, teacherBookings);

              if (!hasTeacherConflict) {
                let selectedRoom = null;
                for (const room of rooms) {
                  if (roomsUsedOnDate.has(room.id)) continue;
                  const roomBookingsList = roomBookingsByRoom[room.id] || [];
                  const hasRoomConflict = hasSlotConflict(slotStart, slotEnd, roomBookingsList);
                  if (!hasRoomConflict) {
                    selectedRoom = room;
                    break;
                  }
                }

                if (selectedRoom) {
                  if (!teacherSlotsMap[teacherId]) {
                    teacherSlotsMap[teacherId] = [];
                  }

                  if (teacherSlotsMap[teacherId].length < 3) {
                    const teacherName = teachers.find(t => t.id === teacherId)?.full_name || 'Unknown';
                    teacherSlotsMap[teacherId].push({
                      teacher_id: teacherId,
                      teacher_name: teacherName,
                      room_id: selectedRoom.id,
                      room_name: selectedRoom.name,
                      date: dateStr,
                      start_time: format(slotStart, 'HH:mm'),
                      end_time: format(slotEnd, 'HH:mm'),
                      session_number: 0,
                      match_score: 100
                    });
                    roomsUsedOnDate.add(selectedRoom.id);
                    found = true;
                    break;
                  }
                }
              }

              slotStart.setMinutes(slotStart.getMinutes() + 15);
            }

            if (teacherSlotsMap[teacherId] && teacherSlotsMap[teacherId].length >= 3) break;
          }
        }

        currentDate = addDays(currentDate, 1);
      }

      const result: TeacherSchedule[] = [];
      for (const [teacherId, slots] of Object.entries(teacherSlotsMap)) {
        if (slots.length === 0) continue;

        const teacherName = teachers.find(t => t.id === teacherId)?.full_name || 'Unknown';
        slots.sort((a, b) => a.date.localeCompare(b.date));

        result.push({
          teacher_id: teacherId,
          teacher_name: teacherName,
          sessions: slots,
          totalSessions: 1,
          coverage: slots.length
        });
      }

      result.sort((a, b) => {
        if (a.sessions.length === 0 || b.sessions.length === 0) return 0;
        return a.sessions[0].date.localeCompare(b.sessions[0].date);
      });

      setTeacherOptions(result);

      if (result.length > 0 && result[0].sessions.length > 0) {
        setSelectedTeacherId(result[0].teacher_id);
        setGeneratedSessions([result[0].sessions[0]]);
      }

      setShowResults(true);

      if (result.length === 0) {
        alert('No available slots found. Please adjust your preferences.');
      }

    } catch (error: any) {
      console.error('Error finding options:', error);
      alert('Error: ' + error.message);
    }

    setSearching(false);
  }, [data.course_id, data.module_id, dayAvailability, startDate, hoursPerSession, rooms, teachers, getQualifiedTeachers, hasSlotConflict, normalizeTime, buildConflictMaps]);

  // ==========================================
  // FIND TEACHER OPTIONS - Based on mode
  // ==========================================
  const findTeacherOptions = useCallback(async () => {
    if (isTrial) {
      await findTrialOptions();
    } else {
      await findRegistrationOptions();
    }
  }, [isTrial, findTrialOptions, findRegistrationOptions]);

  const handleFindTeachers = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      findTeacherOptions();
    }, 300);
  }, [findTeacherOptions]);

  // ==========================================
  // PROCEED TO CONFIRMATION — accepts optional sessions
  // ==========================================
  const proceedToConfirmation = useCallback((sessions?: AvailableSlot[]) => {
    const source = sessions || generatedSessions;

    const sessionsToSave: GeneratedSession[] = source.map(slot => ({
      session_number: slot.session_number || 0,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      teacher_id: slot.teacher_id,
      teacher_name: slot.teacher_name,
      room_id: slot.room_id,
      room_name: slot.room_name,
      match_score: slot.match_score,
    }));

    onChange('generated_sessions', sessionsToSave);
    onChange('teacher_id', source[0]?.teacher_id);
    onChange('room_id', source[0]?.room_id);
    onChange('start_date', source[0]?.date);
    onChange('start_time', source[0]?.start_time);
    onChange('end_time', source[0]?.end_time);
    onChange('hours_per_session', hoursPerSession);
    onChange('number_of_sessions', isTrial ? 1 : numberOfSessions);
    onChange('preferred_days', dayAvailability.filter(d => d.isAvailable).map(d => d.day));

    if (isTrial) {
      onChange('session_type', 'private');
    }

    onContinue();
  }, [generatedSessions, isTrial, numberOfSessions, hoursPerSession, dayAvailability, onChange, onContinue]);

  // ==========================================
  // ⭐ PHASE 2: CHECK CONFLICTS (auto-resolve rooms, modal for teachers)
  // ==========================================
  const handleContinue = useCallback(async () => {
    if (generatedSessions.length === 0) {
      alert('Please find available slots first.');
      return;
    }

    if (!isTrial && generatedSessions.length < numberOfSessions) {
      alert(`⚠️ Only ${generatedSessions.length} out of ${numberOfSessions} sessions could be scheduled. Please adjust your preferences.`);
      return;
    }

    setCheckingConflicts(true);

    try {
      // ⭐ PHASE 2: Room auto-resolution pass
      const resolvedSessions: AvailableSlot[] = [];

      for (const s of generatedSessions) {
        let originalStillFree = false;
        if (s.room_id) {
          const sameRoom = rooms.filter(r => r.id === s.room_id);
          const found = await findFreeRoomForSlot(s.date, s.start_time, s.end_time, sameRoom);
          originalStillFree = !!found;
        }

        if (originalStillFree) {
          resolvedSessions.push(s);
          continue;
        }

        const alternate = await findFreeRoomForSlot(
          s.date,
          s.start_time,
          s.end_time,
          rooms,
          s.room_id ? [s.room_id] : []
        );

        if (alternate) {
          resolvedSessions.push({
            ...s,
            room_id: alternate.id,
            room_name: alternate.name,
          });
        } else {
          resolvedSessions.push(s);
        }
      }

      // ⭐ PHASE 2: Teacher conflict detection
      const formattedSessions = resolvedSessions.map(s => ({
        session_number: s.session_number || 0,
        session_date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        room_id: s.room_id,
        room_name: s.room_name,
      }));

      const teacherIds = resolvedSessions[0]?.teacher_id
        ? [resolvedSessions[0].teacher_id]
        : [];
      const teacherNamesById: Record<string, string> = {};
      if (resolvedSessions[0]?.teacher_id && resolvedSessions[0]?.teacher_name) {
        teacherNamesById[resolvedSessions[0].teacher_id] = resolvedSessions[0].teacher_name;
      }

      const conflicts = await detectAllConflicts({
        sessions: formattedSessions,
        teacherIds,
        teacherNamesById,
      });

      setCheckingConflicts(false);

      const { teacherConflicts } = splitConflicts(conflicts);

      if (teacherConflicts.length > 0) {
        // ⭐ v3.9: enrich with teacher contact info
        const infoList = buildConflictInfoList(teacherConflicts).map(info => {
          const profile = teacherProfiles[
            Object.keys(teacherProfiles).find(
              id => teacherProfiles[id].full_name === info.teacherName
            ) || ''
          ];
          return {
            ...info,
            teacherPhone: profile?.phone || undefined,
            teacherEmail: profile?.email || undefined,
            teacherType: profile?.teacher_type || undefined,
          };
        });
        setDetectedConflicts(infoList);
        setShowConflictModal(true);
        setGeneratedSessions(resolvedSessions);
        return;
      }

      setGeneratedSessions(resolvedSessions);
      proceedToConfirmation(resolvedSessions);
    } catch (err: any) {
      setCheckingConflicts(false);
      console.error('Conflict check error:', err);
      alert('Error checking conflicts: ' + err.message);
    }
  }, [generatedSessions, isTrial, numberOfSessions, rooms, teacherProfiles, proceedToConfirmation]);

  // ==========================================
  // HANDLE MODAL CONFIRMATION
  // ==========================================
  const handleConflictResolution = useCallback((choice: ConflictResolutionChoice) => {
    const conflictNumbers = detectedConflicts.map(c => c.session_number);

    if (choice === 'skip_conflicting') {
      const remaining = generatedSessions.filter(
        s => !conflictNumbers.includes(s.session_number || 0)
      );
      if (remaining.length === 0) {
        alert('⚠️ All sessions have conflicts. Cannot continue with skip option.');
        return;
      }
      setGeneratedSessions(remaining);
      onChange('flagged_session_numbers', conflictNumbers);
      onChange('conflict_resolution', 'skip_conflicting');

      setShowConflictModal(false);
      setDetectedConflicts([]);
      setTimeout(() => proceedToConfirmation(remaining), 50);
      return;
    }

    onChange('flagged_session_numbers', conflictNumbers);
    onChange('conflict_resolution', 'create_as_is');

    setShowConflictModal(false);
    setDetectedConflicts([]);
    setTimeout(() => proceedToConfirmation(), 50);
  }, [detectedConflicts, generatedSessions, onChange, proceedToConfirmation]);

  // ==========================================
  // SKELETON LOADER
  // ==========================================
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded-lg w-full"></div>
        <div className="h-32 bg-gray-200 rounded-lg w-full"></div>
        <div className="h-20 bg-gray-200 rounded-lg w-full"></div>
        <div className="h-20 bg-gray-200 rounded-lg w-full"></div>
      </div>
    );
  }

  // ==========================================
  // RENDER - TRIAL MODE
  // ==========================================
  if (isTrial) {
    return (
      <div className="space-y-6">
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <p className="text-sm text-purple-700">
            🎯 <strong>Trial Class</strong> - Single session only
          </p>
          {courseName && (
            <p className="text-xs text-purple-600 mt-1">Course: {courseName}</p>
          )}
          <p className="text-xs text-purple-500 mt-1">
            Set your availability and we'll find qualified teachers with their earliest available slots.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">📅 Your Availability</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hours per Session
              </label>
              <select
                value={hoursPerSession}
                onChange={(e) => setHoursPerSession(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>1 hour</option>
                <option value={1.5}>1.5 hours</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Earliest Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-gray-400 mt-1">When the student can start the trial</p>
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Student Availability <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {DAYS_OF_WEEK.map((day, index) => {
                const dayAvail = dayAvailability[index];
                const isAvailable = dayAvail.isAvailable;

                return (
                  <div key={day.value} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="w-24">
                      <button
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={`w-full px-3 py-1.5 text-sm font-medium rounded transition ${
                          isAvailable
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-300 text-gray-500'
                        }`}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    </div>

                    {isAvailable ? (
                      <>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">From</label>
                          <input
                            type="time"
                            step="900"
                            value={dayAvail.start_time}
                            onChange={(e) => updateDayAvailability(index, 'start_time', e.target.value)}
                            className="ml-1 px-2 py-1 border rounded text-sm w-24"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">To</label>
                          <input
                            type="time"
                            step="900"
                            value={dayAvail.end_time}
                            onChange={(e) => updateDayAvailability(index, 'end_time', e.target.value)}
                            className="ml-1 px-2 py-1 border rounded text-sm w-24"
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">📋 How matching works</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>✓ We find teachers qualified for your course/module</li>
            <li>✓ We check each teacher's availability schedule (days & times)</li>
            <li>✓ We exclude teacher leaves and existing bookings</li>
            <li>✓ We find available rooms for each potential slot</li>
            <li>✓ We show <strong>up to 3 earliest slots</strong> for each teacher</li>
          </ul>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleFindTeachers}
            disabled={searching || dayAvailability.filter(d => d.isAvailable).length === 0}
            className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {searching ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Finding available slots...
              </>
            ) : (
              '🔍 Find Available Teachers'
            )}
          </button>
        </div>

        {showResults && (
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4">
              👨‍🏫 Available Teachers ({teacherOptions.length})
            </h3>

            {teacherOptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No teachers found. Try adjusting your availability.
              </div>
            ) : (
              <div className="space-y-4">
                {teacherOptions.map((option) => {
                  const trialSlots = option.sessions.slice(0, 3);
                  const isSelected = selectedTeacherId === option.teacher_id;
                  const profile = teacherProfiles[option.teacher_id];
                  const isExpanded = expandedTeacher === option.teacher_id;

                  return (
                    <div
                      key={option.teacher_id}
                      className={`p-4 rounded-lg border-2 transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <TeacherContactInfo
                            fullName={option.teacher_name}
                            phone={profile?.phone}
                            email={profile?.email}
                            teacherType={profile?.teacher_type}
                          />
                          {profile?.profile_headline && (
                            <p className="text-sm text-gray-500 mt-0.5">{profile.profile_headline}</p>
                          )}
                          {profile?.specialization && (
                            <p className="text-sm text-gray-600">📚 {profile.specialization}</p>
                          )}

                          <div className="flex flex-wrap gap-3 mt-1">
                            {profile?.years_experience && profile.years_experience > 0 && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">⏱ {profile.years_experience} years</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <button
                            onClick={() => {
                              setSelectedTeacherId(option.teacher_id);
                              setExpandedTeacher(option.teacher_id);
                              if (trialSlots.length > 0) {
                                setGeneratedSessions([trialSlots[0]]);
                              }
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </button>
                          <button
                            onClick={() => toggleExpandTeacher(option.teacher_id)}
                            className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {isExpanded ? 'Hide Slots' : `Show ${trialSlots.length} Slots`}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">
                            📅 Available Slots for Trial (earliest)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {trialSlots.map((slot, idx) => {
                              const isSlotSelected = generatedSessions.some(
                                s => s.date === slot.date && s.start_time === slot.start_time
                              );
                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    setGeneratedSessions([slot]);
                                    setSelectedTeacherId(option.teacher_id);
                                  }}
                                  className={`p-3 rounded-lg border-2 text-left transition ${
                                    isSlotSelected
                                      ? 'border-blue-500 bg-blue-100'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="font-medium text-gray-900">
                                    {format(parseISO(slot.date), 'EEE, MMM d')}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {slot.start_time} - {slot.end_time}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    🏠 {slot.room_name}
                                  </div>
                                  {isSlotSelected && (
                                    <div className="mt-1 text-xs text-blue-600 font-medium">✓ Selected</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <button
            onClick={onBack}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            ← Back
          </button>
          <button
            onClick={handleContinue}
            disabled={generatedSessions.length === 0 || checkingConflicts}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {checkingConflicts ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Checking conflicts...
              </>
            ) : (
              'Review & Confirm Trial →'
            )}
          </button>
        </div>

        <ConflictResolutionModal
          isOpen={showConflictModal}
          conflicts={detectedConflicts}
          totalSessions={generatedSessions.length}
          onCancel={() => {
            setShowConflictModal(false);
            setDetectedConflicts([]);
          }}
          onConfirm={handleConflictResolution}
        />
      </div>
    );
  }

  // ==========================================
  // RENDER - REGISTRATION MODE
  // ==========================================
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm text-blue-700">
          👤 Schedule your private class
        </p>
        {courseName && (
          <p className="text-xs text-blue-600 mt-1">Course: {courseName}</p>
        )}
        <p className="text-xs text-blue-500 mt-1">
          💡 Set your availability and we'll find teachers with complete schedules for all your sessions
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-4">📅 Your Availability</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hours per Session
            </label>
            <select
              value={hoursPerSession}
              onChange={(e) => setHoursPerSession(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 hour</option>
              <option value={1.5}>1.5 hours</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Sessions
            </label>
            <input
              type="number"
              value={numberOfSessions}
              onChange={(e) => setNumberOfSessions(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={1}
              max={30}
            />
            <p className="text-xs text-gray-400 mt-1">Max 30 sessions</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Session Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-gray-400 mt-1">When the first session should start</p>
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Your Weekly Availability <span className="text-red-500">*</span>
          </label>

          <div className="space-y-3">
            {DAYS_OF_WEEK.map((day, index) => {
              const dayAvail = dayAvailability[index];
              const isAvailable = dayAvail.isAvailable;

              return (
                <div key={day.value} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="w-24">
                    <button
                      type="button"
                      onClick={() => toggleDay(index)}
                      className={`w-full px-3 py-1.5 text-sm font-medium rounded transition ${
                        isAvailable
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-500'
                      }`}
                    >
                      {day.label.slice(0, 3)}
                    </button>
                  </div>

                  {isAvailable ? (
                    <>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">From</label>
                        <input
                          type="time"
                          step="900"
                          value={dayAvail.start_time}
                          onChange={(e) => updateDayAvailability(index, 'start_time', e.target.value)}
                          className="ml-1 px-2 py-1 border rounded text-sm w-24"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">To</label>
                        <input
                          type="time"
                          step="900"
                          value={dayAvail.end_time}
                          onChange={(e) => updateDayAvailability(index, 'end_time', e.target.value)}
                          className="ml-1 px-2 py-1 border rounded text-sm w-24"
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">Not available</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-2">📋 How matching works</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>✓ We find teachers qualified for your course/module</li>
          <li>✓ We check each teacher's availability schedule (days & times)</li>
          <li>✓ We exclude teacher leaves and existing bookings</li>
          <li>✓ We find available rooms for each potential slot</li>
          <li>✓ We generate a <strong>COMPLETE schedule</strong> for EACH teacher</li>
          <li>✓ You choose the teacher that best fits your preferences</li>
          <li>✓ The chosen teacher will facilitate ALL sessions</li>
        </ul>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleFindTeachers}
          disabled={searching || dayAvailability.filter(d => d.isAvailable).length === 0}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {searching ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Finding teacher options...
            </>
          ) : (
            '🔍 Find Teacher Options'
          )}
        </button>
      </div>

      {showResults && teacherOptions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">
            👨‍🏫 Available Teachers ({teacherOptions.length} options)
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Each teacher has a complete schedule for all {numberOfSessions} sessions. Click "View Schedule" to see the full schedule.
          </p>

          <div className="space-y-4">
            {teacherOptions.map((option) => {
              const isSelected = selectedTeacherId === option.teacher_id;
              const canCoverAll = option.coverage >= numberOfSessions;
              const coveragePercent = Math.round((option.coverage / numberOfSessions) * 100);
              const profile = teacherProfiles[option.teacher_id];
              const isExpanded = expandedTeacher === option.teacher_id;

              return (
                <div
                  key={option.teacher_id}
                  className={`p-4 rounded-lg border-2 transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : canCoverAll
                      ? 'border-green-200 hover:border-green-400'
                      : 'border-yellow-200 hover:border-yellow-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 flex-wrap">
                        <TeacherContactInfo
                          fullName={option.teacher_name}
                          phone={profile?.phone}
                          email={profile?.email}
                          teacherType={profile?.teacher_type}
                          className="flex-1"
                        />
                        {canCoverAll ? (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full shrink-0">
                            ✅ All {numberOfSessions} sessions
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full shrink-0">
                            ⚠️ {option.coverage}/{numberOfSessions} sessions ({coveragePercent}%)
                          </span>
                        )}
                      </div>

                      {profile && (
                        <div className="mt-2 text-sm text-gray-600">
                          {profile.profile_headline && (
                            <p className="text-gray-700 font-medium">{profile.profile_headline}</p>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1">
                            {profile.specialization && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">📚 {profile.specialization}</span>
                            )}
                            {profile.years_experience && profile.years_experience > 0 && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">⏱ {profile.years_experience} years</span>
                            )}
                            {profile.hourly_rate && profile.hourly_rate > 0 && (
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">💰 ${profile.hourly_rate}/hr</span>
                            )}
                          </div>
                          {profile.bio && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{profile.bio}</p>
                          )}
                        </div>
                      )}

                      {!isExpanded && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {option.sessions.slice(0, 4).map((session, idx) => (
                            <span key={idx} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                              #{session.session_number} {format(parseISO(session.date), 'MMM d')} {session.start_time}
                            </span>
                          ))}
                          {option.sessions.length > 4 && (
                            <span className="text-xs text-gray-400">+{option.sessions.length - 4} more</span>
                          )}
                        </div>
                      )}

                      {isSelected && (
                        <div className="mt-2 text-xs text-blue-600 font-medium">
                          ✓ Selected - All sessions will be with {option.teacher_name}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedTeacherId(option.teacher_id);
                          setGeneratedSessions(option.sessions);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {isSelected ? '✓ Selected' : 'Select'}
                      </button>
                      <button
                        onClick={() => toggleExpandTeacher(option.teacher_id)}
                        className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {isExpanded ? 'Hide Schedule' : 'View Schedule'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        📅 Full Schedule for {option.teacher_name}
                      </h4>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {option.sessions.map((session, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded text-sm">
                            <span className="font-medium text-gray-900 w-16">
                              #{session.session_number}
                            </span>
                            <span className="text-gray-700">
                              {format(parseISO(session.date), 'EEE, MMM d, yyyy')}
                            </span>
                            <span className="text-gray-500">
                              {session.start_time} - {session.end_time}
                            </span>
                            <span className="text-gray-400 text-xs">
                              🏠 {session.room_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showResults && teacherOptions.length === 0 && (
        <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200 text-center">
          <p className="text-yellow-700 font-medium">No teachers found</p>
          <p className="text-sm text-yellow-600 mt-1">
            No teacher can cover at least 50% of your sessions. Try adjusting your availability or reducing the number of sessions.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={generatedSessions.length === 0 || generatedSessions.length < numberOfSessions || checkingConflicts}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {checkingConflicts ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Checking conflicts...
            </>
          ) : (
            'Review & Confirm →'
          )}
        </button>
      </div>

      <ConflictResolutionModal
        isOpen={showConflictModal}
        conflicts={detectedConflicts}
        totalSessions={generatedSessions.length}
        onCancel={() => {
          setShowConflictModal(false);
          setDetectedConflicts([]);
        }}
        onConfirm={handleConflictResolution}
      />
    </div>
  );
}