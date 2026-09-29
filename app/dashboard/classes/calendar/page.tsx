// app/dashboard/classes/calendar/page.tsx
// ⭐ M6: Add ⚠️ badges for flagged sessions
// ⭐ FIX: Fixed row heights + card max-height to prevent overlap
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameWeek,
  startOfWeek,
  parseISO,
  endOfWeek
} from 'date-fns';
import Link from 'next/link';

interface Booking {
  id: string;
  room_id: string;
  teacher_id: string;
  course_id: string;
  student_id: string | null;
  start_time: string;
  end_time: string;
  status: string;
  class_code?: string;
  class_id?: string;
  booking_type?: 'class' | 'trial' | 'group_class' | 'room_booking';
  isTrial?: boolean;
  isGroupClass?: boolean;
  isRoomBooking?: boolean;
  teacher_name?: string;
  course_name?: string;
  room_name?: string;
  level?: string;
  module_name?: string;
  student_name?: string;
  title?: string;
  session_type?: string;
  // ⭐ M6: flag + substitute tracking
  needs_attention?: boolean;
  attention_reason?: string | null;
  substitute_teacher_id?: string | null;
  substitute_teacher_name?: string | null;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

export default function ClassCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [debugInfo, setDebugInfo] = useState<string>('Loading data...');
  const [debugDetails, setDebugDetails] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const weekDays = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDaysArray = Array.from({ length: 7 }, (_, i) => addDays(weekDays, i));

  const addDebug = (msg: string) => {
    console.log(msg);
    setDebugDetails(prev => [...prev, msg]);
  };

  // ==========================================
  // COLOR CODING
  // ==========================================
  const getBookingColors = (booking: any) => {
    const isTrial = booking.isTrial || booking.booking_type === 'trial';
    const isGroupClass = booking.isGroupClass || booking.booking_type === 'group_class';
    const isRoomBooking = booking.isRoomBooking || booking.booking_type === 'room_booking';
    const sessionType = booking.session_type || 'private';

    const colors = {
      privateTrial: {
        bg: 'bg-purple-600', bgLight: 'bg-purple-100', border: 'border-purple-500',
        text: 'text-purple-700', textWhite: 'text-white', hover: 'hover:bg-purple-700',
        badge: 'bg-purple-700', icon: '🎯', label: 'Private Trial'
      },
      groupTrial: {
        bg: 'bg-cyan-600', bgLight: 'bg-cyan-100', border: 'border-cyan-500',
        text: 'text-cyan-700', textWhite: 'text-white', hover: 'hover:bg-cyan-700',
        badge: 'bg-cyan-700', icon: '👥', label: 'Group Trial'
      },
      privateClass: {
        bg: 'bg-emerald-600', bgLight: 'bg-emerald-100', border: 'border-emerald-500',
        text: 'text-emerald-700', textWhite: 'text-white', hover: 'hover:bg-emerald-700',
        badge: 'bg-emerald-700', icon: '📚', label: 'Private Class'
      },
      groupClass: {
        bg: 'bg-rose-500', bgLight: 'bg-rose-100', border: 'border-rose-400',
        text: 'text-rose-700', textWhite: 'text-white', hover: 'hover:bg-rose-600',
        badge: 'bg-rose-600', icon: '👥', label: 'Group Class'
      },
      roomBooking: {
        bg: 'bg-gray-500', bgLight: 'bg-gray-100', border: 'border-gray-400',
        text: 'text-gray-700', textWhite: 'text-white', hover: 'hover:bg-gray-600',
        badge: 'bg-gray-600', icon: '🏠', label: 'Room Booking'
      }
    };

    if (isRoomBooking) return colors.roomBooking;
    if (isTrial) return sessionType === 'group' ? colors.groupTrial : colors.privateTrial;
    if (isGroupClass) return colors.groupClass;
    return colors.privateClass;
  };

  // ⭐ M6: Short badge label
  const getBadgeLabel = (booking: any): string => {
    if (booking.isTrial) {
      return booking.session_type === 'group' ? 'TGL' : 'TPL';
    }
    if (booking.isRoomBooking) return 'ROOM';
    if (booking.isGroupClass) return 'GROUP';
    if (booking.class_code && booking.class_code !== 'N/A') {
      const parts = booking.class_code.split('-');
      return parts[0] || 'CLS';
    }
    return 'CLS';
  };

  // ⭐ M6: Attention label
  const getAttentionLabel = (reason?: string | null): string => {
    if (!reason) return '⚠️ Needs Attention';
    if (reason.startsWith('teacher_leave')) return '⚠️ Teacher on leave';
    if (reason === 'teacher_conflict') return '⚠️ Teacher conflict';
    if (reason === 'room_conflict') return '⚠️ Room conflict';
    return `⚠️ ${reason}`;
  };

  const normalizeTime = (timeStr: string): string => {
    if (!timeStr) return '00:00';
    let time = timeStr;
    if (time.includes(':')) {
      const parts = time.split(':');
      time = parts[0] + ':' + parts[1];
    }
    return time;
  };

  // ==========================================
  // LOAD DATA
  // ==========================================
  async function loadData() {
    setLoading(true);
    setDebugInfo('Loading data...');
    setDebugDetails([]);
    addDebug('🔍 Starting data load...');

    try {
      addDebug('📋 Fetching rooms...');
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms').select('*').eq('is_active', true).order('name');
      if (roomsError) throw new Error(`Rooms Error: ${roomsError.message}`);
      setRooms(roomsData || []);
      addDebug(`✅ Found ${roomsData?.length || 0} rooms`);

      const { data: teachersData } = await supabase
        .from('users').select('id, full_name, email').eq('role', 'teacher').eq('is_active', true);
      addDebug(`✅ Found ${teachersData?.length || 0} teachers`);

      const { data: coursesData } = await supabase
        .from('courses').select('id, name').eq('is_active', true);
      addDebug(`✅ Found ${coursesData?.length || 0} courses`);

      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'week') {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        startDate = new Date(weekStart);
        startDate.setHours(0, 0, 0, 0);
        endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      addDebug(`📅 Date range: ${startDateStr} to ${endDateStr}`);

      // Active trials (not converted)
      const { data: trialData } = await supabase
        .from('trial_class_bookings').select('*')
        .not('status', 'in', '(\'converted\', \'cancelled\', \'completed\')')
        .order('created_at', { ascending: false });
      addDebug(`✅ Found ${trialData?.length || 0} active trials`);

      const { data: roomBookingsData } = await supabase
        .from('room_bookings').select('*')
        .in('status', ['confirmed', 'pending']);
      addDebug(`✅ Found ${roomBookingsData?.length || 0} room bookings`);

      // ⭐ M6: Fetch bookings WITH attention columns
      const { data: bookingsData } = await supabase
        .from('bookings').select('*')
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString());
      addDebug(`✅ Found ${bookingsData?.length || 0} regular bookings`);

      // Class codes
      let classCodeMap: Record<string, string> = {};
      if (bookingsData && bookingsData.length > 0) {
        const classIds = bookingsData
          .filter((b: any) => b.class_id && !b.is_trial)
          .map((b: any) => b.class_id);
        if (classIds.length > 0) {
          const { data: classesData } = await supabase
            .from('classes').select('id, class_code').in('id', classIds);
          if (classesData) {
            classCodeMap = classesData.reduce((acc, c) => {
              acc[c.id] = c.class_code || 'N/A';
              return acc;
            }, {} as Record<string, string>);
          }
        }
      }

      // ⭐ M6: Group sessions WITH attention columns
      addDebug(`🔍 Fetching group class sessions...`);
      const { data: sessionsData } = await supabase
        .from('group_class_sessions').select('*')
        .gte('session_date', startDateStr)
        .lte('session_date', endDateStr);
      const groupSessionsData = sessionsData || [];
      addDebug(`✅ Found ${groupSessionsData.length} group sessions`);

      const { data: classesData } = await supabase
        .from('scheduled_group_classes').select('*');
      const groupClassesData = classesData || [];
      addDebug(`✅ Found ${groupClassesData.length} group classes`);

      // ==========================================
      // Convert trials to calendar format
      // ==========================================
      const trialCalendarBookings: Booking[] = [];
      if (trialData && trialData.length > 0) {
        for (const trial of trialData) {
          if (trial.status === 'converted' || trial.status === 'cancelled' || trial.status === 'completed') continue;
          if (trial.is_converted === true) continue;
          if (!trial.selected_date) continue;

          let startDateTime: Date;
          try {
            const time = normalizeTime(trial.selected_time || '09:00');
            startDateTime = new Date(`${trial.selected_date}T${time}:00`);
            if (isNaN(startDateTime.getTime())) continue;
          } catch (e) { continue; }

          if (startDateTime < startDate || startDateTime > endDate) continue;

          const endDateTime = new Date(startDateTime);
          endDateTime.setHours(startDateTime.getHours() + (trial.hours || 2));

          const teacher = teachersData?.find((t: any) => t.id === trial.selected_teacher_id);
          const course = coursesData?.find((c: any) => c.id === trial.course_id);

          let studentName = '';
          if (trial.student_id) {
            const { data: student } = await supabase
              .from('users').select('full_name').eq('id', trial.student_id).single();
            if (student) studentName = student.full_name || '';
          }

          let level = 'N/A';
          let moduleName = '';
          if (trial.module_id) {
            const { data: moduleData } = await supabase
              .from('course_modules').select('title, level').eq('id', trial.module_id).single();
            if (moduleData) {
              level = moduleData.level || 'N/A';
              moduleName = moduleData.title || '';
            }
          }

          let roomName = 'TBD';
          let roomId = trial.room_id || '';
          if (trial.room_id) {
            const room = roomsData?.find((r: any) => r.id === trial.room_id);
            if (room) { roomName = room.name; roomId = trial.room_id; }
            else if (roomsData && roomsData.length > 0) { roomId = roomsData[0].id; roomName = roomsData[0].name; }
          } else if (roomsData && roomsData.length > 0) {
            roomId = roomsData[0].id; roomName = roomsData[0].name;
          }

          if (roomId) {
            const trialCode = trial.session_type === 'group'
              ? `TGL-${trial.id.slice(0, 8)}`
              : `TPL-${trial.id.slice(0, 8)}`;

            // ⭐ M6: Resolve substitute teacher name if any
            let substituteTeacherName: string | null = null;
            if (trial.substitute_teacher_id) {
              const subTeacher = teachersData?.find((t: any) => t.id === trial.substitute_teacher_id);
              substituteTeacherName = subTeacher?.full_name || null;
            }

            trialCalendarBookings.push({
              id: trial.id,
              room_id: roomId,
              teacher_id: trial.selected_teacher_id || '',
              course_id: trial.course_id || '',
              student_id: trial.student_id || null,
              start_time: startDateTime.toISOString(),
              end_time: endDateTime.toISOString(),
              status: trial.status || 'active',
              class_code: trialCode,
              booking_type: 'trial',
              isTrial: true,
              isGroupClass: false,
              isRoomBooking: false,
              teacher_name: teacher?.full_name || 'Not Assigned',
              course_name: course?.name || 'Trial Class',
              room_name: roomName,
              level: level,
              module_name: moduleName,
              student_name: studentName,
              session_type: trial.session_type || 'private',
              class_id: trial.id,
              // ⭐ M6
              needs_attention: trial.needs_attention || false,
              attention_reason: trial.attention_reason || null,
              substitute_teacher_id: trial.substitute_teacher_id || null,
              substitute_teacher_name: substituteTeacherName,
            });
          }
        }
      }

      // Room bookings
      const roomBookingsCalendar: Booking[] = (roomBookingsData || [])
        .filter((b: any) => {
          const start = new Date(b.start_time);
          return start >= startDate && start <= endDate;
        })
        .map((b: any) => {
          const teacher = teachersData?.find((t: any) => t.id === b.teacher_id);
          const room = roomsData?.find((r: any) => r.id === b.room_id);
          return {
            id: b.id,
            room_id: b.room_id || '',
            teacher_id: b.teacher_id || '',
            course_id: '',
            student_id: null,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status || 'confirmed',
            class_code: `ROOM-${b.id.slice(0, 8)}`,
            booking_type: 'room_booking',
            isTrial: false,
            isGroupClass: false,
            isRoomBooking: true,
            teacher_name: teacher?.full_name || 'Not Assigned',
            course_name: b.title || 'Room Booking',
            room_name: room?.name || 'TBD',
            title: b.title || 'Room Booking',
            level: 'N/A',
            module_name: '',
            student_name: '',
            class_id: b.id,
          };
        });

      // Regular class bookings
      const formattedBookings: Booking[] = (bookingsData || [])
        .filter((b: any) =>
          ['confirmed', 'in_progress', 'pending'].includes(b.status) &&
          b.is_trial !== true
        )
        .map((b: any) => {
          const teacher = teachersData?.find((t: any) => t.id === b.teacher_id);
          const course = coursesData?.find((c: any) => c.id === b.course_id);
          const room = roomsData?.find((r: any) => r.id === b.room_id);

          // ⭐ M6: Resolve substitute teacher name
          let substituteTeacherName: string | null = null;
          if (b.substitute_teacher_id) {
            const subTeacher = teachersData?.find((t: any) => t.id === b.substitute_teacher_id);
            substituteTeacherName = subTeacher?.full_name || null;
          }

          return {
            ...b,
            class_code: classCodeMap[b.class_id] || 'N/A',
            booking_type: 'class',
            isTrial: false,
            isGroupClass: false,
            isRoomBooking: false,
            teacher_name: teacher?.full_name || 'Not Assigned',
            course_name: course?.name || 'Class',
            room_name: room?.name || 'TBD',
            level: 'N/A',
            module_name: '',
            session_type: 'private',
            // ⭐ M6
            needs_attention: b.needs_attention || false,
            attention_reason: b.attention_reason || null,
            substitute_teacher_id: b.substitute_teacher_id || null,
            substitute_teacher_name: substituteTeacherName,
          };
        });

      // Group class sessions
      const groupSessionsCalendar: Booking[] = [];
      if (groupSessionsData && groupSessionsData.length > 0) {
        const groupClassMap: Record<string, any> = {};
        groupClassesData.forEach((gc: any) => { groupClassMap[gc.id] = gc; });

        for (const session of groupSessionsData) {
          const group = groupClassMap[session.group_class_id];
          if (!group) continue;
          if (!['active', 'pending_teacher', 'pending_admin', 'completed'].includes(group.status)) continue;

          const teacherId = session.teacher_id || group.teacher_ids?.[0];
          const teacher = teachersData?.find((t: any) => t.id === teacherId);
          const roomId = session.room_id || group.room_id;
          const room = roomsData?.find((r: any) => r.id === roomId);

          let courseName = 'Group Class';
          if (group.course_id) {
            const course = coursesData?.find((c: any) => c.id === group.course_id);
            if (course) courseName = course.name;
          }

          let startDateTime: Date | null = null;
          let endDateTime: Date | null = null;
          let validDate = true;
          try {
            const dateStr = session.session_date;
            const startTimeStr = normalizeTime(session.start_time);
            const endTimeStr = normalizeTime(session.end_time);
            startDateTime = new Date(`${dateStr}T${startTimeStr}:00`);
            endDateTime = new Date(`${dateStr}T${endTimeStr}:00`);
            if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) validDate = false;
          } catch (e) { validDate = false; }

          if (!validDate || !startDateTime || !endDateTime) continue;
          if (startDateTime < startDate || startDateTime > endDate) continue;

          // ⭐ M6: Resolve substitute teacher name
          let substituteTeacherName: string | null = null;
          if (session.substitute_teacher_id) {
            const subTeacher = teachersData?.find((t: any) => t.id === session.substitute_teacher_id);
            substituteTeacherName = subTeacher?.full_name || null;
          }

          groupSessionsCalendar.push({
            id: session.id,
            room_id: roomId || '',
            teacher_id: teacherId || '',
            course_id: group.course_id || '',
            student_id: null,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            status: session.status || 'scheduled',
            class_code: `GROUP-${session.group_class_id.slice(0, 8)}`,
            booking_type: 'group_class',
            isTrial: false,
            isGroupClass: true,
            isRoomBooking: false,
            teacher_name: teacher?.full_name || '⚠️ No Teacher Assigned',
            course_name: courseName,
            room_name: room?.name || 'TBD',
            level: 'N/A',
            module_name: group.class_name || 'Group Class',
            student_name: '',
            class_id: session.group_class_id,
            title: `${group.class_name} (Session ${session.session_number})`,
            // ⭐ M6
            needs_attention: session.needs_attention || false,
            attention_reason: session.attention_reason || null,
            substitute_teacher_id: session.substitute_teacher_id || null,
            substitute_teacher_name: substituteTeacherName,
          });
        }
      }

      const allBookings = [...trialCalendarBookings, ...roomBookingsCalendar, ...formattedBookings, ...groupSessionsCalendar];
      allBookings.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      setBookings(allBookings);

      const totalBookings = allBookings.length;
      const trialCount = allBookings.filter(b => b.isTrial).length;
      const roomCount = allBookings.filter(b => b.isRoomBooking).length;
      const groupClassCount = allBookings.filter(b => b.isGroupClass).length;
      const privateClassCount = allBookings.filter(b => !b.isTrial && !b.isRoomBooking && !b.isGroupClass).length;
      const flaggedCount = allBookings.filter(b => b.needs_attention).length;

      addDebug(`📊 FINAL: ${totalBookings} bookings (${privateClassCount} private, ${groupClassCount} group, ${trialCount} trials, ${roomCount} room), ${flaggedCount} flagged`);
      setDebugInfo(`✅ Found ${totalBookings} bookings${flaggedCount > 0 ? ` · ⚠️ ${flaggedCount} need attention` : ''}`);

    } catch (err: any) {
      console.error('❌ Load Error:', err);
      addDebug(`❌ Error: ${err.message}`);
      setDebugInfo(`⚠️ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [selectedDate, viewMode]);

  // ==========================================
  // HELPERS
  // ==========================================
  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-green-500', in_progress: 'bg-blue-500', completed: 'bg-gray-500',
      cancelled: 'bg-red-500', pending: 'bg-yellow-500', scheduled: 'bg-blue-500',
      ongoing: 'bg-green-500', draft: 'bg-gray-400', active: 'bg-green-500',
      converted: 'bg-emerald-500',
    };
    return map[status] || 'bg-gray-400';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      confirmed: '✅ Confirmed', in_progress: '🔄 In Progress', completed: '✅ Completed',
      cancelled: '❌ Cancelled', pending: '⏳ Pending', scheduled: '📅 Scheduled',
      ongoing: '🔄 Ongoing', draft: '📝 Draft', active: '✅ Active',
      converted: '✅ Converted',
    };
    return map[status] || status;
  };

  const navigate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'week') {
      setSelectedDate(direction === 'next' ? addWeeks(newDate, 1) : subWeeks(newDate, 1));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
      setSelectedDate(newDate);
    }
  };

  const goToToday = () => setSelectedDate(new Date());
  const isToday = (date: Date) => isSameDay(date, new Date());
  const isCurrentWeek = (date: Date) => isSameWeek(date, new Date(), { weekStartsOn: 1 });

  const getRoomName = (id: string) => {
    const room = rooms.find(r => r.id === id);
    return room?.name || 'Unknown Room';
  };

  const getLevelLabel = (level: string) => {
    if (!level || level === 'N/A') return '';
    return level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ');
  };

  // ==========================================
  // LEGEND — with flagged indicator
  // ==========================================
  const renderLegend = () => {
    const legendItems = [
      { color: 'bg-purple-600', label: '🎯 Private Trial', border: 'border-purple-500' },
      { color: 'bg-cyan-600', label: '👥 Group Trial', border: 'border-cyan-500' },
      { color: 'bg-emerald-600', label: '📚 Private Class', border: 'border-emerald-500' },
      { color: 'bg-rose-500', label: '👥 Group Class', border: 'border-rose-400' },
      { color: 'bg-gray-500', label: '🏠 Room Booking', border: 'border-gray-400' },
      { color: 'bg-amber-400', label: '⚠️ Needs Substitute', border: 'border-amber-500' },
    ];

    return (
      <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-wrap items-center gap-3 text-xs sticky top-0 z-30 shadow-sm">
        <span className="font-medium text-gray-700">🎨 Legend:</span>
        {legendItems.map((item, index) => (
          <span key={index} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${item.color} border ${item.border}`}></span>
            <span className="text-gray-600">{item.label}</span>
          </span>
        ))}
        <span className="ml-auto text-gray-400 text-[10px]">
          {bookings.length} bookings displayed
        </span>
      </div>
    );
  };

  const renderDebugInfo = () => {
    if (!showDebug) {
      return (
        <button
          onClick={() => setShowDebug(true)}
          className="text-[10px] text-gray-400 hover:text-gray-600 mb-2"
        >
          🔍 Show debug log
        </button>
      );
    }
    return (
      <div className="bg-gray-900 text-green-400 p-4 rounded-lg mb-4 text-xs font-mono max-h-60 overflow-y-auto relative">
        <button
          onClick={() => setShowDebug(false)}
          className="absolute top-2 right-2 text-white hover:text-gray-300 text-lg"
        >
          ✕
        </button>
        <div className="font-bold text-white mb-2">🔍 Debug Log:</div>
        {debugDetails.map((msg, idx) => (
          <div key={idx} className="py-0.5">{msg}</div>
        ))}
      </div>
    );
  };

  // ==========================================
  // WEEK VIEW — ⭐ FIXED: fixed row height, clipped cards
  // ==========================================
  const renderWeekView = () => {
    if (rooms.length === 0) {
      return <div className="p-8 text-center text-gray-500"><p>No rooms available.</p></div>;
    }

    return (
      <div className="overflow-x-auto relative" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="min-w-[1200px]">
          {/* Header row */}
          <div className="grid border-b bg-gray-50 sticky top-0 z-20 shadow-sm" style={{ gridTemplateColumns: '150px repeat(7, 1fr)' }}>
            <div className="p-3 bg-gray-50 font-medium text-gray-600 sticky left-0 z-30 border-r">Room</div>
            {weekDaysArray.map((day, i) => (
              <div key={i} className={`p-3 text-center ${isToday(day) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <div className="font-medium">{format(day, 'EEE')}</div>
                <div className={`text-sm ${isToday(day) ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {rooms.map((room) => {
            const roomBookings = bookings.filter(b => b.room_id === room.id);
            return (
              <div key={room.id} className="grid border-b hover:bg-gray-50/30" style={{ gridTemplateColumns: '150px repeat(7, 1fr)' }}>
                <div className="p-3 bg-gray-50 sticky left-0 z-10 border-r flex flex-col justify-center h-[140px] shadow-sm">
                  <div className="font-medium text-gray-800 text-sm">{room.name}</div>
                  <div className="text-xs text-gray-500">Cap: {room.capacity}</div>
                </div>
                {weekDaysArray.map((day, dayIndex) => {
                  const dayBookings = roomBookings
                    .filter((b) => isSameDay(new Date(b.start_time), day))
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

                  return (
                    <div
                      key={dayIndex}
                      className="p-2 border-r h-[140px] overflow-y-auto flex flex-col gap-1 relative"
                    >
                      {dayBookings.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-green-600 font-medium bg-green-50/50 m-2 rounded pointer-events-none">
                          Available
                        </div>
                      ) : (
                        dayBookings.map((booking: any) => {
                          const colors = getBookingColors(booking);
                          const displayName = booking.isTrial
                            ? `${booking.course_name || 'Trial'}`
                            : booking.isRoomBooking
                            ? `${booking.title || 'Room Booking'}`
                            : `${booking.course_name || 'Class'}`;
                          const levelDisplay = booking.level && booking.level !== 'N/A' ? getLevelLabel(booking.level) : '';
                          const showNoTeacherWarning = booking.isGroupClass &&
                            (!booking.teacher_id || booking.teacher_name === '⚠️ No Teacher Assigned');
                          const badgeLabel = getBadgeLabel(booking);
                          const isFlagged = booking.needs_attention === true;

                          return (
                            <button
                              key={booking.id}
                              onClick={() => setSelectedBooking(booking)}
                              className={`w-full text-left p-1.5 rounded shadow-sm border-2 ${colors.border} hover:shadow-md transition text-[10px] ${colors.bgLight} ${colors.text} flex flex-col justify-start hover:opacity-90 relative overflow-hidden shrink-0 ${
                                isFlagged ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                              }`}
                              style={{ maxHeight: '120px' }}
                              title={displayName}
                            >
                              {/* ⭐ M6: ⚠️ corner badge — INSIDE the card */}
                              {isFlagged && (
                                <span className="absolute top-0.5 right-0.5 bg-amber-400 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-md z-10">
                                  ⚠️
                                </span>
                              )}

                              {/* Course name — truncated to 2 lines max */}
                              <div className="font-bold text-[10px] leading-tight line-clamp-2 mb-0.5 pr-4">
                                {colors.icon} {displayName}
                              </div>

                              {levelDisplay && (
                                <div className="text-[7px] font-medium truncate opacity-80 leading-tight">
                                  {levelDisplay}
                                </div>
                              )}

                              {booking.module_name && (
                                <div className="text-[7px] truncate opacity-70 leading-tight">
                                  {booking.module_name}
                                </div>
                              )}

                              <div className="flex justify-between items-center gap-1 text-[8px] mt-0.5">
                                <span className={`truncate flex-1 min-w-0 ${showNoTeacherWarning ? 'text-red-500 font-semibold' : ''}`}>
                                  {booking.substitute_teacher_name
                                    ? `Sub: ${booking.substitute_teacher_name}`
                                    : booking.teacher_name || 'Unknown'}
                                </span>
                                <span className={`shrink-0 px-1 rounded text-[6px] font-bold text-white ${colors.badge}`}>
                                  {badgeLabel}
                                </span>
                              </div>

                              <div className="text-[7px] opacity-70 mt-0.5 leading-tight">
                                {format(parseISO(booking.start_time), 'h:mm a')}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==========================================
  // DAY VIEW — ⭐ FIXED: fixed cell height, clipped cards
  // ==========================================
  const renderDayView = () => {
    if (rooms.length === 0) {
      return <div className="p-8 text-center text-gray-500"><p>No rooms available.</p></div>;
    }

    const hours = Array.from({ length: 14 }, (_, i) => i + 8);
    return (
      <div className="overflow-x-auto relative" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="min-w-[800px]">
          {/* Header row */}
          <div className="grid border-b bg-gray-50 sticky top-0 z-20 shadow-sm" style={{ gridTemplateColumns: `80px repeat(${rooms.length || 1}, minmax(120px, 1fr))` }}>
            <div className="p-3 font-medium text-gray-600 sticky left-0 z-30 border-r text-xs text-center bg-gray-50">Time</div>
            {rooms.map((room) => (
              <div key={room.id} className="p-2 border-r text-center bg-gray-50">
                <div className="font-medium text-xs text-gray-800">{room.name}</div>
                <div className="text-[10px] text-gray-400">Cap: {room.capacity}</div>
              </div>
            ))}
          </div>

          {hours.map((hour) => {
            const slotDate = new Date(selectedDate);
            slotDate.setHours(hour, 0, 0, 0);
            return (
              <div key={hour} className="grid border-b hover:bg-gray-50/30" style={{ gridTemplateColumns: `80px repeat(${rooms.length || 1}, minmax(120px, 1fr))` }}>
                <div className="p-2 bg-gray-50 sticky left-0 z-10 border-r flex items-center justify-center text-xs font-mono text-gray-500">
                  {format(slotDate, 'h:mm a')}
                </div>
                {rooms.map((room) => {
                  const roomBookings = bookings.filter(
                    (b) =>
                      b.room_id === room.id &&
                      isSameDay(new Date(b.start_time), selectedDate) &&
                      new Date(b.start_time).getHours() <= hour &&
                      new Date(b.end_time).getHours() > hour
                  ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

                  return (
                    <div
                      key={room.id}
                      className="p-1 border-r h-[70px] overflow-hidden flex flex-col gap-1 justify-center"
                    >
                      {roomBookings.length > 0 ? (
                        roomBookings.map((booking: any) => {
                          const colors = getBookingColors(booking);
                          const displayName = booking.isTrial
                            ? `${booking.course_name || 'Trial'}`
                            : booking.isRoomBooking
                            ? `${booking.title || 'Room Booking'}`
                            : `${booking.course_name || 'Class'}`;
                          const showNoTeacherWarning = booking.isGroupClass &&
                            (!booking.teacher_id || booking.teacher_name === '⚠️ No Teacher Assigned');
                          const badgeLabel = getBadgeLabel(booking);
                          const isFlagged = booking.needs_attention === true;

                          return (
                            <button
                              key={booking.id}
                              onClick={() => setSelectedBooking(booking)}
                              className={`w-full text-left p-1.5 rounded shadow-sm border-2 ${colors.border} hover:shadow-md transition ${colors.bgLight} ${colors.text} flex flex-col justify-center hover:opacity-90 relative overflow-hidden`}
                              style={{ maxHeight: '62px' }}
                              title={displayName}
                            >
                              {isFlagged && (
                                <span className="absolute top-0.5 right-0.5 bg-amber-400 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-md z-10">
                                  ⚠️
                                </span>
                              )}

                              <div className="flex justify-between items-start gap-1 mb-0.5">
                                <span className="font-bold text-[9px] leading-tight line-clamp-1 flex-1">
                                  {colors.icon} {displayName}
                                </span>
                                <span className={`shrink-0 px-1 rounded text-[6px] font-bold text-white ${colors.badge}`}>
                                  {badgeLabel}
                                </span>
                              </div>

                              <div className={`text-[7px] truncate ${showNoTeacherWarning ? 'text-red-500 font-semibold' : 'opacity-80'}`}>
                                {booking.substitute_teacher_name
                                  ? `Sub: ${booking.substitute_teacher_name}`
                                  : booking.teacher_name || 'Unknown'}
                                {showNoTeacherWarning && ' ⚠️'}
                              </div>

                              <div className="text-[7px] opacity-70 mt-0.5">
                                {format(parseISO(booking.start_time), 'h:mm')} - {format(parseISO(booking.end_time), 'h:mm')}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full mx-auto">
                          Available
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="text-3xl">📅</span> Class Schedule
          </h1>
          <p className={`text-xs mt-1 ${debugInfo.includes('Error') ? 'text-red-500' : 'text-gray-400'}`}>
            {debugInfo}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={goToToday}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                (viewMode === 'day' ? isToday(selectedDate) : isCurrentWeek(selectedDate))
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              Today
            </button>

            <div className="flex items-center gap-1 border-l border-r border-gray-200 px-1 mx-1">
              <button onClick={() => navigate('prev')} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white rounded transition">←</button>
              <span className="text-sm font-semibold min-w-[140px] text-center text-gray-800 px-2">
                {viewMode === 'day' ? format(selectedDate, 'MMM d, yyyy') : `${format(weekDaysArray[0], 'MMM d')} - ${format(weekDaysArray[6], 'MMM d')}`}
              </span>
              <button onClick={() => navigate('next')} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white rounded transition">→</button>
            </div>

            <div className="flex bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <button onClick={() => setViewMode('day')} className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'day' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>Day</button>
              <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 text-xs font-medium transition border-l border-gray-200 ${viewMode === 'week' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>Week</button>
            </div>
          </div>

          <Link href="/dashboard/staff/teachers/calendar">
            <button className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm flex items-center gap-2">
              👨‍🏫 Teachers
            </button>
          </Link>
        </div>
      </div>

      {renderDebugInfo()}
      {renderLegend()}

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {viewMode === 'day' ? renderDayView() : renderWeekView()}
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">Booking Details</h3>
              <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* ⭐ M6: Flagged banner */}
            {selectedBooking.needs_attention && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <span className="text-lg">⚠️</span>
                  {getAttentionLabel(selectedBooking.attention_reason)}
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  {selectedBooking.substitute_teacher_name
                    ? `Substitute assigned: ${selectedBooking.substitute_teacher_name}`
                    : 'A substitute teacher needs to be assigned.'}
                </p>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Type</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedBooking.isTrial
                    ? (selectedBooking.session_type === 'group' ? 'bg-cyan-100 text-cyan-700' : 'bg-purple-100 text-purple-700')
                  : selectedBooking.isRoomBooking ? 'bg-gray-100 text-gray-700'
                  : selectedBooking.isGroupClass ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {selectedBooking.isTrial
                    ? (selectedBooking.session_type === 'group' ? '👥 Group Trial' : '🎯 Private Trial')
                   : selectedBooking.isRoomBooking ? '🏠 Room Booking'
                   : selectedBooking.isGroupClass ? '👥 Group Class'
                   : '📚 Private Class'}
                </span>
              </div>

              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Code</span>
                <span className="font-mono font-bold text-gray-700">
                  {selectedBooking.class_code && selectedBooking.class_code !== 'N/A'
                    ? selectedBooking.class_code
                    : (selectedBooking.isTrial
                        ? (selectedBooking.session_type === 'group'
                            ? `TGL-${selectedBooking.id.slice(0, 8)}`
                            : `TPL-${selectedBooking.id.slice(0, 8)}`)
                        : 'N/A')}
                </span>
              </div>

              {selectedBooking.student_name && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Student</span>
                  <span className="font-medium">{selectedBooking.student_name}</span>
                </div>
              )}

              {selectedBooking.title && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Title</span>
                  <span className="font-medium">{selectedBooking.title}</span>
                </div>
              )}

              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Room</span>
                <span className="font-medium">{getRoomName(selectedBooking.room_id)}</span>
              </div>

              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Course</span>
                <span className="font-medium">{selectedBooking.course_name || selectedBooking.title || 'Unknown'}</span>
              </div>

              {/* ⭐ M6: Teacher OR Substitute */}
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">
                  {selectedBooking.substitute_teacher_name ? 'Substitute' : 'Teacher'}
                </span>
                <span className={`font-medium ${!selectedBooking.teacher_id || selectedBooking.teacher_name === '⚠️ No Teacher Assigned' ? 'text-red-500' : ''}`}>
                  👨‍🏫 {selectedBooking.substitute_teacher_name || selectedBooking.teacher_name || 'Not Assigned'}
                  {(!selectedBooking.teacher_id || selectedBooking.teacher_name === '⚠️ No Teacher Assigned') && ' ⚠️'}
                </span>
              </div>

              {/* ⭐ M6: Show original teacher if substitute assigned */}
              {selectedBooking.substitute_teacher_name && selectedBooking.teacher_name && (
                <div className="flex justify-between border-b pb-2 text-xs">
                  <span className="text-gray-400">Original</span>
                  <span className="text-gray-500 line-through">{selectedBooking.teacher_name}</span>
                </div>
              )}

              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Time</span>
                <span className="font-medium">{format(parseISO(selectedBooking.start_time), 'MMM d, h:mm a')} - {format(parseISO(selectedBooking.end_time), 'h:mm a')}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs text-white ${getStatusColor(selectedBooking.status)}`}>
                  {getStatusLabel(selectedBooking.status)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={() => setSelectedBooking(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Close</button>

              {/* ⭐ M6: Link to substitute dashboard if flagged */}
              {selectedBooking.needs_attention && !selectedBooking.substitute_teacher_name && (
                <Link href="/dashboard/substitutes/needed">
                  <button className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition">
                    🔄 Find Substitute
                  </button>
                </Link>
              )}

              {selectedBooking.isTrial && (
                <>
                  <Link href={`/dashboard/classes/confirmation-print?id=${selectedBooking.id}`}>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">🖨️ Print</button>
                  </Link>
                  {!selectedBooking.is_converted && !selectedBooking.converted_class_id && (
                    <Link href={`/dashboard/classes/trial-to-register?trialId=${selectedBooking.id}`}>
                      <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">🔄 Convert</button>
                    </Link>
                  )}
                </>
              )}
              {selectedBooking.isGroupClass && (
                <Link href={`/dashboard/classes/group-class/view?id=${selectedBooking.class_id}`}>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">👥 View Group</button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}