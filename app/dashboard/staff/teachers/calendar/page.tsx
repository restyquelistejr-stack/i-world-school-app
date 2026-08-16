'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  format, 
  addDays, 
  addWeeks, 
  subWeeks, 
  startOfWeek, 
  parseISO,
  isSameDay,
  isSameWeek
} from 'date-fns';
import Link from 'next/link';

interface Booking {
  id: string;
  room_id: string;
  course_id: string;
  teacher_id: string;
  start_time: string;
  end_time: string;
  status: string;
  class_id?: string;
  class_code?: string;
  course_name?: string;
  room_name?: string;
  teacher_name?: string;
}

export default function TeacherCalendarPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherIdParam = searchParams.get('id');

  const urlBookingId = searchParams.get('booking_id');

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [teacherName, setTeacherName] = useState('Loading...');
  const [isAdminView, setIsAdminView] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI Display weeks (Starting on Monday)
  const weekDays = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDaysArray = Array.from({ length: 7 }, (_, i) => addDays(weekDays, i));

  // Get days to display
  const daysToShow = viewMode === 'week' ? weekDaysArray : [selectedDate];

  useEffect(() => {
    loadTeacherData();
  }, [selectedDate, viewMode, teacherIdParam]);

  // Auto-close the modal when navigating BACK to this page
  useEffect(() => {
    if (!urlBookingId) {
      setSelectedBooking(null);
    }
  }, [urlBookingId]);

  async function handleDeleteBooking(bookingId: string) {
    if (!confirm('Are you sure you want to remove this booking?')) return;
    
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);
      
      if (error) throw error;
      
      await loadTeacherData();
      setSelectedBooking(null);
      router.refresh();
    } catch (error: any) {
      console.error('Error deleting booking:', error);
      alert('Failed to delete booking. Please try again.');
    }
  }

  async function fetchRelatedData(booking: any) {
    let courseName = 'Unknown Course';
    let roomName = 'TBD';
    let teacherName = 'TBD';
    let classCode = 'N/A';

    try {
      if (booking.course_id) {
        const { data: courseData } = await supabase
          .from('courses')
          .select('name')
          .eq('id', booking.course_id)
          .single();
        if (courseData) courseName = courseData.name;
      }

      if (booking.room_id) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', booking.room_id)
          .single();
        if (roomData) roomName = roomData.name;
      }

      if (booking.teacher_id) {
        const { data: teacherData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', booking.teacher_id)
          .single();
        if (teacherData) teacherName = teacherData.full_name;
      }

      if (booking.class_id) {
        const { data: classData } = await supabase
          .from('classes')
          .select('class_code')
          .eq('id', booking.class_id)
          .single();
        if (classData) classCode = classData.class_code;
      }
    } catch (err) {
      console.error('Error fetching related data:', err);
    }

    return {
      ...booking,
      course_name: courseName,
      room_name: roomName,
      teacher_name: teacherName,
      class_code: classCode
    };
  }

  async function loadTeacherData() {
    setLoading(true);
    setErrorMessage(null);
    
    try {
      let targetTeacherId = teacherIdParam;
      let viewerIsAdmin = false;

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Auth error:', userError);
        setErrorMessage('Failed to authenticate user');
        setLoading(false);
        return;
      }
      
      if (targetTeacherId) {
        viewerIsAdmin = true;
        setIsAdminView(true);
      } else {
        if (!user) {
          setTeacherName('Not Logged In');
          setErrorMessage('Please log in to view your schedule');
          setLoading(false);
          return;
        }
        targetTeacherId = user.id;
        
        const { data: userCheck } = await supabase
          .from('users')
          .select('role')
          .eq('id', targetTeacherId)
          .single();
          
        if (userCheck?.role !== 'teacher') {
          viewerIsAdmin = true;
          setIsAdminView(true);
          targetTeacherId = 'all';
        }
      }

      if (targetTeacherId !== 'all') {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', targetTeacherId)
          .single();
        setTeacherName(userData?.full_name || (viewerIsAdmin ? 'Teacher View' : 'Teacher'));
      } else {
        setTeacherName('All Teachers');
      }

      // --- CRITICAL: Calculate exact date boundaries for filter ---
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'week') {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        startDate = new Date(weekStart);
        startDate.setHours(0, 0, 0, 0);
        endDate = addDays(weekStart, 6);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
      }

      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();

      console.log('Fetching teachers for range:', { startDateStr, endDateStr, targetTeacherId });

      // --- FILTERED QUERY (Massive performance improvement) ---
      let query = supabase
        .from('bookings')
        .select('*')
        .gte('start_time', startDateStr)
        .lte('start_time', endDateStr)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .order('start_time', { ascending: true });

      if (targetTeacherId !== 'all') {
        query = query.eq('teacher_id', targetTeacherId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase query error:', error);
        setErrorMessage(`Failed to load bookings: ${error.message}`);
        setLoading(false);
        return;
      }

      console.log('Found bookings for this period:', data?.length || 0);

      if (!data || data.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const enrichedBookings = await Promise.all(
        data.map(async (booking) => {
          return await fetchRelatedData(booking);
        })
      );

      setBookings(enrichedBookings);

    } catch (error: any) {
      console.error('Error in loadTeacherData:', error);
      if (!errorMessage) {
        setErrorMessage(error?.message || 'An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-green-100 text-green-800 border-green-200',
      in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-gray-100 text-gray-800 border-gray-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };
    return map[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'Confirmed',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      pending: 'Pending',
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
            onClick={() => loadTeacherData()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalBookings = bookings.length;

  // Correct Date Grouping using an Intermediate Key
  const groupedBookings = bookings.reduce((acc: Record<string, Booking[]>, booking) => {
    const dateKey = format(parseISO(booking.start_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(booking);
    return acc;
  }, {});

  // Sort dates ascending
  const sortedDates = Object.keys(groupedBookings).sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            📅 {isAdminView ? 'Teacher Schedule' : 'My Teaching Schedule'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdminView ? 'Viewing schedule for' : 'Welcome,'} 
            <span className="font-medium text-gray-800 ml-1">{teacherName}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {totalBookings} class{totalBookings !== 1 ? 'es' : ''} scheduled
          </p>
          {isAdminView && teacherIdParam && (
            <Link href="/dashboard/staff/teachers" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              ← Back to Teachers Directory
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* NEW: Quick access button to Attendance Page */}
          <Link href={`/dashboard/staff/attendance?date=${format(new Date(), 'yyyy-MM-dd')}`}>
            <button className="px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm">
              📋 Take Attendance
            </button>
          </Link>

          <button onClick={goToToday} className="px-3 py-1.5 text-sm rounded-lg bg-gray-200 hover:bg-gray-300">Today</button>
          <button onClick={() => navigate('prev')} className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300">←</button>
          <span className="text-lg font-semibold min-w-[160px] text-center hidden sm:block">
            {viewMode === 'day' ? format(selectedDate, 'MMM d, yyyy') : `${format(weekDaysArray[0], 'MMM d')} - ${format(weekDaysArray[6], 'MMM d')}`}
          </span>
          <button onClick={() => navigate('next')} className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300">→</button>
          
          <div className="border-l pl-3 ml-1 flex gap-1">
            <button onClick={() => setViewMode('day')} className={`px-3 py-1 text-sm rounded transition ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>📅 Day</button>
            <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-sm rounded transition ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>📆 Week</button>
          </div>
        </div>
      </div>

      {/* CLASSIC TIMESHEET UI */}
      {totalBookings === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500 text-lg">No classes scheduled for this period.</p>
          <p className="text-sm text-gray-400 mt-2">
            {isAdminView && teacherIdParam 
              ? `${teacherName} has no classes in the selected period.` 
              : 'No classes are scheduled.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {sortedDates.map((dateKey) => {
            const dailyClasses = groupedBookings[dateKey];
            return (
              <div key={dateKey} className="border-b border-gray-200 last:border-b-0">
                
                {/* Clean Date Header */}
                <div className="bg-gray-50/70 px-6 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">
                    {format(parseISO(dateKey), 'EEEE, MMMM d, yyyy')}
                  </h3>
                  <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                    {dailyClasses.length} class{dailyClasses.length !== 1 ? 'es' : ''}
                  </span>
                </div>

                {/* List of Classes */}
                <div className="divide-y divide-gray-100">
                  {dailyClasses.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => setSelectedBooking(booking)}
                      className="w-full text-left px-6 py-4 hover:bg-blue-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Left: Time (Fixed width column) */}
                      <div className="min-w-[130px] font-medium text-gray-600 text-sm sm:text-base">
                        {format(parseISO(booking.start_time), 'h:mm a')} - {format(parseISO(booking.end_time), 'h:mm a')}
                      </div>

                      {/* Center: Teacher & Course */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-grow">
                        <span className="font-bold text-gray-800">{booking.teacher_name}</span>
                        <span className="hidden sm:inline text-gray-300">•</span>
                        <span className="text-gray-600">{booking.course_name}</span>
                      </div>

                      {/* Right: Status, Room, Code */}
                      <div className="flex flex-wrap items-center gap-3 text-sm justify-start sm:justify-end">
                        <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full border ${getStatusColor(booking.status)}`}>
                          {getStatusBadge(booking.status)}
                        </span>
                        <span className="flex items-center gap-1 text-gray-400 whitespace-nowrap">
                          <span>📍</span>
                          <span>{booking.room_name}</span>
                        </span>
                        {booking.class_code && (
                          <span className="font-mono text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                            {booking.class_code}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 border-t border-gray-200 p-3 bg-gray-50 rounded-lg flex flex-wrap items-center gap-4 text-xs">
        <span className="font-medium text-gray-700">Status:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-200 border border-green-400"></span>
          Confirmed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-200 border border-blue-400"></span>
          In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-yellow-200 border border-yellow-400"></span>
          Pending
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-200 border border-red-400"></span>
          Cancelled
        </span>
        <span className="flex items-center gap-1 ml-4">
          <span className="text-gray-400">💡 Click any row for details</span>
        </span>
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">Class Details</h3>
              <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Teacher</span>
                <span className="font-medium">{selectedBooking.teacher_name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Course</span>
                <span className="font-medium">{selectedBooking.course_name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Class Code</span>
                <span className="font-mono font-bold">{selectedBooking.class_code}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Room</span>
                <span className="font-medium">{selectedBooking.room_name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Time</span>
                <span className="font-medium">
                  {format(parseISO(selectedBooking.start_time), 'MMM d, h:mm a')} - {format(parseISO(selectedBooking.end_time), 'h:mm a')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedBooking.status)}`}>
                  {getStatusBadge(selectedBooking.status)}
                </span>
              </div>
            </div>
            
            <div className="mt-6 mb-3">
              <Link
                href={`/dashboard/staff/attendance?date=${format(parseISO(selectedBooking.start_time), 'yyyy-MM-dd')}&booking_id=${selectedBooking.id}`}
                className="w-full flex justify-center items-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                📋 Take Attendance for this Class
              </Link>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button onClick={() => handleDeleteBooking(selectedBooking.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Remove</button>
              <button onClick={() => setSelectedBooking(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}