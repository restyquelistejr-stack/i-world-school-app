// app/dashboard/staff/teachers/calendar/page.tsx
// ⭐ v3.19 — Week/day navigation + working View Teacher filter (URL-driven)
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
} from 'date-fns';
import Link from 'next/link';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

interface BookingWithDetails {
  id: string;
  teacher_id: string;
  course_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  status: string;
  class_code: string;
  student_count: number;
  teacher_name: string;
  students: { id: string; full_name: string }[];
}

interface DailySchedule {
  date: string;
  bookings: BookingWithDetails[];
}

function AdminCalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven state
  const viewMode = (searchParams.get('view') as 'today' | 'week') || 'today';
  const selectedTeacher = searchParams.get('teacher') || 'all';
  const anchorDateStr = searchParams.get('date');   // YYYY-MM-DD

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<DailySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);

  const anchorDate = anchorDateStr ? parseISO(anchorDateStr) : new Date();

  // Push a new URL state
  const setUrlState = useCallback((next: {
    view?: 'today' | 'week';
    teacher?: string;
    date?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view !== undefined) params.set('view', next.view);
    if (next.teacher !== undefined) {
      if (next.teacher === 'all') params.delete('teacher');
      else params.set('teacher', next.teacher);
    }
    if (next.date !== undefined) params.set('date', next.date);
    router.push(`/dashboard/staff/teachers/calendar?${params.toString()}`);
  }, [router, searchParams]);

  const navigate = (direction: 'prev' | 'next') => {
    if (viewMode === 'week') {
      const next = direction === 'next' ? addWeeks(anchorDate, 1) : subWeeks(anchorDate, 1);
      setUrlState({ date: format(next, 'yyyy-MM-dd') });
    } else {
      const next = addDays(anchorDate, direction === 'next' ? 1 : -1);
      setUrlState({ date: format(next, 'yyyy-MM-dd') });
    }
  };

  const goToToday = () => {
    setUrlState({ date: format(new Date(), 'yyyy-MM-dd') });
  };

  useEffect(() => {
    loadTeachersAndSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacher, viewMode, anchorDateStr]);

  async function loadTeachersAndSchedules() {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Load all teachers (once)
      if (teachers.length === 0) {
        const { data: teachersData, error: teachersError } = await supabase
          .from('users')
          .select('id, full_name, email, phone')
          .eq('role', 'teacher')
          .order('full_name');

        if (teachersError) throw teachersError;
        setTeachers(teachersData || []);
      }

      // 2. Calculate date range from anchor
      let startDate: Date, endDate: Date;
      if (viewMode === 'today') {
        startDate = new Date(anchorDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(anchorDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        const ws = startOfWeek(anchorDate, { weekStartsOn: 1 });
        startDate = new Date(ws);
        startDate.setHours(0, 0, 0, 0);
        endDate = addDays(ws, 6);
        endDate.setHours(23, 59, 59, 999);
      }

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      // 3. Get bookings in range (note: bookings.start_time is TEXT)
      let query = supabase
        .from('bookings')
        .select('*')
        .gte('start_time', `${startDateStr}T00:00:00`)
        .lte('start_time', `${endDateStr}T23:59:59`)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .order('start_time', { ascending: true });

      if (selectedTeacher !== 'all') {
        query = query.eq('teacher_id', selectedTeacher);
      }

      const { data: bookingsData, error: bookingsError } = await query;
      if (bookingsError) throw bookingsError;

      // 4. Enrich with course/room/teacher/students in bulk
      const bookings = bookingsData || [];
      const courseIds = [...new Set(bookings.map(b => b.course_id).filter(Boolean))];
      const roomIds = [...new Set(bookings.map(b => b.room_id).filter(Boolean))];
      const teacherIds = [...new Set(bookings.map(b => b.teacher_id).filter(Boolean))];
      const classIds = [...new Set(bookings.map(b => b.class_id).filter(Boolean))];

      const [coursesRes, roomsRes, teachersRes, classesRes] = await Promise.all([
        courseIds.length
          ? supabase.from('courses').select('id, name').in('id', courseIds)
          : Promise.resolve({ data: [] as any[] }),
        roomIds.length
          ? supabase.from('rooms').select('id, name').in('id', roomIds)
          : Promise.resolve({ data: [] as any[] }),
        teacherIds.length
          ? supabase.from('users').select('id, full_name').in('id', teacherIds)
          : Promise.resolve({ data: [] as any[] }),
        classIds.length
          ? supabase.from('classes').select('id, class_code').in('id', classIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const courseMap = Object.fromEntries((coursesRes.data || []).map((c: any) => [c.id, c.name]));
      const roomMap = Object.fromEntries((roomsRes.data || []).map((r: any) => [r.id, r.name]));
      const teacherMap = Object.fromEntries((teachersRes.data || []).map((t: any) => [t.id, t.full_name]));
      const classCodeMap = Object.fromEntries((classesRes.data || []).map((c: any) => [c.id, c.class_code]));

      // Enrollments per class
      let enrollmentsByClass: Record<string, { id: string; full_name: string }[]> = {};
      if (classIds.length) {
        const { data: enrollments } = await supabase
          .from('class_enrollments')
          .select(`class_id, student_id, student:student_id ( id, full_name )`)
          .in('class_id', classIds)
          .eq('status', 'active');

        (enrollments || []).forEach((e: any) => {
          if (!enrollmentsByClass[e.class_id]) enrollmentsByClass[e.class_id] = [];
          enrollmentsByClass[e.class_id].push({
            id: e.student?.id || e.student_id,
            full_name: e.student?.full_name || 'Unknown Student',
          });
        });
      }

      const enrichedBookings: BookingWithDetails[] = bookings.map((b: any) => {
        const students = b.class_id ? (enrollmentsByClass[b.class_id] || []) : [];
        return {
          ...b,
          course_name: courseMap[b.course_id] || 'Unknown Course',
          room_name: roomMap[b.room_id] || 'TBD',
          teacher_name: teacherMap[b.teacher_id] || 'TBD',
          class_code: classCodeMap[b.class_id] || 'N/A',
          student_count: students.length,
          students,
        };
      });

      // 5. Group by date
      const grouped: Record<string, BookingWithDetails[]> = {};
      enrichedBookings.forEach(b => {
        const dateKey = b.start_time.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(b);
      });

      const scheduleArray: DailySchedule[] = Object.keys(grouped)
        .sort()
        .map(date => ({
          date,
          bookings: grouped[date].sort((a, b) => a.start_time.localeCompare(b.start_time)),
        }));

      setSchedules(scheduleArray);
    } catch (error: any) {
      console.error('Error loading data:', error);
      setErrorMessage(error?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      confirmed: '✅ Confirmed',
      in_progress: '🔄 In Progress',
      completed: '✅ Completed',
      cancelled: '❌ Cancelled',
      pending: '⏳ Pending',
    };
    return map[status] || status;
  };

  const formatDateHeader = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const periodLabel = (() => {
    if (viewMode === 'week') {
      const ws = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const we = addDays(ws, 6);
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    return format(anchorDate, 'EEEE, MMM d, yyyy');
  })();

  if (loading && schedules.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 font-medium">⚠️ {errorMessage}</p>
          <button
            onClick={() => loadTeachersAndSchedules()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Admin Schedule Dashboard</h1>
          <p className="text-sm text-gray-500">View all teachers and their classes</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setUrlState({ view: 'today' })}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'today' ? 'bg-white shadow text-gray-900' : 'hover:bg-gray-200'
              }`}
            >
              📅 Day
            </button>
            <button
              onClick={() => setUrlState({ view: 'week' })}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'week' ? 'bg-white shadow text-gray-900' : 'hover:bg-gray-200'
              }`}
            >
              📆 Week
            </button>
          </div>

          {/* Teacher filter */}
          <select
            value={selectedTeacher}
            onChange={(e) => setUrlState({ teacher: e.target.value })}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            <option value="all">👥 All Teachers</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>

          <button
            onClick={() => loadTeachersAndSchedules()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Period navigator */}
      <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={goToToday}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              isToday(anchorDate)
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Today
          </button>
          <div className="w-px h-5 bg-gray-300 mx-1" />
          <button
            onClick={() => navigate('prev')}
            className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700"
            title={viewMode === 'week' ? 'Previous week' : 'Previous day'}
          >
            ←
          </button>
          <span className="text-sm font-semibold text-gray-800 px-3 min-w-[200px] text-center">
            {periodLabel}
          </span>
          <button
            onClick={() => navigate('next')}
            className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700"
            title={viewMode === 'week' ? 'Next week' : 'Next day'}
          >
            →
          </button>
        </div>

        {selectedTeacher !== 'all' && (
          <span className="text-xs text-gray-500 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">
            Filtered: {teachers.find(t => t.id === selectedTeacher)?.full_name}
            <button
              onClick={() => setUrlState({ teacher: 'all' })}
              className="ml-2 text-blue-600 hover:text-blue-800 font-bold"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/* Stats Summary */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500">Total Classes</div>
            <div className="text-2xl font-bold">
              {schedules.reduce((sum, day) => sum + day.bookings.length, 0)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-sm text-gray-500">Teachers Teaching</div>
            <div className="text-2xl font-bold">
              {new Set(schedules.flatMap(day => day.bookings.map(b => b.teacher_id))).size}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="text-sm text-gray-500">Total Students</div>
            <div className="text-2xl font-bold">
              {schedules.reduce((sum, day) => sum + day.bookings.reduce((s, b) => s + b.student_count, 0), 0)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <div className="text-sm text-gray-500">Days with Classes</div>
            <div className="text-2xl font-bold">{schedules.length}</div>
          </div>
        </div>
      )}

      {/* Schedule Display */}
      {schedules.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500 text-lg">No classes scheduled for this period.</p>
          <p className="text-sm text-gray-400 mt-2">
            {selectedTeacher !== 'all'
              ? 'This teacher has no classes in the selected period.'
              : 'No classes are scheduled in the selected period.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {schedules.map(day => (
            <div key={day.date} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">{formatDateHeader(day.date)}</h3>
                <span className="text-sm text-gray-500">
                  {day.bookings.length} class{day.bookings.length !== 1 ? 'es' : ''}
                </span>
              </div>

              <div className="divide-y divide-gray-100">
                {day.bookings.map(booking => (
                  <div
                    key={booking.id}
                    className="p-4 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900">{booking.course_name}</span>
                          <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
                            {booking.class_code}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                            {getStatusBadge(booking.status)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                          <span>🧑‍🏫 {booking.teacher_name}</span>
                          <span>📍 {booking.room_name}</span>
                          <span>⏰ {format(parseISO(booking.start_time), 'h:mm a')} - {format(parseISO(booking.end_time), 'h:mm a')}</span>
                          <span className="text-blue-600">👥 {booking.student_count} students</span>
                        </div>

                        {booking.students.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {booking.students.slice(0, 5).map(student => (
                              <span key={student.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {student.full_name}
                              </span>
                            ))}
                            {booking.students.length > 5 && (
                              <span className="text-xs text-gray-500">+{booking.students.length - 5} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlState({ teacher: booking.teacher_id });
                          }}
                          className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                        >
                          View Teacher
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Detail Modal — unchanged from before */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Class Details</h3>
                <p className="text-sm text-gray-500">{selectedBooking.class_code}</p>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Course</div>
                  <div className="font-medium">{selectedBooking.course_name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Teacher</div>
                  <div className="font-medium">{selectedBooking.teacher_name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Room</div>
                  <div className="font-medium">{selectedBooking.room_name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedBooking.status)}`}>
                    {getStatusBadge(selectedBooking.status)}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm text-gray-500">Schedule</div>
                <div className="font-medium">
                  {format(parseISO(selectedBooking.start_time), 'EEEE, MMMM d, yyyy')}
                </div>
                <div className="text-gray-600">
                  {format(parseISO(selectedBooking.start_time), 'h:mm a')} - {format(parseISO(selectedBooking.end_time), 'h:mm a')}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500">Enrolled Students</div>
                  <span className="text-sm font-medium">{selectedBooking.student_count} students</span>
                </div>
                {selectedBooking.students.length > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedBooking.students.map(student => (
                      <div key={student.id} className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100">
                        <span>{student.full_name}</span>
                        <Link
                          href={`/dashboard/students/enrollments?id=${student.id}`}
                          className="text-xs text-blue-600 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No students enrolled yet.</p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 flex justify-end gap-2">
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ⭐ Suspense wrapper — required for useSearchParams in Next 15/16 App Router
import { Suspense } from 'react';

export default function AdminCalendarPage() {
  return (
    <Suspense fallback={
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <AdminCalendarContent />
    </Suspense>
  );
}