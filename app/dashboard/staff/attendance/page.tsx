'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

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
  status: 'present' | 'absent' | 'late';
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

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', dateStr)
        .in('status', ['confirmed', 'in_progress']);

      if (bookingsError) throw new Error(bookingsError.message);
      if (!bookingsData || bookingsData.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const formattedBookings = await Promise.all(
        bookingsData.map(async (b: any) => {
          let courseName = 'Unknown Course';
          let roomName = 'TBD';
          let teacherName = 'Unknown Teacher';

          if (b.course_id) {
            const { data: cData } = await supabase.from('courses').select('name').eq('id', b.course_id).single();
            if (cData) courseName = cData.name;
          }
          if (b.room_id) {
            const { data: rData } = await supabase.from('rooms').select('name').eq('id', b.room_id).single();
            if (rData) roomName = rData.name;
          }
          if (b.teacher_id) {
            const { data: tData } = await supabase.from('users').select('full_name').eq('id', b.teacher_id).single();
            if (tData) teacherName = tData.full_name;
          }
          return { ...b, course_name: courseName, room_name: roomName, teacher_name: teacherName };
        })
      );

      setBookings(formattedBookings);

      const bookingIds = formattedBookings.map(b => b.id);
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .in('booking_id', bookingIds);

      if (attendanceError) throw new Error(attendanceError.message);

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

  async function fetchEnrolledStudents(classId: string): Promise<EnrolledStudent[]> {
    try {
      const { data, error } = await supabase
        .from('class_enrollments')
        .select(`student_id, students:student_id ( full_name )`)
        .eq('class_id', classId)
        .eq('status', 'active');
      if (error) throw error;
      return data.map((item: any) => ({
        user_id: item.student_id,
        full_name: item.students?.full_name || 'Unknown Student',
      }));
    } catch (error) {
      return [];
    }
  }

  const handleStatusChange = (bookingId: string, userId: string, newStatus: 'present' | 'absent' | 'late' | null) => {
    setLocalAttendance(prev => {
      const newState = { ...prev };
      if (newStatus === null) {
        delete newState[`${bookingId}-${userId}`];
      } else {
        newState[`${bookingId}-${userId}`] = {
          booking_id: bookingId,
          user_id: userId,
          status: newStatus,
        };
      }
      return newState;
    });
  };

  const markAllPresent = (bookingId: string, studentIds: string[]) => {
    setLocalAttendance(prev => {
      const newState = { ...prev };
      studentIds.forEach((userId) => {
        newState[`${bookingId}-${userId}`] = {
          booking_id: bookingId,
          user_id: userId,
          status: 'present',
        };
      });
      return newState;
    });
  };

  const cancelClass = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this class?')) return;
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);
      if (error) throw error;
      loadDailySchedule();
    } catch (error: any) {
      alert('Error cancelling class: ' + error.message);
    }
  };

  const saveAllAttendance = async () => {
    setSaving(true);
    try {
      const recordsToSave = Object.values(localAttendance);
      if (recordsToSave.length === 0) {
        alert('No attendance changes to save.');
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from('attendance')
        .upsert(recordsToSave, { onConflict: 'booking_id, user_id' });
      if (error) throw error;
      alert('✅ All attendance saved successfully!');
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

  const pendingChangesCount = useMemo(() => {
    return Object.keys(localAttendance).length;
  }, [localAttendance]);

  if (loading) {
    return <div className="p-6 flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto relative pb-10">
      
      {/* Sticky Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>📋</span> Daily Attendance
          </h1>
          <p className="text-sm text-gray-500">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          
          {pendingChangesCount > 0 && (
            <button 
              onClick={saveAllAttendance}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-bold shadow-md flex items-center gap-2"
            >
              <span>💾</span> Save All ({pendingChangesCount})
            </button>
          )}

          <div className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
            <Link href="/dashboard/staff/teachers/calendar">
              <button className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">← Back</button>
            </Link>
            <div className="w-px h-5 bg-gray-300 mx-1"></div>
            <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700">Today</button>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))} className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700">←</button>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))} className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700">→</button>
          </div>
        </div>
      </div>

      {errorMessage && <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">{errorMessage}</div>}

      {bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500 text-lg">No classes scheduled for this day.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((booking) => {
            const isExpanded = expandedBookingId === booking.id || expandedBookingId === 'all';
            
            return (
              <div key={booking.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md relative group">
                
                {/* Class Header */}
                <button 
                  onClick={() => toggleExpand(booking.id)} 
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left border-b border-gray-100"
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-bold text-gray-800 truncate text-base">{booking.course_name}</span>
                    <span className="text-sm text-gray-500 truncate">👨‍🏫 {booking.teacher_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                    <span>⏰ {format(parseISO(booking.start_time), 'h:mm a')}</span>
                    <span className="text-gray-300">•</span>
                    <span>📍 {booking.room_name}</span>
                    <span className="text-gray-400 text-lg ml-2 transition-transform duration-200">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {/* Expanded Student List */}
                {isExpanded && (
                  <div className="p-4 bg-gray-50/80">
                    <StudentList 
                      bookingId={booking.id} 
                      classId={booking.class_id}
                      localAttendance={localAttendance}
                      onStatusChange={handleStatusChange}
                      onMarkAllPresent={markAllPresent}
                      cancelClass={cancelClass}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------
// SUB-COMPONENTS
// ----------------------

// Elegant color mapping for soft backgrounds
function getStatusColors(status: string | null) {
  if (status === 'present') return { 
    bg: 'bg-emerald-100/80', 
    text: 'text-emerald-800', 
    border: 'border-emerald-300',
    hover: 'hover:bg-emerald-200'
  };
  if (status === 'late') return { 
    bg: 'bg-amber-100/80', 
    text: 'text-amber-800', 
    border: 'border-amber-300',
    hover: 'hover:bg-amber-200'
  };
  if (status === 'absent') return { 
    bg: 'bg-rose-100/80', 
    text: 'text-rose-800', 
    border: 'border-rose-300',
    hover: 'hover:bg-rose-200'
  };
  return { 
    bg: 'bg-gray-100', 
    text: 'text-gray-400', 
    border: 'border-transparent',
    hover: 'hover:bg-gray-200'
  };
}

function StudentList({ 
  bookingId, 
  classId, 
  localAttendance, 
  onStatusChange,
  onMarkAllPresent,
  cancelClass
}: { 
  bookingId: string; 
  classId: string; 
  localAttendance: Record<string, AttendanceRecord>; 
  onStatusChange: (bookingId: string, userId: string, status: 'present' | 'absent' | 'late' | null) => void;
  onMarkAllPresent: (bookingId: string, studentIds: string[]) => void;
  cancelClass: (bookingId: string) => void;
}) {
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStudents() {
      if (!classId) { setLoading(false); return; }
      setLoading(true);
      const fetchedStudents = await fetchEnrolledStudents(classId);
      setStudents(fetchedStudents);
      setLoading(false);
    }
    loadStudents();
  }, [classId]);

  const handleMarkAllClick = () => {
    const studentIds = students.map(s => s.user_id);
    onMarkAllPresent(bookingId, studentIds);
  };

  if (loading) return <div className="text-sm text-gray-400 py-6 text-center">Loading students...</div>;
  if (students.length === 0) return <div className="text-sm text-yellow-600 py-6 text-center">⚠️ No active students enrolled.</div>;

  return (
    <div className="flex flex-col gap-2">
      
      {/* Action Bar (Cancel + Mark All Present) - Cleanly on one row */}
      <div className="flex justify-end gap-3 mb-4 pb-3 border-b border-gray-200">
        <button 
          onClick={() => cancelClass(bookingId)}
          className="px-4 py-1.5 text-xs font-medium text-red-600 bg-red-50/50 hover:bg-red-100 rounded-full border border-red-200 transition"
        >
          ✕ Cancel Class
        </button>
        <button 
          onClick={handleMarkAllClick}
          className="px-4 py-1.5 text-xs font-medium text-green-700 bg-green-50/50 hover:bg-green-100 rounded-full border border-green-200 transition shadow-sm"
        >
          ✓ Mark All Present
        </button>
      </div>

      {students.map((student) => {
        const currentStatus = localAttendance[`${bookingId}-${student.user_id}`]?.status || null;
        const colors = getStatusColors(currentStatus);
        
        return (
          <div key={student.user_id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
            
            {/* Student Name */}
            <span className="text-sm font-medium text-gray-800 pl-1 min-w-[120px]">{student.full_name}</span>
            
            {/* Minimalist Radio Toggle with Elegant Pastel Colors */}
            <div className="flex bg-gray-100/80 rounded-lg p-1 shadow-inner border border-gray-200/50">
              
              {/* Present */}
              <button
                onClick={() => onStatusChange(bookingId, student.user_id, currentStatus === 'present' ? null : 'present')}
                className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                  currentStatus === 'present' 
                    ? `${colors.bg} ${colors.text} ${colors.border} border shadow-sm` 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <span className="mr-1">✓</span> Present
              </button>

              {/* Late */}
              <button
                onClick={() => onStatusChange(bookingId, student.user_id, currentStatus === 'late' ? null : 'late')}
                className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                  currentStatus === 'late' 
                    ? `${colors.bg} ${colors.text} ${colors.border} border shadow-sm` 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <span className="mr-1">⏰</span> Late
              </button>

              {/* Absent */}
              <button
                onClick={() => onStatusChange(bookingId, student.user_id, currentStatus === 'absent' ? null : 'absent')}
                className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                  currentStatus === 'absent' 
                    ? `${colors.bg} ${colors.text} ${colors.border} border shadow-sm` 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <span className="mr-1">✕</span> Absent
              </button>

            </div>
          </div>
        );
      })}
    </div>
  );
}

async function fetchEnrolledStudents(classId: string): Promise<EnrolledStudent[]> {
  try {
    const { data, error } = await supabase
      .from('class_enrollments')
      .select(`student_id, students:student_id ( full_name )`)
      .eq('class_id', classId)
      .eq('status', 'active');
    if (error) throw error;
    return data.map((item: any) => ({
      user_id: item.student_id,
      full_name: item.students?.full_name || 'Unknown Student',
    }));
  } catch (error) {
    return [];
  }
}