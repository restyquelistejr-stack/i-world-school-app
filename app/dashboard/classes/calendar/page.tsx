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
  addHours,
  formatISO
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
  teacher: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  course: {
    id: string;
    name: string;
  } | null;
  student: {
    id: string;
    full_name: string;
  } | null;
}

interface Room {
  id: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
}

interface Teacher {
  id: string;
  full_name: string;
}

export default function ClassCalendarPage() {
  // --- STATE ---
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [debugInfo, setDebugInfo] = useState<string>('Loading data...');
  const [showManageView, setShowManageView] = useState(false);
  
  // Editing State
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);

  const weekDays = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDaysArray = Array.from({ length: 7 }, (_, i) => addDays(weekDays, i));

  // ==========================================
  // LOAD DATA FUNCTION (FIXED - NO class_id JOIN)
  // ==========================================
  async function loadData() {
    setLoading(true);
    setDebugInfo('Loading data...');
    try {
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

      // 1. Fetch Rooms
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (roomsError) throw new Error(`Rooms Error: ${roomsError.message}`);
      setRooms(roomsData || []);

      // 2. Fetch Bookings - WITHOUT the class_id join
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          course:course_id ( id, name ),
          student:student_id ( id, full_name )
        `)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .in('status', ['confirmed', 'in_progress', 'pending']);

      if (bookingsError) throw new Error(`Bookings Error: ${bookingsError.message}`);

      // 3. Fetch ALL teachers separately
      const { data: allTeachersData, error: teacherError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'teacher')
        .eq('is_active', true);

      if (teacherError) throw new Error(`Teachers Error: ${teacherError.message}`);

      // 4. Enrich the bookings with teacher data
      const formattedBookings = (bookingsData || []).map((booking: any) => {
        const teacher = allTeachersData?.find(t => t.id === booking.teacher_id) || null;
        return {
          ...booking,
          teacher: teacher,
          class_code: 'N/A'
        };
      });

      // 5. Fetch class codes from class_options for these bookings
      if (formattedBookings.length > 0) {
        const startTimes = [...new Set(formattedBookings.map(b => b.start_time))];
        
        const { data: classOptionsData, error: classOptError } = await supabase
          .from('class_options')
          .select('start_time, class_id')
          .in('start_time', startTimes);

        if (!classOptError && classOptionsData) {
          const classIdMap: Record<string, string> = {};
          classOptionsData.forEach(co => {
            if (co.start_time && co.class_id) {
              classIdMap[co.start_time] = co.class_id;
            }
          });

          const classIds = [...new Set(Object.values(classIdMap).filter(id => id))];
          
          if (classIds.length > 0) {
            const { data: classesData, error: classesError } = await supabase
              .from('classes')
              .select('id, class_code')
              .in('id', classIds);

            if (!classesError && classesData) {
              const classCodeMap: Record<string, string> = {};
              classesData.forEach(c => {
                classCodeMap[c.id] = c.class_code || 'N/A';
              });

              formattedBookings.forEach(b => {
                const classId = classIdMap[b.start_time];
                if (classId && classCodeMap[classId]) {
                  b.class_code = classCodeMap[classId];
                  b.class_id = classId;
                }
              });
            }
          }
        }
      }

      // Sort bookings by start_time (earliest first)
      formattedBookings.sort((a, b) => {
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });

      setBookings(formattedBookings || []);
      setDebugInfo(`✅ Found ${formattedBookings?.length || 0} bookings`);

    } catch (err: any) {
      console.error('❌ Load Error:', err);
      setDebugInfo(`⚠️ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllTeachers() {
    const { data, error } = await supabase.from('users').select('id, full_name').eq('role', 'teacher');
    if (!error) setAllTeachers(data || []);
  }

  // ==========================================
  // INIT & VIEW SWITCH
  // ==========================================
  useEffect(() => {
    loadData();
    if (showManageView) loadAllTeachers();
  }, [selectedDate, viewMode, showManageView]);

  // ==========================================
  // HELPERS
  // ==========================================
  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-green-500',
      in_progress: 'bg-blue-500',
      completed: 'bg-gray-500',
      cancelled: 'bg-red-500',
      pending: 'bg-yellow-500',
    };
    return map[status] || 'bg-gray-400';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      confirmed: '✅ Confirmed',
      in_progress: '🔄 In Progress',
      completed: '✅ Completed',
      cancelled: '❌ Cancelled',
      pending: '⏳ Pending',
    };
    return map[status] || status;
  };

  const getTeacherColor = (name: string) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-700', 'bg-green-100 border-green-300 text-green-700',
      'bg-purple-100 border-purple-300 text-purple-700', 'bg-pink-100 border-pink-300 text-pink-700',
      'bg-indigo-100 border-indigo-300 text-indigo-700', 'bg-orange-100 border-orange-300 text-orange-700',
      'bg-teal-100 border-teal-300 text-teal-700', 'bg-red-100 border-red-300 text-red-700',
      'bg-yellow-100 border-yellow-300 text-yellow-700', 'bg-cyan-100 border-cyan-300 text-cyan-700',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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

  const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name || 'Unknown Room';

  // ==========================================
  // DELETE & UPDATE LOGIC
  // ==========================================
  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this booking?')) return;
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) alert('Failed to delete: ' + error.message);
      else {
        setSelectedBooking(null);
        setEditingBooking(null);
        await loadData();
      }
    } catch (err: any) {
      alert('Error deleting booking: ' + err.message);
    }
  };

  const handleUpdateBooking = async () => {
    if (!editingBooking) return;
    const { error } = await supabase
      .from('bookings')
      .update({
        teacher_id: editingBooking.teacher_id,
        start_time: editingBooking.start_time,
        end_time: editingBooking.end_time,
      })
      .eq('id', editingBooking.id);
    if (error) alert('Failed to update: ' + error.message);
    else {
      setEditingBooking(null);
      loadData();
    }
  };

  // ==========================================
  // RENDER: CALENDAR VIEWS
  // ==========================================
  const renderWeekView = () => {
    if (rooms.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          <p>No rooms available. Please add rooms to see the calendar.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto relative" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        <div className="min-w-[1200px]">
          {/* Sticky Header */}
          <div className="grid border-b bg-gray-50 sticky top-0 z-20" style={{ gridTemplateColumns: '150px repeat(7, 1fr)' }}>
            <div className="p-3 bg-gray-50 font-medium text-gray-600 sticky left-0 z-30 border-r">
              Room
            </div>
            {weekDaysArray.map((day, i) => (
              <div key={i} className={`p-3 text-center ${isToday(day) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <div className="font-medium">{format(day, 'EEE')}</div>
                <div className={`text-sm ${isToday(day) ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Rooms Rows */}
          {rooms.map((room) => {
            const roomBookings = bookings.filter(b => b.room_id === room.id);
            
            return (
              <div key={room.id} className="grid border-b hover:bg-gray-50/30" style={{ gridTemplateColumns: '150px repeat(7, 1fr)' }}>
                {/* Sticky Room Column */}
                <div className="p-3 bg-gray-50 sticky left-0 z-10 border-r flex flex-col justify-center min-h-[120px] shadow-sm">
                  <div className="font-medium text-gray-800 text-sm">{room.name}</div>
                  <div className="text-xs text-gray-500">Cap: {room.capacity}</div>
                </div>
                
                {/* Day Columns */}
                {weekDaysArray.map((day, dayIndex) => {
                  // Filter and sort bookings for this day by time (earliest first)
                  const dayBookings = roomBookings
                    .filter((b) => isSameDay(new Date(b.start_time), day))
                    .sort((a, b) => {
                      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
                    });
                  
                  return (
                    <div key={dayIndex} className="p-2 border-r min-h-[120px] flex flex-col gap-1 relative">
                      {dayBookings.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-green-600 font-medium bg-green-50/50 m-2 rounded">
                          Available
                        </div>
                      ) : (
                        dayBookings.map((booking, bookingIndex) => (
                          <button
                            key={booking.id}
                            onClick={() => setSelectedBooking(booking)}
                            className={`w-full text-left p-1.5 rounded shadow-sm border hover:shadow-md transition text-[10px] ${getTeacherColor(booking.teacher?.full_name || 'Unknown')} flex flex-col justify-center min-h-[45px]`}
                          >
                            <div className="font-bold text-[11px] leading-tight line-clamp-2 mb-0.5">
                              {booking.course?.name || 'Class'}
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-gray-600">
                              <span className="truncate max-w-[70px]">
                                {booking.teacher?.full_name || 'Unknown'}
                              </span>
                              <span className="bg-white/90 px-1 rounded text-[7px] font-bold text-blue-600 border border-blue-200">
                                {booking.class_code || 'N/A'}
                              </span>
                            </div>
                            <div className="text-[8px] text-gray-400 mt-0.5">
                              {format(parseISO(booking.start_time), 'h:mm a')}
                            </div>
                            {/* Small time indicator showing position in day */}
                            {dayBookings.length > 1 && (
                              <div className="absolute top-0 right-0 mt-0.5 mr-0.5 text-[6px] text-gray-400 bg-white/70 px-1 rounded">
                                #{bookingIndex + 1}
                              </div>
                            )}
                          </button>
                        ))
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

  const renderDayView = () => {
    if (rooms.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          <p>No rooms available. Please add rooms to see the calendar.</p>
        </div>
      );
    }

    const hours = Array.from({ length: 14 }, (_, i) => i + 8);
    return (
      <div className="overflow-x-auto relative" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        <div className="min-w-[800px]">
          {/* Sticky Header */}
          <div className="grid border-b bg-gray-50 sticky top-0 z-20" style={{ gridTemplateColumns: `80px repeat(${rooms.length || 1}, minmax(120px, 1fr))` }}>
            <div className="p-3 font-medium text-gray-600 sticky left-0 z-30 border-r text-xs text-center bg-gray-50">
              Time
            </div>
            {rooms.map((room) => (
              <div key={room.id} className="p-2 border-r text-center bg-gray-50">
                <div className="font-medium text-xs text-gray-800">{room.name}</div>
                <div className="text-[10px] text-gray-400">Cap: {room.capacity}</div>
              </div>
            ))}
          </div>

          {/* Time Slots */}
          {hours.map((hour) => {
            const slotDate = new Date(selectedDate);
            slotDate.setHours(hour, 0, 0, 0);
            return (
              <div key={hour} className="grid border-b hover:bg-gray-50/30" style={{ gridTemplateColumns: `80px repeat(${rooms.length || 1}, minmax(120px, 1fr))` }}>
                {/* Sticky Time Column */}
                <div className="p-2 bg-gray-50 sticky left-0 z-10 border-r flex items-center justify-center text-xs font-mono text-gray-500">
                  {format(slotDate, 'h:mm a')}
                </div>
                {rooms.map((room) => {
                  const bookingsAtThisTime = bookings
                    .filter(
                      (b) => 
                        b.room_id === room.id && 
                        isSameDay(new Date(b.start_time), selectedDate) &&
                        new Date(b.start_time).getHours() <= hour &&
                        new Date(b.end_time).getHours() > hour
                    )
                    .sort((a, b) => {
                      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
                    });
                  
                  return (
                    <div key={room.id} className="p-1 border-r min-h-[60px] flex flex-col gap-1 justify-center">
                      {bookingsAtThisTime.length > 0 ? (
                        bookingsAtThisTime.map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => setSelectedBooking(booking)}
                            className={`w-full text-left p-1.5 rounded shadow-sm border hover:shadow-md transition ${getTeacherColor(booking.teacher?.full_name || 'Unknown')} flex flex-col justify-center`}
                          >
                            <div className="flex justify-between items-start gap-1 mb-0.5">
                              <span className="font-bold text-[10px] leading-tight line-clamp-1 flex-1">
                                {booking.course?.name || 'Class'}
                              </span>
                              <span className="shrink-0 bg-white/90 px-1 rounded text-[7px] font-bold text-blue-600 border border-blue-200">
                                {booking.class_code || 'N/A'}
                              </span>
                            </div>
                            <div className="text-[8px] text-gray-600 truncate">
                              {booking.teacher?.full_name || 'Unknown'}
                            </div>
                            <div className="text-[8px] text-gray-400 mt-0.5">
                              {format(parseISO(booking.start_time), 'h:mm')} - {format(parseISO(booking.end_time), 'h:mm')}
                            </div>
                          </button>
                        ))
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

  // ==========================================
  // RENDER: MANAGE VIEW
  // ==========================================
  const renderManageView = () => {
    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">Manage All Bookings</h2>
          <div className="text-sm text-gray-500">{bookings.length} bookings found</div>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Teacher</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No bookings found for this date range.</td></tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-600">{b.class_code || '-'}</td>
                    <td className="px-4 py-3 font-medium">{getRoomName(b.room_id)}</td>
                    <td className="px-4 py-3">{b.course?.name || '-'}</td>
                    <td className="px-4 py-3">{b.teacher?.full_name || '-'}</td>
                    <td className="px-4 py-3">{format(parseISO(b.start_time), 'MMM d, h:mm a')}</td>
                    <td className="px-4 py-3">{format(parseISO(b.end_time), 'h:mm a')}</td>
                    <td className="px-4 py-3 flex justify-center gap-2">
                      <button onClick={() => setEditingBooking(b)} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition" title="Edit">✏️</button>
                      <button onClick={() => handleDeleteBooking(b.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition" title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: MAIN
  // ==========================================
  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      
      {/* PREMIUM HEADER BLOCK */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 pb-6 border-b border-gray-200">
        
        {/* Left side: Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="text-3xl">📅</span> Class Schedule
          </h1>
          <p className={`text-xs mt-1 ${debugInfo.includes('Error') ? 'text-red-500' : 'text-gray-400'}`}>
            {debugInfo}
          </p>
        </div>

        {/* Right side: Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
            {/* Today Button */}
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

            {/* Navigation Arrows */}
            <div className="flex items-center gap-1 border-l border-r border-gray-200 px-1 mx-1">
              <button onClick={() => navigate('prev')} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white rounded transition">
                ←
              </button>
              <span className="text-sm font-semibold min-w-[140px] text-center text-gray-800 px-2">
                {viewMode === 'day' ? format(selectedDate, 'MMM d, yyyy') : `${format(weekDaysArray[0], 'MMM d')} - ${format(weekDaysArray[6], 'MMM d')}`}
              </span>
              <button onClick={() => navigate('next')} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white rounded transition">
                →
              </button>
            </div>

            {/* Day / Week Toggle */}
            <div className="flex bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <button 
                onClick={() => setViewMode('day')} 
                className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'day' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Day
              </button>
              <button 
                onClick={() => setViewMode('week')} 
                className={`px-3 py-1.5 text-xs font-medium transition border-l border-gray-200 ${viewMode === 'week' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Week
              </button>
            </div>
          </div>

          {/* Separator & Teachers Button */}
          <Link href="/dashboard/staff/teachers/calendar">
            <button className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm flex items-center gap-2">
              👨‍🏫 Teachers
            </button>
          </Link>

        </div>
      </div>
      {/* END PREMIUM HEADER BLOCK */}

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {showManageView ? renderManageView() : (viewMode === 'day' ? renderDayView() : renderWeekView())}
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">Booking Details</h3>
              <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Class Code</span><span className="font-mono font-bold text-gray-700">{selectedBooking.class_code || 'N/A'}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Room</span><span className="font-medium">{getRoomName(selectedBooking.room_id)}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Course</span><span className="font-medium">{selectedBooking.course?.name || 'Unknown'}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Teacher</span><span className="font-medium">👨‍🏫 {selectedBooking.teacher?.full_name || 'Not Assigned'}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Time</span><span className="font-medium">{format(parseISO(selectedBooking.start_time), 'MMM d, h:mm a')} - {format(parseISO(selectedBooking.end_time), 'h:mm a')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`px-2 py-0.5 rounded-full text-xs text-white ${getStatusColor(selectedBooking.status)}`}>{getStatusLabel(selectedBooking.status)}</span></div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => handleDeleteBooking(selectedBooking.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Delete</button>
              <button onClick={() => setSelectedBooking(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Booking Modal */}
      {editingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">✏️ Edit Booking</h3>
              <button onClick={() => setEditingBooking(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Room</label>
                <div className="text-sm font-medium text-gray-800">{getRoomName(editingBooking.room_id)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Change Teacher</label>
                <select value={editingBooking.teacher_id || ''} onChange={(e) => setEditingBooking({...editingBooking, teacher_id: e.target.value})} className="w-full border rounded-lg p-2 text-sm">
                  <option value="">Unassigned</option>
                  {allTeachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New Start</label>
                  <input type="datetime-local" value={formatISO(parseISO(editingBooking.start_time), { representation: 'complete' }).slice(0, 16)} onChange={(e) => setEditingBooking({...editingBooking, start_time: new Date(e.target.value).toISOString()})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New End</label>
                  <input type="datetime-local" value={formatISO(parseISO(editingBooking.end_time), { representation: 'complete' }).slice(0, 16)} onChange={(e) => setEditingBooking({...editingBooking, end_time: new Date(e.target.value).toISOString()})} className="w-full border rounded-lg p-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditingBooking(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Cancel</button>
              <button onClick={handleUpdateBooking} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}