// app/dashboard/page.tsx
// ⭐ v3.19 — Removed TeacherWeeklyStats + SixWeekTrend (moved to Reports)
// ⭐ v3.6 — Room Pulse slots color-coded by booking type
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  format, getHours, getMinutes, differenceInHours, addDays
} from 'date-fns';
import Link from 'next/link';

interface Booking {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  course_id: string;
  room_id: string;
  status: string;
  teacher_name?: string;
  course_name?: string;
  room_name?: string;
  student_count?: number;
}

interface TimelineItem {
  id: string;
  source: 'private' | 'trial_private' | 'trial_group' | 'group' | 'room_booking';
  start_time: string;
  startDate: Date;
  endDate: Date;
  title: string;
  subtitle?: string;
  teacher_name?: string;
  room_name?: string;
  student_count?: number;
  durationHours?: number;
  status?: string;
  raw: any;
}

type SessionSource = 'private' | 'trial' | 'trial_group' | 'group' | 'room_booking';

interface SlotOccupant {
  source: SessionSource;
  title: string;
  teacher_name?: string;
  start_time: string;
  end_time: string;
}

const SOURCE_COLORS: Record<SessionSource | 'available', {
  bg: string;
  bgHover: string;
  dot: string;
  label: string;
  icon: string;
}> = {
  private:     { bg: 'bg-emerald-500', bgHover: 'hover:bg-emerald-600', dot: 'bg-emerald-500', label: 'Private',       icon: '📚' },
  trial:       { bg: 'bg-purple-500',  bgHover: 'hover:bg-purple-600',  dot: 'bg-purple-500',  label: 'Trial Private', icon: '🎯' },
  trial_group: { bg: 'bg-cyan-500',    bgHover: 'hover:bg-cyan-600',    dot: 'bg-cyan-500',    label: 'Trial Group',   icon: '👥' },
  group:       { bg: 'bg-rose-500',    bgHover: 'hover:bg-rose-600',    dot: 'bg-rose-500',    label: 'Group Class',   icon: '👥' },
  room_booking:{ bg: 'bg-gray-500',    bgHover: 'hover:bg-gray-600',    dot: 'bg-gray-500',    label: 'Room Booking',  icon: '🏫' },
  available:   { bg: 'bg-gray-100',    bgHover: 'hover:bg-gray-200',    dot: 'bg-gray-200',    label: 'Available',     icon: '✨' },
};

export default function DashboardPage() {
  const [pendingAttendance, setPendingAttendance] = useState(0);
  const [pendingSubstitutes, setPendingSubstitutes] = useState(0);
  const [roomNeededCount, setRoomNeededCount] = useState(0);

  const [roomPulseData, setRoomPulseData] = useState<{
    id: string;
    name: string;
    capacity: number;
    slots: { time: string; occupied: boolean; occupant?: SlotOccupant }[]
  }[]>([]);

  const [lowStockBooks, setLowStockBooks] = useState<any[]>([]);
  const [todaysTeachers, setTodaysTeachers] = useState<string[]>([]);
  const [todaysStudents, setTodaysStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

  useEffect(() => {
    loadDashboardData();
    getUserName();

    const interval = setInterval(() => {
      loadPendingSubstitutes();
      loadRoomNeededCount();
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  async function getUserName() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserName(user.user_metadata?.full_name || user.email || 'Admin');
    }
  }

  async function loadPendingSubstitutes() {
    try {
      const { count, error } = await supabase
        .from('substitute_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!error && count !== null) setPendingSubstitutes(count);
    } catch (error) {
      console.error('Error loading pending substitutes:', error);
    }
  }

  async function loadRoomNeededCount() {
    try {
      const { count, error } = await supabase
        .from('group_class_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('needs_attention', true)
        .eq('attention_reason', 'room_unassigned');
      if (!error && count !== null) setRoomNeededCount(count);
    } catch (error) {
      console.error('Error loading room needed count:', error);
    }
  }

  async function loadAllSessionsInRange(
    startISO: string,
    endISO: string,
    startDateStr: string,
    endDateStr: string
  ): Promise<Array<{
    id: string;
    source: SessionSource;
    date: string;
    start_time: string;
    end_time: string;
    room_id: string | null;
    teacher_id: string | null;
    class_id: string | null;
    title: string;
    teacher_name?: string;
  }>> {
    const [privateRes, trialRes, groupRes, roomBookingRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, start_time, end_time, room_id, teacher_id, class_id, course_id, student_id, status, is_trial')
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .in('status', ['confirmed', 'in_progress', 'completed']),

      supabase
        .from('trial_class_bookings')
        .select('id, selected_date, selected_time, hours, room_id, selected_teacher_id, course_id, status, session_type')
        .gte('selected_date', startDateStr)
        .lte('selected_date', endDateStr)
        .not('status', 'in', '(\'cancelled\', \'converted\')'),

      supabase
        .from('group_class_sessions')
        .select('id, session_date, start_time, end_time, room_id, teacher_id, group_class_id, status, session_number')
        .gte('session_date', startDateStr)
        .lte('session_date', endDateStr)
        .in('status', ['scheduled', 'ongoing', 'completed']),

      supabase
        .from('room_bookings')
        .select('id, room_id, teacher_id, start_time, end_time, status, title')
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .in('status', ['confirmed', 'pending']),
    ]);

    const privateRaw = privateRes.data || [];
    const trialRaw = trialRes.data || [];
    const groupRaw = groupRes.data || [];
    const roomBookingRaw = roomBookingRes.data || [];

    const teacherIds = new Set<string>();
    const courseIds = new Set<string>();
    const groupClassIds = new Set<string>();

    privateRaw.forEach((b: any) => {
      if (b.teacher_id) teacherIds.add(b.teacher_id);
      if (b.course_id) courseIds.add(b.course_id);
    });
    trialRaw.forEach((t: any) => {
      if (t.selected_teacher_id) teacherIds.add(t.selected_teacher_id);
      if (t.course_id) courseIds.add(t.course_id);
    });
    groupRaw.forEach((g: any) => {
      if (g.teacher_id) teacherIds.add(g.teacher_id);
      if (g.group_class_id) groupClassIds.add(g.group_class_id);
    });
    roomBookingRaw.forEach((r: any) => {
      if (r.teacher_id) teacherIds.add(r.teacher_id);
    });

    const [teachersData, coursesData, groupClassesData] = await Promise.all([
      teacherIds.size > 0
        ? supabase.from('users').select('id, full_name').in('id', Array.from(teacherIds))
        : Promise.resolve({ data: [] as any[] }),
      courseIds.size > 0
        ? supabase.from('courses').select('id, name').in('id', Array.from(courseIds))
        : Promise.resolve({ data: [] as any[] }),
      groupClassIds.size > 0
        ? supabase.from('scheduled_group_classes').select('id, class_name, course_id').in('id', Array.from(groupClassIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const teacherMap: Record<string, string> = {};
    (teachersData.data || []).forEach((t: any) => { teacherMap[t.id] = t.full_name; });

    const courseMap: Record<string, string> = {};
    (coursesData.data || []).forEach((c: any) => { courseMap[c.id] = c.name; });

    const groupClassMap: Record<string, any> = {};
    (groupClassesData.data || []).forEach((g: any) => { groupClassMap[g.id] = g; });

    const sessions: Array<{
      id: string;
      source: SessionSource;
      date: string;
      start_time: string;
      end_time: string;
      room_id: string | null;
      teacher_id: string | null;
      class_id: string | null;
      title: string;
      teacher_name?: string;
    }> = [];

    privateRaw.forEach((b: any) => {
      if (b.is_trial === true) return;
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      sessions.push({
        id: b.id,
        source: 'private',
        date: format(start, 'yyyy-MM-dd'),
        start_time: format(start, 'HH:mm'),
        end_time: format(end, 'HH:mm'),
        room_id: b.room_id,
        teacher_id: b.teacher_id,
        class_id: b.class_id,
        title: courseMap[b.course_id] || 'Private Class',
        teacher_name: teacherMap[b.teacher_id] || 'Unknown',
      });
    });

    trialRaw.forEach((t: any) => {
      if (!t.selected_date || !t.selected_time) return;
      const startTime = (t.selected_time as string).slice(0, 5);
      const duration = t.hours || 2;
      const [h, m] = startTime.split(':').map(Number);
      const endHour = h + duration;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const isGroupTrial = t.session_type === 'group';

      sessions.push({
        id: t.id,
        source: isGroupTrial ? 'trial_group' : 'trial',
        date: t.selected_date,
        start_time: startTime,
        end_time: endTime,
        room_id: t.room_id,
        teacher_id: t.selected_teacher_id,
        class_id: null,
        title: courseMap[t.course_id] || (isGroupTrial ? 'Trial Group' : 'Trial Class'),
        teacher_name: teacherMap[t.selected_teacher_id] || 'Unknown',
      });
    });

    groupRaw.forEach((g: any) => {
      const groupClass = groupClassMap[g.group_class_id];
      sessions.push({
        id: g.id,
        source: 'group',
        date: g.session_date,
        start_time: (g.start_time as string).slice(0, 5),
        end_time: (g.end_time as string).slice(0, 5),
        room_id: g.room_id,
        teacher_id: g.teacher_id,
        class_id: g.group_class_id,
        title: groupClass?.class_name || courseMap[groupClass?.course_id] || 'Group Class',
        teacher_name: teacherMap[g.teacher_id] || 'Unknown',
      });
    });

    roomBookingRaw.forEach((r: any) => {
      if (!r.start_time || !r.end_time) return;
      const startStr = String(r.start_time);
      const endStr = String(r.end_time);
      const date = startStr.slice(0, 10);
      const startTime = startStr.slice(11, 16);
      const endTime = endStr.slice(11, 16);

      sessions.push({
        id: r.id,
        source: 'room_booking',
        date,
        start_time: startTime,
        end_time: endTime,
        room_id: r.room_id,
        teacher_id: r.teacher_id || null,
        class_id: null,
        title: r.title || 'Room Booking',
        teacher_name: r.teacher_id ? teacherMap[r.teacher_id] : undefined,
      });
    });

    return sessions;
  }

  async function loadTodaysTimeline() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayDateStr = format(todayStart, 'yyyy-MM-dd');
    const todayISO = todayStart.toISOString();
    const todayISOEnd = todayEnd.toISOString();

    const [bookingsRes, trialRes, groupRes, roomBookRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .gte('start_time', todayISO)
        .lte('start_time', todayISOEnd)
        .in('status', ['confirmed', 'in_progress', 'completed'])
        .or('is_trial.is.null,is_trial.eq.false'),

      supabase
        .from('trial_class_bookings')
        .select('*')
        .gte('selected_date', todayDateStr)
        .lte('selected_date', todayDateStr)
        .not('status', 'in', '(\'cancelled\', \'converted\')'),

      supabase
        .from('group_class_sessions')
        .select('*')
        .eq('session_date', todayDateStr)
        .in('status', ['scheduled', 'ongoing', 'completed']),

      supabase
        .from('room_bookings')
        .select('*')
        .gte('start_time', todayISO)
        .lte('start_time', todayISOEnd)
        .in('status', ['confirmed', 'pending']),
    ]);

    const bookings = bookingsRes.data || [];
    const trials = trialRes.data || [];
    const groupSessions = groupRes.data || [];
    const roomBookings = roomBookRes.data || [];

    const teacherIds = new Set<string>();
    const courseIds = new Set<string>();
    const moduleIds = new Set<string>();
    const roomIds = new Set<string>();
    const classIds = new Set<string>();
    const studentIds = new Set<string>();
    const groupClassIds = new Set<string>();

    bookings.forEach((b: any) => {
      if (b.teacher_id) teacherIds.add(b.teacher_id);
      if (b.course_id) courseIds.add(b.course_id);
      if (b.room_id) roomIds.add(b.room_id);
      if (b.class_id) classIds.add(b.class_id);
      if (b.student_id) studentIds.add(b.student_id);
    });
    trials.forEach((t: any) => {
      if (t.selected_teacher_id) teacherIds.add(t.selected_teacher_id);
      if (t.course_id) courseIds.add(t.course_id);
      if (t.module_id) moduleIds.add(t.module_id);
      if (t.room_id) roomIds.add(t.room_id);
      if (t.student_id) studentIds.add(t.student_id);
    });
    groupSessions.forEach((g: any) => {
      if (g.teacher_id) teacherIds.add(g.teacher_id);
      if (g.room_id) roomIds.add(g.room_id);
      if (g.group_class_id) groupClassIds.add(g.group_class_id);
    });
    roomBookings.forEach((r: any) => {
      if (r.teacher_id) teacherIds.add(r.teacher_id);
      if (r.room_id) roomIds.add(r.room_id);
    });

    const [
      teachersData, coursesData, modulesData, roomsData,
      classesData, studentsData, groupClassesData,
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
      studentIds.size > 0
        ? supabase.from('users').select('id, full_name').in('id', Array.from(studentIds))
        : Promise.resolve({ data: [] as any[] }),
      groupClassIds.size > 0
        ? supabase.from('scheduled_group_classes').select('id, class_name, course_id').in('id', Array.from(groupClassIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const teacherMap: Record<string, string> = {};
    (teachersData.data || []).forEach((t: any) => { teacherMap[t.id] = t.full_name; });
    const courseMap: Record<string, string> = {};
    (coursesData.data || []).forEach((c: any) => { courseMap[c.id] = c.name; });
    const moduleMap: Record<string, string> = {};
    (modulesData.data || []).forEach((m: any) => { moduleMap[m.id] = m.title; });
    const roomMap: Record<string, string> = {};
    (roomsData.data || []).forEach((r: any) => { roomMap[r.id] = r.name; });
    const classCodeMap: Record<string, string> = {};
    (classesData.data || []).forEach((c: any) => { classCodeMap[c.id] = c.class_code; });
    const studentMap: Record<string, string> = {};
    (studentsData.data || []).forEach((s: any) => { studentMap[s.id] = s.full_name; });
    const groupClassMap: Record<string, any> = {};
    (groupClassesData.data || []).forEach((g: any) => { groupClassMap[g.id] = g; });

    const items: TimelineItem[] = [];

    bookings.forEach((b: any) => {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      items.push({
        id: `private-${b.id}`,
        source: 'private',
        start_time: b.start_time,
        startDate: start,
        endDate: end,
        title: courseMap[b.course_id] || 'Private Class',
        subtitle: b.class_id ? classCodeMap[b.class_id] : undefined,
        teacher_name: teacherMap[b.teacher_id] || 'Unknown',
        room_name: b.room_id ? roomMap[b.room_id] : 'TBD',
        durationHours: differenceInHours(end, start),
        status: b.status,
        raw: b,
      });
    });

    trials.forEach((t: any) => {
      if (!t.selected_date || !t.selected_time) return;
      const startTime = (t.selected_time as string).slice(0, 5);
      const duration = t.hours || 2;
      const [h, m] = startTime.split(':').map(Number);
      const endHour = h + duration;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const start = new Date(`${t.selected_date}T${startTime}:00`);
      const end = new Date(`${t.selected_date}T${endTime}:00`);
      const isGroupTrial = t.session_type === 'group';

      items.push({
        id: `trial-${t.id}`,
        source: isGroupTrial ? 'trial_group' : 'trial_private',
        start_time: `${t.selected_date}T${startTime}:00`,
        startDate: start,
        endDate: end,
        title: courseMap[t.course_id] || (isGroupTrial ? 'Trial Group' : 'Trial Private'),
        subtitle: t.module_id ? moduleMap[t.module_id] : undefined,
        teacher_name: teacherMap[t.selected_teacher_id] || 'Unknown',
        room_name: t.room_id ? roomMap[t.room_id] : 'TBD',
        student_count: 1,
        durationHours: duration,
        status: t.status,
        raw: t,
      });
    });

    groupSessions.forEach((g: any) => {
      const startTime = (g.start_time as string).slice(0, 5);
      const endTime = (g.end_time as string).slice(0, 5);
      const start = new Date(`${g.session_date}T${startTime}:00`);
      const end = new Date(`${g.session_date}T${endTime}:00`);
      const groupClass = groupClassMap[g.group_class_id];

      items.push({
        id: `group-${g.id}`,
        source: 'group',
        start_time: `${g.session_date}T${startTime}:00`,
        startDate: start,
        endDate: end,
        title: groupClass?.class_name || courseMap[groupClass?.course_id] || 'Group Class',
        subtitle: `Session #${g.session_number}${groupClass?.course_id ? ` · ${courseMap[groupClass.course_id] || ''}` : ''}`,
        teacher_name: teacherMap[g.teacher_id] || 'Unknown',
        room_name: g.room_id ? roomMap[g.room_id] : 'No room assigned',
        durationHours: differenceInHours(end, start),
        status: g.status,
        raw: g,
      });
    });

    roomBookings.forEach((r: any) => {
      const start = new Date(r.start_time);
      const end = new Date(r.end_time);
      items.push({
        id: `room-${r.id}`,
        source: 'room_booking',
        start_time: r.start_time,
        startDate: start,
        endDate: end,
        title: r.title || 'Room Booking',
        subtitle: r.description || r.booking_type || undefined,
        teacher_name: r.teacher_id ? teacherMap[r.teacher_id] : undefined,
        room_name: r.room_id ? roomMap[r.room_id] : 'TBD',
        student_count: r.student_count || undefined,
        durationHours: differenceInHours(end, start),
        status: r.status,
        raw: r,
      });
    });

    items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setTimelineItems(items);

    const allTeacherNames = new Set<string>();
    items.forEach(it => { if (it.teacher_name) allTeacherNames.add(it.teacher_name); });
    setTodaysTeachers(Array.from(allTeacherNames));
  }

  async function loadDashboardData() {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      loadPendingSubstitutes();
      loadRoomNeededCount();

      await loadTodaysTimeline();

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, class_id')
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
        .in('status', ['confirmed', 'in_progress', 'completed']);

      if (bookings) {
        const teacherIds = [...new Set(bookings.map(b => b.teacher_id))];
        const courseIds = [...new Set(bookings.map(b => b.course_id))];
        const classIds = [...new Set(bookings.map(b => b.class_id).filter(id => id))];

        const [teachersData, coursesData, allRoomsData, enrollmentsData] = await Promise.all([
          supabase.from('users').select('id, full_name').in('id', teacherIds),
          supabase.from('courses').select('id, name').in('id', courseIds),
          supabase.from('rooms').select('id, name, capacity').eq('is_active', true).order('name'),
          classIds.length > 0
            ? supabase.from('class_enrollments').select('class_id, student_id').in('class_id', classIds).eq('status', 'active')
            : Promise.resolve({ data: [] })
        ]);

        const roomMap: Record<string, { name: string; capacity: number }> = {};
        (allRoomsData.data || []).forEach((r: any) => {
          roomMap[r.id] = { name: r.name, capacity: r.capacity || 1 };
        });

        const uniqueStudentIds = [...new Set(enrollmentsData.data?.map(e => e.student_id) || [])];
        setTodaysStudents(uniqueStudentIds);

        // Pending attendance count (used by FAB)
        let pending = 0;
        for (const b of bookings) {
          const { count } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('booking_id', b.id);
          if (count === 0) pending++;
        }
        setPendingAttendance(pending);

        // Room Pulse
        const roomSlots: Record<string, {
          id: string;
          name: string;
          capacity: number;
          slots: { time: string; occupied: boolean; occupant?: SlotOccupant }[]
        }> = {};

        const startHour = 9;
        const endHour = 21;

        Object.entries(roomMap).forEach(([id, info]) => {
          const slots = [];
          for (let h = startHour; h < endHour; h++) {
            slots.push({ time: `${h}:00`, occupied: false });
            slots.push({ time: `${h}:30`, occupied: false });
          }
          roomSlots[id] = { id, name: info.name, capacity: info.capacity, slots };
        });

        const todayISO = todayStart.toISOString();
        const todayISOEnd = todayEnd.toISOString();
        const todayDateStr = format(todayStart, 'yyyy-MM-dd');

        const allTodaySessions = await loadAllSessionsInRange(
          todayISO, todayISOEnd, todayDateStr, todayDateStr
        );

        allTodaySessions.forEach((s) => {
          if (!s.room_id || !roomSlots[s.room_id]) return;
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          const startMinutes = sh * 60 + sm;
          const endMinutes = eh * 60 + em;

          roomSlots[s.room_id].slots.forEach((slot) => {
            const [slotH, slotM] = slot.time.split(':').map(Number);
            const slotMinutes = slotH * 60 + slotM;
            if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
              slot.occupied = true;
              slot.occupant = {
                source: s.source,
                title: s.title,
                teacher_name: s.teacher_name,
                start_time: s.start_time,
                end_time: s.end_time,
              };
            }
          });
        });

        setRoomPulseData(Object.values(roomSlots));
      }

      const { data: booksData } = await supabase
        .from('inventory_books')
        .select('title, available_quantity, reorder_quantity');

      const lowStock = (booksData || []).filter((b: any) =>
        b.available_quantity <= (b.reorder_quantity || 0)
      );
      setLowStockBooks(lowStock);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
    setLoading(false);
  }

  const groupTimeline = (items: TimelineItem[]) => {
    const groups: { [key: string]: TimelineItem[] } = { Morning: [], Afternoon: [], Evening: [] };
    items.forEach(it => {
      const hour = it.startDate.getHours();
      if (hour < 12) groups.Morning.push(it);
      else if (hour < 17) groups.Afternoon.push(it);
      else groups.Evening.push(it);
    });
    return groups;
  };

  const groupedTimeline = groupTimeline(timelineItems);

  const getSourceBadge = (source: TimelineItem['source']) => {
    const map = {
      private: { icon: '📚', label: 'Private', color: 'bg-emerald-100 text-emerald-700' },
      trial_private: { icon: '🎯', label: 'Trial Private', color: 'bg-purple-100 text-purple-700' },
      trial_group: { icon: '👥', label: 'Trial Group', color: 'bg-cyan-100 text-cyan-700' },
      group: { icon: '👥', label: 'Group', color: 'bg-rose-100 text-rose-700' },
      room_booking: { icon: '🏫', label: 'Room Booking', color: 'bg-gray-100 text-gray-700' },
    };
    return map[source] || map.private;
  };

  if (loading) {
    return <div className="animate-pulse space-y-6 p-6"><div className="h-8 bg-gray-200 rounded w-1/3"></div></div>;
  }

  return (
    <div className="space-y-6 w-full relative">

      {/* 1. WELCOME HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {userName} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-stretch">
          {pendingSubstitutes > 0 ? (
            <Link
              key="teacher-subs-card"
              href="/dashboard/substitutes/needed"
              className="group relative flex items-center gap-3 px-4 py-2 rounded-xl shadow-sm border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 hover:border-amber-300 hover:shadow-md transition-all duration-200"
            >
              <div className="relative shrink-0">
                <span className="text-xl">⚠️</span>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse ring-2 ring-white"></span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Teacher Subs</span>
                <span className="text-sm font-bold text-amber-900">{pendingSubstitutes} Pending</span>
              </div>
              <span className="text-amber-600 text-sm font-bold ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          ) : (
            <div key="teacher-subs-card" className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-sm border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50">
              <span className="text-xl">✅</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Teacher Subs</span>
                <span className="text-sm font-bold text-emerald-900">All Clear</span>
              </div>
            </div>
          )}

          {roomNeededCount > 0 ? (
            <Link
              key="rooms-needed-card"
              href="/dashboard/classes/rooms/needed"
              className="group relative flex items-center gap-3 px-4 py-2 rounded-xl shadow-sm border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:shadow-md transition-all duration-200"
            >
              <div className="relative shrink-0">
                <span className="text-xl">🏫</span>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse ring-2 ring-white"></span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold">Rooms Needed</span>
                <span className="text-sm font-bold text-orange-900">{roomNeededCount} Pending</span>
              </div>
              <span className="text-orange-600 text-sm font-bold ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          ) : (
            <div key="rooms-needed-card" className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-sm border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50">
              <span className="text-xl">✅</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Rooms Needed</span>
                <span className="text-sm font-bold text-emerald-900">All Clear</span>
              </div>
            </div>
          )}

          <div key="schedule-btn" className="flex gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
            <Link href="/dashboard/classes/calendar">
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium flex items-center gap-2 h-full">
                <span>📅</span> Schedule
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. KPI HEADER */}
      <div className="sticky top-[64px] z-20 bg-gray-50/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 shadow-sm border-b border-gray-200/50 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 text-base">📚</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Today's Classes</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{timelineItems.filter(i => i.source !== 'room_booking').length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-indigo-600 text-base">👨‍🏫</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Teachers on Duty</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{todaysTeachers.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-purple-600 text-base">👩‍🎓</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Number of Students</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{todaysStudents.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-orange-600 text-base">⏳</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Pending Attendance</span>
            </div>
            <div className="text-xl font-bold text-orange-600">{pendingAttendance}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-base">⚠️</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Books for Reorder</span>
            </div>
            <div className="text-xl font-bold text-red-600">{lowStockBooks.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-base">🟢</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Active Rooms</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{roomPulseData.length}</div>
          </div>
        </div>
      </div>

      {/* 3. ROOM PULSE */}
      <div className="mb-6">
        <div className="sticky top-[160px] z-10 bg-gray-50/90 backdrop-blur-sm py-3 -mx-4 px-4 mb-2 border-b border-gray-200/50 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Room Pulse</h2>
        </div>

        <div className="flex items-center gap-x-4 gap-y-2 mb-3 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg flex-wrap">
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.private.dot}`}></span><span>📚 Private</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.trial.dot}`}></span><span>🎯 Trial Private</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.trial_group.dot}`}></span><span>👥 Trial Group</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.group.dot}`}></span><span>👥 Group Class</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.room_booking.dot}`}></span><span>🏫 Room Booking</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${SOURCE_COLORS.available.dot}`}></span><span className="text-gray-400">Available</span></span>
          <span className="text-[10px] text-gray-400 ml-auto">Hover any cell for details</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[850px]">
              <div className="grid border-b border-gray-200 bg-gray-50 text-[10px]" style={{ gridTemplateColumns: '130px repeat(24, minmax(28px, 1fr))' }}>
                <div className="p-1 font-medium text-gray-600 pl-2 border-r border-gray-200">Room</div>
                {roomPulseData.length > 0 && roomPulseData[0].slots.map((slot, idx) => (
                  <div key={idx} className="p-1 text-center font-medium text-gray-500 border-r border-gray-200 last:border-r-0">{slot.time}</div>
                ))}
              </div>
              {roomPulseData.map((room) => (
                <div key={room.id} className="grid border-b border-gray-100 last:border-b-0 text-[10px] hover:bg-gray-50/50 transition" style={{ gridTemplateColumns: '130px repeat(24, minmax(28px, 1fr))' }}>
                  <div className="p-1 pl-2 border-r border-gray-200 flex items-center gap-2 bg-gray-50/30">
                    <span className="font-medium text-gray-800">{room.name}</span>
                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded ml-1">C{room.capacity}</span>
                  </div>
                  {room.slots.map((slot, idx) => {
                    const occ = slot.occupant;
                    const palette = occ ? SOURCE_COLORS[occ.source] || SOURCE_COLORS.available : SOURCE_COLORS.available;
                    const occMeta = occ ? SOURCE_COLORS[occ.source] : null;

                    return (
                      <div
                        key={`${room.id}-slot-${idx}`}
                        className={`group relative h-6 border-r border-gray-100 last:border-r-0 transition-colors cursor-pointer ${palette.bg} ${palette.bgHover}`}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 pointer-events-none">
                          <div className="bg-gray-900 text-white text-[10px] rounded-lg shadow-xl px-3 py-2 min-w-[180px] max-w-[260px] whitespace-normal">
                            {occ && occMeta ? (
                              <>
                                <div className="flex items-center gap-1.5 font-semibold mb-1">
                                  <span>{occMeta.icon}</span><span>{occMeta.label}</span>
                                </div>
                                <div className="text-[10px] text-gray-200 mb-1 truncate">{occ.title}</div>
                                {occ.teacher_name && <div className="text-[10px] text-gray-300">👨‍🏫 {occ.teacher_name}</div>}
                                <div className="text-[10px] text-gray-300 mt-0.5">🕐 {occ.start_time} – {occ.end_time}</div>
                              </>
                            ) : (
                              <div className="text-[10px] text-gray-300">✨ Available</div>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {roomPulseData.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">No active rooms found</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. TODAY'S TIMELINE */}
      <div className="mb-12">
        <div className="sticky top-[160px] z-10 bg-gray-50/90 backdrop-blur-sm py-3 -mx-4 px-4 mb-2 border-b border-gray-200/50 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Today's Timeline</h2>
            <span className="text-xs text-gray-500">
              {timelineItems.length} item{timelineItems.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {timelineItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-gray-500 text-sm">No sessions scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedTimeline).map(([timeOfDay, items]) => (
                items.length > 0 && (
                  <div key={timeOfDay}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{timeOfDay}</h3>
                      <span className="text-xs text-gray-400 ml-2">({items.length} {items.length === 1 ? 'session' : 'sessions'})</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const badge = getSourceBadge(item.source);
                        const isRoomBooking = item.source === 'room_booking';
                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 rounded-lg border transition ${
                              isRoomBooking ? 'bg-gray-50 border-gray-200 hover:border-gray-400' : 'bg-gray-50 border-gray-100 hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <div className="w-20 text-sm font-medium text-gray-500 shrink-0">
                                {format(item.startDate, 'h:mm a')}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${badge.color}`}>
                                    {badge.icon} {badge.label}
                                  </span>
                                  <span className="font-medium text-gray-800 truncate">{item.title}</span>
                                </div>
                                {item.subtitle && (
                                  <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                                )}
                                <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                                  {item.teacher_name && <span>👨‍🏫 {item.teacher_name}</span>}
                                  {item.teacher_name && item.room_name && <span className="text-gray-300">•</span>}
                                  {item.room_name && <span>🏫 {item.room_name}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {typeof item.student_count === 'number' && item.student_count > 0 && (
                                <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  👥 {item.student_count}
                                </span>
                              )}
                              {item.durationHours !== undefined && (
                                <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                  {item.durationHours}h
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <Link href="/dashboard/staff/attendance">
        <button className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-3 rounded-full shadow-lg text-white transition-all hover:scale-105 ${pendingAttendance > 0 ? 'bg-orange-600 animate-pulse' : 'bg-blue-600'}`}>
          <span className="text-xl">📋</span>
          <span className="font-medium">Take Attendance</span>
          {pendingAttendance > 0 && (
            <span className="bg-white text-orange-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ml-1">{pendingAttendance}</span>
          )}
        </button>
      </Link>
    </div>
  );
}