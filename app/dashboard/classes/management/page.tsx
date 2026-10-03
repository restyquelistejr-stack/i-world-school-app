// app/dashboard/classes/management/page.tsx
// ⭐ M6: Shows ⚠️ flagged session counts for group classes + Substitute links
// ⭐ FIX: Group class teacher display — now shows actual teacher(s)
// ⭐ PHASE 5: Adds Room Needed queue links + counts
// ⭐ v3.14: Soft delete + status buckets + archive (no more hard delete)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import ArchiveConfirmModal from '@/components/ArchiveConfirmModal';
import StatusFilterPills from '@/components/StatusFilterPills';
import {
  classifyClass,
  countBuckets,
  filterByBuckets,
  StatusBucket,
} from '@/lib/filters/managementFilters';
import { useStatusFilter } from '@/lib/hooks/useStatusFilter';
import { archiveClass, archiveScheduledGroupClass } from '@/lib/archiveService';

// --- INTERFACES ---
interface Course { id: string; name: string; }
interface Module { id: string; title: string; level: string; }
interface Teacher { id: string; full_name: string; }
interface Room { id: string; name: string; }

interface ClassRecord {
  id: string;
  class_code: string;
  course_id: string;
  module_id: string | null;
  teacher_id: string | null;
  room_id: string | null;
  max_students: number;
  total_sessions: number;
  status: string;
  created_at: string;
  course?: Course | null;
  module?: Module | null;
  teacher?: Teacher | null;
  room?: Room | null;
  level?: string;
  start_date?: string;
  end_date?: string;
  enrolled_count?: number;
  booking_type: 'class' | 'trial' | 'group_class' | 'room_booking';
  group_class_id?: string;
  student_name?: string;
  session_type?: string;
  hours?: number;
  selected_date?: string;
  selected_time?: string;
  title?: string;
  purpose?: string;
  description?: string;
  is_converted?: boolean;
  converted_at?: string | null;
  converted_class_id?: string | null;
  display_type?: string;
  flagged_count?: number;
  room_flagged_count?: number;
  additional_teacher_count?: number;
  // ⭐ v3.14: raw fields for bucket classification
  is_deleted?: boolean | null;
  end_date_raw?: string | null;    // ISO date for bucket logic (not the display string)
}

export default function ManageClasses() {
  const [allClasses, setAllClasses] = useState<ClassRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'class' | 'trial' | 'group_class' | 'room_booking'>('all');
  const [filterTrialStatus, setFilterTrialStatus] = useState<'all' | 'active' | 'converted'>('all');
  const [trialCount, setTrialCount] = useState<number>(0);
  const [roomBookingCount, setRoomBookingCount] = useState<number>(0);
  const [totalFlagged, setTotalFlagged] = useState<number>(0);
  const [roomNeededCount, setRoomNeededCount] = useState<number>(0);

  // ⭐ v3.14: archive modal state
  const [archiveTarget, setArchiveTarget] = useState<{
    type: 'class' | 'group_class';
    id: string;
    name: string;
    code?: string;
  } | null>(null);

  // ⭐ v3.14: dismissible auto-hint (per session)
  const [hintDismissed, setHintDismissed] = useState(false);

  // ⭐ v3.14: persistent status bucket filter
  const { active: activeBuckets, toggle: toggleBucket } = useStatusFilter(
    'management.classes.buckets',
    ['active']
  );

  useEffect(() => {
    loadData();
    const dismissed = sessionStorage.getItem('management.hintDismissed');
    if (dismissed === 'true') setHintDismissed(true);
  }, []);

  function dismissHint() {
    setHintDismissed(true);
    sessionStorage.setItem('management.hintDismissed', 'true');
  }

  // ==========================================
  // MAIN LOAD
  // ==========================================
  async function loadData() {
    setLoading(true);
    try {
      const [coursesRes, modulesRes, teachersRes, roomsRes] = await Promise.all([
        supabase.from('courses').select('id, name').eq('is_active', true).order('name'),
        supabase.from('course_modules').select('id, title, level').order('title'),
        supabase.from('users').select('id, full_name').eq('role', 'teacher').order('full_name'),
        supabase.from('rooms').select('id, name').order('name'),
      ]);

      const coursesData = coursesRes.data || [];
      const modulesData = modulesRes.data || [];
      const teachersData = teachersRes.data || [];
      const roomsData = roomsRes.data || [];

      setCourses(coursesData);
      setModules(modulesData);
      setTeachers(teachersData);
      setRooms(roomsData);

      const classRecords: ClassRecord[] = [];

      // ---------- 2a. Private classes ----------
      const { data: classesData } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });

      if (classesData) {
        for (const item of classesData) {
          // Resolve display dates from class_options
          const { data: optionsData } = await supabase
            .from('class_options')
            .select('start_time')
            .eq('class_id', item.id)
            .order('start_time', { ascending: true });

          let startDate = 'N/A';
          let endDate = 'N/A';
          let endDateRaw: string | null = null;
          if (optionsData && optionsData.length > 0) {
            const first = optionsData[0];
            const last = optionsData[optionsData.length - 1];
            startDate = first.start_time ? format(parseISO(first.start_time), 'MMM d') : 'N/A';
            endDate = last.start_time ? format(parseISO(last.start_time), 'MMM d') : 'N/A';
            endDateRaw = last.start_time ? String(last.start_time).slice(0, 10) : null;
          }

          const { count } = await supabase
            .from('class_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', item.id)
            .eq('status', 'active');

          const { count: flaggedCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', item.id)
            .eq('needs_attention', true);

          const level = item.module_id
            ? modulesData.find((m: Module) => m.id === item.module_id)?.level || 'N/A'
            : 'N/A';

          classRecords.push({
            id: item.id,
            class_code: item.class_code || `CLS-${item.id.slice(0, 8)}`,
            course_id: item.course_id,
            module_id: item.module_id || null,
            teacher_id: item.teacher_id || null,
            room_id: item.room_id || null,
            max_students: item.max_students || 1,
            total_sessions: item.total_sessions || 0,
            status: item.status || 'draft',
            created_at: item.created_at,
            course: coursesData.find((c: Course) => c.id === item.course_id) || null,
            module: modulesData.find((m: Module) => m.id === item.module_id) || null,
            teacher: teachersData.find((t: Teacher) => t.id === item.teacher_id) || null,
            room: roomsData.find((r: Room) => r.id === item.room_id) || null,
            level,
            start_date: startDate,
            end_date: endDate,
            end_date_raw: endDateRaw,
            enrolled_count: count || 0,
            booking_type: 'class',
            flagged_count: flaggedCount || 0,
            is_deleted: item.is_deleted ?? false,
          });
        }
      }

      // ---------- 2b. Trial class bookings ----------
      const { data: trialData } = await supabase
        .from('trial_class_bookings')
        .select('*')
        .order('created_at', { ascending: false });

      setTrialCount(trialData?.length || 0);

      if (trialData) {
        for (const item of trialData) {
          const level = item.module_id
            ? (await supabase.from('course_modules').select('level').eq('id', item.module_id).single()).data?.level || 'N/A'
            : 'N/A';

          let studentName = '';
          if (item.student_id) {
            const { data: student } = await supabase
              .from('users').select('full_name').eq('id', item.student_id).single();
            if (student) studentName = student.full_name || '';
          }

          const sessionType = item.session_type || 'private';
          const displayType = sessionType === 'private' ? 'Trial PL' : 'Trial GL';
          const codePrefix = sessionType === 'private' ? 'TPL' : 'TGL';

          const isConverted =
            item.is_converted === true ||
            item.status === 'converted' ||
            !!item.converted_class_id;

          classRecords.push({
            id: item.id,
            class_code: `${codePrefix}-${item.id.slice(0, 8)}`,
            course_id: item.course_id,
            module_id: item.module_id || null,
            teacher_id: item.selected_teacher_id || null,
            room_id: item.room_id || null,
            max_students: 1,
            total_sessions: 1,
            status: isConverted ? 'converted' : (item.status || 'active'),
            created_at: item.created_at,
            course: coursesData.find((c: Course) => c.id === item.course_id) || null,
            module: modulesData.find((m: Module) => m.id === item.module_id) || null,
            teacher: teachersData.find((t: Teacher) => t.id === item.selected_teacher_id) || null,
            room: roomsData.find((r: Room) => r.id === item.room_id) || null,
            level,
            start_date: item.selected_date ? format(parseISO(item.selected_date), 'MMM d') : 'N/A',
            end_date: item.selected_date ? format(parseISO(item.selected_date), 'MMM d') : 'N/A',
            end_date_raw: item.selected_date || null,
            enrolled_count: 0,
            booking_type: 'trial',
            student_name: studentName,
            session_type: sessionType,
            display_type: displayType,
            hours: item.hours || 2,
            selected_date: item.selected_date,
            selected_time: item.selected_time,
            is_converted: isConverted,
            converted_at: item.converted_at || null,
            converted_class_id: item.converted_class_id || null,
            flagged_count: item.needs_attention ? 1 : 0,
            is_deleted: item.is_deleted ?? false,
          });
        }
      }

      // ---------- 2c. Scheduled group classes ----------
      const { data: groupData } = await supabase
        .from('scheduled_group_classes')
        .select('*')
        .order('created_at', { ascending: false });

      if (groupData) {
        for (const item of groupData) {
          const level = item.module_id
            ? (await supabase.from('course_modules').select('level').eq('id', item.module_id).single()).data?.level || 'N/A'
            : 'N/A';

          const { count: flaggedCount } = await supabase
            .from('group_class_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('group_class_id', item.id)
            .eq('needs_attention', true)
            .neq('attention_reason', 'room_unassigned');

          const { count: roomFlaggedCount } = await supabase
            .from('group_class_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('group_class_id', item.id)
            .eq('needs_attention', true)
            .eq('attention_reason', 'room_unassigned');

          const teacherIds: string[] = item.teacher_ids || [];
          let teacherDisplay: { id: string; full_name: string } | null = null;
          let additionalTeacherCount = 0;

          if (teacherIds.length > 0) {
            const matched = teachersData
              .filter((t: Teacher) => teacherIds.includes(t.id))
              .sort((a: Teacher, b: Teacher) => a.full_name.localeCompare(b.full_name));
            if (matched.length > 0) {
              teacherDisplay = { id: matched[0].id, full_name: matched[0].full_name };
              additionalTeacherCount = matched.length - 1;
            }
          }

          classRecords.push({
            id: item.id,
            class_code: `GL-${item.id.slice(0, 8)}`,
            course_id: item.course_id,
            module_id: item.module_id || null,
            teacher_id: teacherDisplay?.id || null,
            room_id: item.room_id || null,
            max_students: item.max_students || 20,
            total_sessions: item.total_sessions || 0,
            status: item.status || 'draft',
            created_at: item.created_at,
            course: coursesData.find((c: Course) => c.id === item.course_id) || null,
            module: modulesData.find((m: Module) => m.id === item.module_id) || null,
            teacher: teacherDisplay,
            additional_teacher_count: additionalTeacherCount,
            room: roomsData.find((r: Room) => r.id === item.room_id) || null,
            level,
            start_date: item.start_date ? format(parseISO(item.start_date), 'MMM d') : 'N/A',
            end_date: item.end_date ? format(parseISO(item.end_date), 'MMM d') : 'N/A',
            end_date_raw: item.end_date || null,
            enrolled_count: item.current_students || 0,
            booking_type: 'group_class',
            group_class_id: item.id,
            flagged_count: flaggedCount || 0,
            room_flagged_count: roomFlaggedCount || 0,
            is_deleted: item.is_deleted ?? false,
          });
        }
      }

      // ---------- 2d. Room bookings ----------
      const { data: roomBookingsData } = await supabase
        .from('room_bookings')
        .select('*')
        .order('created_at', { ascending: false });

      setRoomBookingCount(roomBookingsData?.length || 0);

      if (roomBookingsData) {
        for (const item of roomBookingsData) {
          const room = roomsData.find((r: Room) => r.id === item.room_id);
          const teacher = teachersData.find((t: Teacher) => t.id === item.teacher_id);
          const endTimeRaw = item.end_time ? String(item.end_time).slice(0, 10) : null;

          classRecords.push({
            id: item.id,
            class_code: `RM-${item.id.slice(0, 8)}`,
            course_id: '',
            module_id: null,
            teacher_id: item.teacher_id || null,
            room_id: item.room_id || null,
            max_students: item.student_count || 1,
            total_sessions: 1,
            status: item.status || 'confirmed',
            created_at: item.created_at,
            course: null,
            module: null,
            teacher: teacher || null,
            room: room || null,
            level: 'N/A',
            start_date: item.start_time ? format(parseISO(item.start_time), 'MMM d') : 'N/A',
            end_date: item.end_time ? format(parseISO(item.end_time), 'MMM d') : 'N/A',
            end_date_raw: endTimeRaw,
            enrolled_count: item.student_count || 0,
            booking_type: 'room_booking',
            title: item.title || 'Room Booking',
            purpose: item.booking_type || 'meeting',
            description: item.description || '',
            is_deleted: item.is_deleted ?? false,
          });
        }
      }

      classRecords.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setAllClasses(classRecords);

      setTotalFlagged(classRecords.reduce((sum, c) => sum + (c.flagged_count || 0), 0));
      setRoomNeededCount(classRecords.reduce((sum, c) => sum + (c.room_flagged_count || 0), 0));

    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  // ==========================================
  // ARCHIVE HANDLER
  // ==========================================
  async function handleArchiveConfirm(reason: string) {
    if (!archiveTarget) return;

    const options = { reason, actorRole: 'admin' };

    const res = archiveTarget.type === 'group_class'
      ? await archiveScheduledGroupClass(archiveTarget.id, options)
      : await archiveClass(archiveTarget.id, options);

    if (!res.success) {
      alert('Failed to archive: ' + (res.error || 'Unknown error'));
      return;
    }

    setArchiveTarget(null);
    await loadData();
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function getStatusClass(status: string) {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_admin: 'bg-purple-100 text-purple-800',
      pending_student: 'bg-yellow-100 text-yellow-800',
      pending_enrollment: 'bg-blue-100 text-blue-800',
      pending_teacher: 'bg-orange-100 text-orange-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-teal-100 text-teal-800',
      cancelled: 'bg-red-100 text-red-800',
      converted: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
      confirmed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      scheduled: 'bg-blue-100 text-blue-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      draft: 'Draft',
      pending_admin: 'Pending Admin',
      pending_student: 'Pending Student',
      pending_enrollment: 'Pending Enrollment',
      pending_teacher: 'Pending Teacher',
      active: 'Active',
      completed: 'Completed',
      cancelled: 'Cancelled',
      converted: '✅ Converted',
      confirmed: 'Confirmed',
      pending: 'Pending',
      scheduled: 'Scheduled',
    };
    return map[status] || status;
  }

  function getTypeDisplay(item: ClassRecord) {
    let label = '';
    let color = '';
    let icon = '';

    if (item.booking_type === 'trial') {
      const sessionType = item.session_type || 'private';
      label = sessionType === 'private' ? 'Trial PL' : 'Trial GL';
      color = item.is_converted
        ? 'bg-gray-100 text-gray-500'
        : 'bg-purple-100 text-purple-700';
      icon = '🎯';
    } else if (item.booking_type === 'class') {
      label = 'Private'; color = 'bg-emerald-100 text-emerald-700'; icon = '📚';
    } else if (item.booking_type === 'group_class') {
      label = 'Group'; color = 'bg-rose-100 text-rose-700'; icon = '👥';
    } else if (item.booking_type === 'room_booking') {
      label = 'Room'; color = 'bg-gray-100 text-gray-700'; icon = '🏠';
    }
    return { label, color, icon };
  }

  function getDisplayName(item: ClassRecord) {
    if (item.booking_type === 'room_booking') return item.title || 'Room Booking';
    return item.course?.name || 'N/A';
  }

  function getDisplaySub(item: ClassRecord) {
    if (item.booking_type === 'room_booking') return item.purpose ? `📋 ${item.purpose}` : '';
    if (item.module) return item.module.title || '';
    return '';
  }

  // ==========================================
  // TYPE FILTER (as before)
  // ==========================================
  const filteredByType = allClasses.filter(c => {
    if (filterType !== 'all' && c.booking_type !== filterType) return false;

    if (filterType === 'trial' && filterTrialStatus !== 'all') {
      const isConverted =
        c.is_converted === true ||
        c.status === 'converted' ||
        !!c.converted_class_id;
      if (filterTrialStatus === 'converted' && !isConverted) return false;
      if (filterTrialStatus === 'active' && isConverted) return false;
    }
    return true;
  });

  // ⭐ v3.14: Apply status bucket filter on top
  const filteredClasses = filterByBuckets(
    filteredByType,
    row => classifyClass({
      is_deleted: row.is_deleted,
      status: row.status,
      end_date: row.end_date_raw ?? null,
    }),
    activeBuckets
  );

  // ⭐ v3.14: bucket counts on the type-filtered set (so counts match what's visible)
  const bucketCounts = countBuckets(
    filteredByType,
    row => classifyClass({
      is_deleted: row.is_deleted,
      status: row.status,
      end_date: row.end_date_raw ?? null,
    })
  );

  // ⭐ v3.14: find "past but not marked completed" for hint
  const stuckPastClasses = filteredByType.filter(
    r => classifyClass({
      is_deleted: r.is_deleted,
      status: r.status,
      end_date: r.end_date_raw ?? null,
    }) === 'past'
  );

  const counts = {
    all: allClasses.length,
    class: allClasses.filter(c => c.booking_type === 'class').length,
    trial: allClasses.filter(c => c.booking_type === 'trial').length,
    trialActive: allClasses.filter(c =>
      c.booking_type === 'trial' &&
      c.is_converted !== true &&
      c.status !== 'converted' &&
      !c.converted_class_id
    ).length,
    trialConverted: allClasses.filter(c =>
      c.booking_type === 'trial' &&
      (c.is_converted === true || c.status === 'converted' || !!c.converted_class_id)
    ).length,
    group_class: allClasses.filter(c => c.booking_type === 'group_class').length,
    room_booking: allClasses.filter(c => c.booking_type === 'room_booking').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">📚 Class Management</h1>
          <span className="text-sm text-gray-500">
            ({counts.all} total, {counts.trial} trials, {counts.room_booking} room bookings)
          </span>

          {totalFlagged > 0 && (
            <Link href="/dashboard/substitutes/needed">
              <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded-full text-xs font-medium hover:bg-amber-200 transition cursor-pointer">
                ⚠️ {totalFlagged} session{totalFlagged !== 1 ? 's' : ''} need substitutes →
              </span>
            </Link>
          )}

          {roomNeededCount > 0 && (
            <Link href="/dashboard/classes/rooms/needed">
              <span className="px-3 py-1 bg-orange-100 border border-orange-300 text-orange-800 rounded-full text-xs font-medium hover:bg-orange-200 transition cursor-pointer">
                🏫 {roomNeededCount} session{roomNeededCount !== 1 ? 's' : ''} need rooms →
              </span>
            </Link>
          )}
        </div>

        {/* ⭐ v3.14: dismissible hint — stuck past classes */}
        {!hintDismissed && stuckPastClasses.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <span className="text-xl">💡</span>
            <div className="flex-1 text-sm text-blue-800">
              <strong>{stuckPastClasses.length}</strong> class
              {stuckPastClasses.length !== 1 ? 'es' : ''} ended but{' '}
              {stuckPastClasses.length === 1 ? 'is' : 'are'} not marked complete.
              <span className="ml-2 text-blue-600">
                Enable <strong>⏳ Past</strong> below to review.
              </span>
            </div>
            <button
              onClick={dismissHint}
              className="text-blue-400 hover:text-blue-600 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link href="/dashboard/classes/book">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-2 text-sm">
              ➕ New Booking
            </button>
          </Link>
          <Link href="/dashboard/classes/group-class/create">
            <button className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition shadow-sm flex items-center gap-2 text-sm">
              👥 Group Class
            </button>
          </Link>
          <Link href="/dashboard/classes/calendar">
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm flex items-center gap-2 text-sm">
              📅 Calendar
            </button>
          </Link>
          <Link href="/dashboard/room-booking">
            <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition shadow-sm flex items-center gap-2 text-sm">
              🏠 Room Booking
            </button>
          </Link>
{/*           <Link href="/dashboard/analytics/trials">
            <button className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition shadow-sm flex items-center gap-2 text-sm">
              📊 Trial Analytics
            </button>
          </Link> */}
          <Link href="/dashboard/substitutes/needed">
            <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition shadow-sm flex items-center gap-2 text-sm relative">
              🔄 Substitutes
              {totalFlagged > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                  {totalFlagged}
                </span>
              )}
            </button>
          </Link>
          <Link href="/dashboard/classes/rooms/needed">
            <button className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition shadow-sm flex items-center gap-2 text-sm relative">
              🏫 Rooms
              {roomNeededCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-amber-600 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md border border-amber-300">
                  {roomNeededCount > 99 ? '99+' : roomNeededCount}
                </span>
              )}
            </button>
          </Link>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1 mb-3">
          <button onClick={() => setFilterType('all')} className={`px-4 py-1.5 text-sm rounded-lg transition ${filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            All ({counts.all})
          </button>
          <button onClick={() => setFilterType('class')} className={`px-4 py-1.5 text-sm rounded-lg transition ${filterType === 'class' ? 'bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            📚 Private ({counts.class})
          </button>
          <button onClick={() => setFilterType('trial')} className={`px-4 py-1.5 text-sm rounded-lg transition ${filterType === 'trial' ? 'bg-purple-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            🎯 Trials ({counts.trial})
          </button>
          <button onClick={() => setFilterType('group_class')} className={`px-4 py-1.5 text-sm rounded-lg transition ${filterType === 'group_class' ? 'bg-rose-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            👥 Group ({counts.group_class})
          </button>
          <button onClick={() => setFilterType('room_booking')} className={`px-4 py-1.5 text-sm rounded-lg transition ${filterType === 'room_booking' ? 'bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            🏠 Room ({counts.room_booking})
          </button>
        </div>

        {/* ⭐ v3.14: Status bucket filter */}
        <div className="mb-4">
          <StatusFilterPills
            counts={bucketCounts}
            active={activeBuckets}
            onToggle={toggleBucket}
          />
        </div>

        {filterType === 'trial' && (
          <div className="flex flex-wrap gap-1 mb-4 pl-4 border-l-2 border-purple-300">
            <span className="text-xs text-gray-500 self-center mr-2">Trial status:</span>
            <button onClick={() => setFilterTrialStatus('all')} className={`px-3 py-1 text-xs rounded-lg transition ${filterTrialStatus === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              All ({counts.trial})
            </button>
            <button onClick={() => setFilterTrialStatus('active')} className={`px-3 py-1 text-xs rounded-lg transition ${filterTrialStatus === 'active' ? 'bg-amber-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              🟡 Active ({counts.trialActive})
            </button>
            <button onClick={() => setFilterTrialStatus('converted')} className={`px-3 py-1 text-xs rounded-lg transition ${filterTrialStatus === 'converted' ? 'bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              ✅ Converted ({counts.trialConverted})
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[140px]">Type / Code</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[120px]">Teacher</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[100px]">Start - End</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-[100px]">Status</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase w-[110px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClasses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No items match the current filter.
                      {activeBuckets.size === 1 && activeBuckets.has('active') && (
                        <span className="block mt-1 text-xs">
                          Try enabling <strong>📦 Archived</strong>, <strong>✅ Completed</strong>, or <strong>⏳ Past</strong> above.
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((c) => {
                    const typeInfo = getTypeDisplay(c);
                    const isTrial = c.booking_type === 'trial';
                    const isGroup = c.booking_type === 'group_class';
                    const isRoom = c.booking_type === 'room_booking';
                    const isPrivate = c.booking_type === 'class';

                    const bucket: StatusBucket = classifyClass({
                      is_deleted: c.is_deleted,
                      status: c.status,
                      end_date: c.end_date_raw ?? null,
                    });
                    const isArchived = bucket === 'archived';

                    const isConverted =
                      c.is_converted === true ||
                      c.status === 'converted' ||
                      !!c.converted_class_id;

                    const canConvert = isTrial && !isConverted && !isArchived;
                    const hasFlags = (c.flagged_count || 0) > 0;
                    const hasRoomFlags = (c.room_flagged_count || 0) > 0;
                    const hasAdditionalTeachers = (c.additional_teacher_count || 0) > 0;

                    return (
                      <tr
                        key={c.id}
                        className={`transition-colors ${
                          isArchived
                            ? 'bg-amber-50/40 hover:bg-amber-50/80 opacity-75'
                            : isConverted
                            ? 'bg-gray-50/50 hover:bg-gray-100/50 opacity-75'
                            : (hasFlags || hasRoomFlags)
                            ? 'bg-amber-50/40 hover:bg-amber-50/80'
                            : 'hover:bg-gray-50/80'
                        }`}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${typeInfo.color} w-fit`}>
                              {typeInfo.icon} {typeInfo.label}
                            </span>
                            <span className="font-mono text-[10px] text-gray-500 mt-1">
                              {c.class_code || 'N/A'}
                            </span>
                            {isTrial && c.selected_time && (
                              <span className="text-[10px] text-gray-400">{c.selected_time}</span>
                            )}
                            {isArchived && (
                              <span className="text-[10px] text-amber-700 font-medium mt-1">
                                📦 Archived
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col">
                            <span className={`font-medium text-sm ${isConverted || isArchived ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                              {getDisplayName(c)}
                            </span>
                            <span className="text-xs text-gray-500">{getDisplaySub(c)}</span>
                            {isTrial && c.student_name && (
                              <span className="text-xs text-gray-400">👤 {c.student_name}</span>
                            )}
                            {isRoom && c.description && (
                              <span className="text-xs text-gray-400 truncate max-w-[200px]">{c.description}</span>
                            )}
                            {isPrivate && c.module && (
                              <span className="text-xs text-gray-400">📖 Level: {c.level || 'N/A'}</span>
                            )}
                            {isGroup && (
                              <span className="text-xs text-gray-400">👥 {c.enrolled_count || 0}/{c.max_students || 0}</span>
                            )}

                            {hasFlags && !isConverted && !isArchived && (
                              <Link
                                href="/dashboard/substitutes/needed"
                                className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 mt-1 bg-amber-100 px-2 py-0.5 rounded w-fit"
                              >
                                ⚠️ {c.flagged_count} session{c.flagged_count !== 1 ? 's' : ''} need{c.flagged_count === 1 ? 's' : ''} substitute →
                              </Link>
                            )}

                            {hasRoomFlags && !isConverted && !isArchived && (
                              <Link
                                href="/dashboard/classes/rooms/needed"
                                className="text-xs text-orange-700 hover:text-orange-900 font-medium flex items-center gap-1 mt-1 bg-orange-100 px-2 py-0.5 rounded w-fit"
                              >
                                🏫 {c.room_flagged_count} session{(c.room_flagged_count || 0) !== 1 ? 's' : ''} need room{(c.room_flagged_count || 0) !== 1 ? 's' : ''} →
                              </Link>
                            )}

                            {isConverted && c.converted_at && (
                              <span className="text-[10px] text-emerald-600 mt-1">
                                ✅ Converted {format(parseISO(c.converted_at), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col">
                            {isGroup ? (
                              c.teacher ? (
                                <span className="text-sm text-gray-700">
                                  {c.teacher.full_name}
                                  {hasAdditionalTeachers && (
                                    <span className="ml-1 text-xs text-gray-500">
                                      +{c.additional_teacher_count} more
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400 italic">No teacher assigned</span>
                              )
                            ) : (
                              <span className="text-sm text-gray-700">
                                {c.teacher?.full_name || '—'}
                              </span>
                            )}
                            {c.room && (
                              <span className="text-xs text-gray-400">🏠 {c.room.name}</span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col text-sm text-gray-600">
                            <span>{c.start_date || 'N/A'}</span>
                            <span className="text-gray-400 text-xs">→</span>
                            <span>{c.end_date || 'N/A'}</span>
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusClass(c.status)}`}>
                            {getStatusLabel(c.status)}
                          </span>
                        </td>

                        <td className="px-3 py-3 align-top text-right">
                          <div className="flex flex-col items-end gap-1">
                            {canConvert && (
                              <Link href={`/dashboard/classes/trial-to-register?trialId=${c.id}`}>
                                <button className="text-[10px] text-green-600 hover:text-green-800 hover:underline whitespace-nowrap font-medium">
                                  🔄 Convert
                                </button>
                              </Link>
                            )}
                            {isTrial && isConverted && (
                              <span className="text-[10px] text-emerald-600 whitespace-nowrap font-medium">
                                ✅ Converted
                              </span>
                            )}
                            {isTrial && !isArchived && (
                              <Link href={`/dashboard/classes/confirmation-print?id=${c.id}`}>
                                <button className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap">
                                  🖨️ Print
                                </button>
                              </Link>
                            )}

                            {hasFlags && !isConverted && !isArchived && (
                              <Link href="/dashboard/substitutes/needed">
                                <button className="text-[10px] text-amber-600 hover:text-amber-800 hover:underline whitespace-nowrap font-medium">
                                  🔄 Assign
                                </button>
                              </Link>
                            )}

                            {hasRoomFlags && !isConverted && !isArchived && (
                              <Link href="/dashboard/classes/rooms/needed">
                                <button className="text-[10px] text-orange-600 hover:text-orange-800 hover:underline whitespace-nowrap font-medium">
                                  🏫 Assign Room
                                </button>
                              </Link>
                            )}

                            {isGroup && (
                              <Link href={`/dashboard/classes/group-class/view?id=${c.id}`}>
                                <button className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap">
                                  👥 View
                                </button>
                              </Link>
                            )}
                            {isPrivate && (
                              <Link href={`/dashboard/classes/details?id=${c.id}`}>
                                <button className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap">
                                  📖 View
                                </button>
                              </Link>
                            )}

                            {/* ⭐ v3.14: Archive button */}
                            {!isConverted && !isArchived && (isGroup || isPrivate) && (
                              <button
                                onClick={() =>
                                  setArchiveTarget({
                                    type: isGroup ? 'group_class' : 'class',
                                    id: c.id,
                                    name: getDisplayName(c),
                                    code: c.class_code,
                                  })
                                }
                                className="text-[10px] text-amber-600 hover:text-amber-800 hover:underline whitespace-nowrap font-medium"
                              >
                                📦 Archive
                              </button>
                            )}
                            {isArchived && (
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                📦 Archived
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ⭐ v3.14: Archive confirmation modal */}
      <ArchiveConfirmModal
        isOpen={!!archiveTarget}
        entityType={archiveTarget?.type === 'group_class' ? 'group_class' : 'class'}
        entityName={archiveTarget?.name || ''}
        entityCode={archiveTarget?.code}
        extraNotes={
          archiveTarget?.type === 'group_class'
            ? [
                'Future sessions of this group class will be archived',
                'All active enrollments will be archived',
                'Teacher and room will be freed',
                'You can reactivate later from the archived view',
              ]
            : [
                'Future sessions will be cancelled',
                'Teacher and room will be freed',
                'Student enrollment history is preserved',
              ]
        }
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}