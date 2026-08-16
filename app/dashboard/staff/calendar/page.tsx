'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO, isToday, isTomorrow, isThisWeek } from 'date-fns';
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

export default function AdminCalendarPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [schedules, setSchedules] = useState<DailySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);

  useEffect(() => {
    loadTeachersAndSchedules();
  }, [selectedTeacher, viewMode]);

  async function loadTeachersAndSchedules() {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Load all teachers
      const { data: teachersData, error: teachersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'teacher')
        .order('full_name');

      if (teachersError) throw teachersError;
      setTeachers(teachersData || []);

      // 2. Calculate date range
      let startDate: Date, endDate: Date;
      if (viewMode === 'today') {
        const today = new Date();
        startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Week view - current week
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today);
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      }

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      console.log('Date range:', { startDateStr, endDateStr });

      // 3. Get all bookings in date range
      let query = supabase
        .from('bookings')
        .select('*')
        .gte('start_time', startDateStr)
        .lte('start_time', endDateStr)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .order('start_time', { ascending: true });

      if (selectedTeacher !== 'all') {
        query = query.eq('teacher_id', selectedTeacher);
      }

      const { data: bookingsData, error: bookingsError } = await query;

      if (bookingsError) throw bookingsError;

      console.log('Found bookings:', bookingsData?.length || 0);

      // 4. Enrich bookings with related data
      const enrichedBookings = await Promise.all(
        (bookingsData || []).map(async (booking) => {
          // Get course name
          let courseName = 'Unknown Course';
          if (booking.course_id) {
            const { data: courseData } = await supabase
              .from('courses')
              .select('name')
              .eq('id', booking.course_id)
              .single();
            if (courseData) courseName = courseData.name;
          }

          // Get room name
          let roomName = 'TBD';
          if (booking.room_id) {
            const { data: roomData } = await supabase
              .from('rooms')
              .select('name')
              .eq('id', booking.room_id)
              .single();
            if (roomData) roomName = roomData.name;
          }

          // Get teacher name
          let teacherName = 'TBD';
          if (booking.teacher_id) {
            const { data: teacherData } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', booking.teacher_id)
              .single();
            if (teacherData) teacherName = teacherData.full_name;
          }

          // Get class code
          let classCode = 'N/A';
          if (booking.class_id) {
            const { data: classData } = await supabase
              .from('classes')
              .select('class_code')
              .eq('id', booking.class_id)
              .single();
            if (classData) classCode = classData.class_code;
          }

          // Get students enrolled in this class
          let students: { id: string; full_name: string }[] = [];
          let studentCount = 0;
          if (booking.class_id) {
            const { data: enrollments } = await supabase
              .from('class_enrollments')
              .select(`
                student_id,
                student:student_id ( id, full_name )
              `)
              .eq('class_id', booking.class_id);

            if (enrollments) {
              students = enrollments.map((e: any) => ({
                id: e.student_id,
                full_name: e.student?.full_name || 'Unknown Student'
              }));
              studentCount = students.length;
            }
          }

          return {
            ...booking,
            course_name: courseName,
            room_name: roomName,
            teacher_name: teacherName,
            class_code: classCode,
            student_count: studentCount,
            students: students
          };
        })
      );

      // 5. Group by date
      const groupedByDate: { [key: string]: BookingWithDetails[] } = {};
      enrichedBookings.forEach((booking) => {
        const dateKey = booking.start_time.split('T')[0] || booking.start_time;
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push(booking);
      });

      const scheduleArray: DailySchedule[] = Object.keys(groupedByDate)
        .sort()
        .map((date) => ({
          date,
          bookings: groupedByDate[date].sort((a, b) => 
            a.start_time.localeCompare(b.start_time)
          )
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
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  if (loading) {
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Admin Schedule Dashboard</h1>
          <p className="text-sm text-gray-500">
            View all teachers and their classes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('today')}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'today' 
                  ? 'bg-white shadow text-gray-900' 
                  : 'hover:bg-gray-200'
              }`}
            >
              📅 Today
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'week' 
                  ? 'bg-white shadow text-gray-900' 
                  : 'hover:bg-gray-200'
              }`}
            >
              📆 Week
            </button>
          </div>

          {/* Teacher Filter */}
          <select
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            <option value="all">👥 All Teachers</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name}
              </option>
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
          {schedules.map((day) => (
            <div key={day.date} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              {/* Day Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">
                  {formatDateHeader(day.date)}
                </h3>
                <span className="text-sm text-gray-500">
                  {day.bookings.length} class{day.bookings.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Bookings for this day */}
              <div className="divide-y divide-gray-100">
                {day.bookings.map((booking) => (
                  <div 
                    key={booking.id}
                    className="p-4 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900">
                            {booking.course_name}
                          </span>
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

                        {/* Student list (expandable) */}
                        {booking.students.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {booking.students.slice(0, 5).map((student) => (
                              <span 
                                key={student.id}
                                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded"
                              >
                                {student.full_name}
                              </span>
                            ))}
                            {booking.students.length > 5 && (
                              <span className="text-xs text-gray-500">
                                +{booking.students.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/staff/teachers/calendar?id=${booking.teacher_id}`}
                          className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Teacher
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Detail Modal */}
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
              {/* Class Info */}
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

              {/* Time */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm text-gray-500">Schedule</div>
                <div className="font-medium">
                  {format(parseISO(selectedBooking.start_time), 'EEEE, MMMM d, yyyy')}
                </div>
                <div className="text-gray-600">
                  {format(parseISO(selectedBooking.start_time), 'h:mm a')} - {format(parseISO(selectedBooking.end_time), 'h:mm a')}
                </div>
              </div>

              {/* Students */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500">Enrolled Students</div>
                  <span className="text-sm font-medium">{selectedBooking.student_count} students</span>
                </div>
                {selectedBooking.students.length > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedBooking.students.map((student) => (
                      <div 
                        key={student.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100"
                      >
                        <span>{student.full_name}</span>
                        <Link
                          href={`/dashboard/students/enrollments?id=${student.id}`}
                          className="text-xs text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
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

              {/* Actions */}
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