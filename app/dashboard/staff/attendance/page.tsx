'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';

// Types
interface Booking {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  course_id: string;
  room_id: string;
  teacher_id: string;
  course_name?: string;
  room_name?: string;
  teacher_name?: string;
}

interface EnrolledStudent {
  user_id: string;
  full_name: string;
}

interface AttendanceRecord {
  id?: string;
  booking_id: string;
  user_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
}

export default function AttendanceDashboardPage() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const highlightBookingId = searchParams.get('booking_id');

  const [selectedDate, setSelectedDate] = useState<Date>(
    dateParam ? parseISO(dateParam) : new Date()
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(highlightBookingId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store attendance changes locally before saving to DB
  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceRecord>>({});

  useEffect(() => {
    loadDailySchedule();
  }, [selectedDate]);

  async function loadDailySchedule() {
    setLoading(true);
    setErrorMessage(null);
    setLocalAttendance({});

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // 1. Fetch Bookings for this day (Get raw data first)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*') // Simple select to avoid relationship cache errors
        .eq('date', dateStr)
        .in('status', ['confirmed', 'in_progress']);

      if (bookingsError) throw new Error(bookingsError.message);
      if (!bookingsData || bookingsData.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // 2. Enrich the bookings with Course, Room, and Teacher names manually
      const formattedBookings = await Promise.all(
        bookingsData.map(async (b: any) => {
          let courseName = 'Unknown Course';
          let roomName = 'TBD';
          let teacherName = 'Unknown Teacher';

          // Fetch Course Name
          if (b.course_id) {
            const { data: cData } = await supabase
              .from('courses')
              .select('name')
              .eq('id', b.course_id)
              .single();
            if (cData) courseName = cData.name;
          }

          // Fetch Room Name
          if (b.room_id) {
            const { data: rData } = await supabase
              .from('rooms')
              .select('name')
              .eq('id', b.room_id)
              .single();
            if (rData) roomName = rData.name;
          }

          // Fetch Teacher Name (This matches your 'users' table logic)
          if (b.teacher_id) {
            const { data: tData } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', b.teacher_id)
              .single();
            if (tData) teacherName = tData.full_name;
          }

          return {
            ...b,
            course_name: courseName,
            room_name: roomName,
            teacher_name: teacherName,
          };
        })
      );

      setBookings(formattedBookings);

      // 3. Fetch Existing Attendance for these bookings
      const bookingIds = formattedBookings.map(b => b.id);
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .in('booking_id', bookingIds);

      if (attendanceError) throw new Error(attendanceError.message);

      // Convert fetched attendance into local state map
      const attendanceMap: Record<string, AttendanceRecord> = {};
      if (attendanceData) {
        attendanceData.forEach((a: any) => {
          attendanceMap[`${a.booking_id}-${a.user_id}`] = {
            id: a.id,
            booking_id: a.booking_id,
            user_id: a.user_id,
            status: a.status,
          };
        });
      }
      setLocalAttendance(attendanceMap);

    } catch (error: any) {
      console.error('Error loading schedule:', error);
      setErrorMessage(error.message || 'Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }

  // Fetch enrolled students for a specific class
  async function fetchEnrolledStudents(classId: string): Promise<EnrolledStudent[]> {
    try {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select(`
          student_id,
          students:student_id ( full_name )
        `)
        .eq('class_id', classId)
        .eq('status', 'active');

      if (error) throw error;

      return data.map((item: any) => ({
        user_id: item.student_id,
        full_name: item.students?.full_name || 'Unknown Student',
      }));
    } catch (error) {
      console.error('Error fetching students:', error);
      return [];
    }
  }

  // Handle changing a student's status in the UI
  const handleStatusChange = (bookingId: string, userId: string, newStatus: 'present' | 'absent' | 'late') => {
    setLocalAttendance(prev => ({
      ...prev,
      [`${bookingId}-${userId}`]: {
        booking_id: bookingId,
        user_id: userId,
        status: newStatus,
      }
    }));
  };

  // Save attendance to Supabase
  const saveAttendance = async (bookingId: string) => {
    setSaving(true);
    try {
      const recordsToSave = Object.values(localAttendance).filter(
        record => record.booking_id === bookingId
      );

      const { error } = await supabase
        .from('attendance')
        .upsert(recordsToSave, { onConflict: 'booking_id, user_id' });

      if (error) throw error;

      alert('Attendance saved successfully!');
      loadDailySchedule();
    } catch (error: any) {
      alert('Error saving attendance: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (bookingId: string) => {
    setExpandedBookingId(prev => prev === bookingId ? null : bookingId);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Daily Attendance</h1>
          <p className="text-sm text-gray-500">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setSelectedDate(new Date())} 
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-200 hover:bg-gray-300"
          >
            Today
          </button>
          <button 
            onClick={() => {
              const prev = new Date(selectedDate);
              prev.setDate(prev.getDate() - 1);
              setSelectedDate(prev);
            }} 
            className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            ← Prev Day
          </button>
          <button 
            onClick={() => {
              const next = new Date(selectedDate);
              next.setDate(next.getDate() + 1);
              setSelectedDate(next);
            }} 
            className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Next Day →
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {errorMessage}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500 text-lg">No classes scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div 
              key={booking.id} 
              className={`bg-white rounded-lg shadow border overflow-hidden transition-all ${
                expandedBookingId === booking.id ? 'border-blue-300 ring-1 ring-blue-300' : 'border-gray-200'
              }`}
            >
              {/* Class Header (Click to Toggle) */}
              <button 
                onClick={() => toggleExpand(booking.id)}
                className="w-full px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="font-bold text-gray-800">{booking.course_name}</span>
                  <span className="text-sm text-gray-500">• {booking.teacher_name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>⏰ {format(parseISO(booking.start_time), 'h:mm a')} - {format(parseISO(booking.end_time), 'h:mm a')}</span>
                  <span className="text-gray-400">•</span>
                  <span>📍 {booking.room_name}</span>
                  <span className={`ml-2 text-xs ${expandedBookingId === booking.id ? 'text-blue-600' : 'text-gray-400'}`}>
                    {expandedBookingId === booking.id ? '▲' : '▼'}
                  </span>
                </div>
              </button>

              {/* Expanded Student List */}
              {expandedBookingId === booking.id && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                  <StudentList 
                    bookingId={booking.id} 
                    classId={booking.class_id}
                    localAttendance={localAttendance}
                    onStatusChange={handleStatusChange}
                  />
                  <div className="mt-4 flex justify-end">
                    <button 
                      onClick={() => saveAttendance(booking.id)}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {saving ? 'Saving...' : '💾 Save Attendance'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-component to handle loading students and rendering checkboxes
function StudentList({ 
  bookingId, 
  classId, 
  localAttendance, 
  onStatusChange 
}: { 
  bookingId: string; 
  classId: string; 
  localAttendance: Record<string, AttendanceRecord>; 
  onStatusChange: (bookingId: string, userId: string, status: 'present' | 'absent' | 'late') => void;
}) {
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStudents() {
      if (!classId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const fetchedStudents = await fetchEnrolledStudents(classId);
      setStudents(fetchedStudents);
      setLoading(false);
    }
    loadStudents();
  }, [classId]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-2">Loading enrolled students...</div>;
  }

  if (students.length === 0) {
    return (
      <div className="text-sm text-yellow-600 py-2">
        ⚠️ No active students enrolled in this class.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {students.map((student) => {
        // Get current status from local state. Default to 'absent' if not marked yet.
        const currentStatus = localAttendance[`${bookingId}-${student.user_id}`]?.status || 'absent';
        
        return (
          <div 
            key={student.user_id} 
            className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
          >
            <span className="text-sm font-medium text-gray-700">{student.full_name}</span>
            <div className="flex gap-1">
              {['present', 'late', 'absent'].map((status) => (
                <button
                  key={status}
                  onClick={() => onStatusChange(bookingId, student.user_id, status as any)}
                  className={`px-2 py-1 text-xs rounded border font-medium transition-colors ${
                    currentStatus === status 
                      ? status === 'present' ? 'bg-green-100 border-green-500 text-green-700'
                      : status === 'late' ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                      : 'bg-red-100 border-red-500 text-red-700'
                      : 'bg-transparent border-gray-300 text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper function for the child component to fetch students
async function fetchEnrolledStudents(classId: string): Promise<EnrolledStudent[]> {
  try {
    const { data, error } = await supabase
      .from('class_enrollments')
      .select(`
        student_id,
        students:student_id ( full_name )
      `)
      .eq('class_id', classId)
      .eq('status', 'active');

    if (error) throw error;

    return data.map((item: any) => ({
      user_id: item.student_id,
      full_name: item.students?.full_name || 'Unknown Student',
    }));
  } catch (error) {
    console.error('Error fetching students:', error);
    return [];
  }
}