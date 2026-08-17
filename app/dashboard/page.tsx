'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO, isBefore, isAfter, getHours } from 'date-fns';
import Link from 'next/link';

interface Booking {
  id: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  course_id: string;
  room_id: string;
  status: string;
  teacher_name?: string;
  course_name?: string;
  room_name?: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

export default function DashboardPage() {
  const [todayClasses, setTodayClasses] = useState<Booking[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState(0);
  
  // Stores room status with capacity and occupancy percentage
  const [roomHeatmap, setRoomHeatmap] = useState<Record<string, { name: string; capacity: number; morning: number; afternoon: number; evening: number }>>({});
  
  const [todaysTeachers, setTodaysTeachers] = useState<string[]>([]);
  const [todaysStudents, setTodaysStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadDashboardData();
    getUserName();
  }, []);

  async function getUserName() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserName(user.user_metadata?.full_name || user.email || 'Admin');
    }
  }

  async function loadDashboardData() {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
        .in('status', ['confirmed', 'in_progress', 'completed']);

      if (!bookings) return;

      const teacherIds = [...new Set(bookings.map(b => b.teacher_id))];
      const courseIds = [...new Set(bookings.map(b => b.course_id))];
      const roomIds = [...new Set(bookings.map(b => b.room_id))];

      // We need to fetch student IDs from class_enrollments to get a true count
      const classIds = [...new Set(bookings.map(b => b.class_id).filter(id => id))];

      const [teachersData, coursesData, roomsData, enrollmentsData] = await Promise.all([
        supabase.from('users').select('id, full_name').in('id', teacherIds),
        supabase.from('courses').select('id, name').in('id', courseIds),
        supabase.from('rooms').select('id, name, capacity').in('id', roomIds),
        classIds.length > 0 
          ? supabase.from('class_enrollments').select('student_id').in('class_id', classIds).eq('status', 'active')
          : Promise.resolve({ data: [] })
      ]);

      const teacherMap = Object.fromEntries(teachersData.data?.map(t => [t.id, t.full_name]) || []);
      const courseMap = Object.fromEntries(coursesData.data?.map(c => [c.id, c.name]) || []);
      const roomMap = Object.fromEntries(roomsData.data?.map(r => [r.id, { name: r.name, capacity: r.capacity || 1 }]) || []);

      // Extract unique students
      const uniqueStudentIds = [...new Set(enrollmentsData.data?.map(e => e.student_id) || [])];
      setTodaysStudents(uniqueStudentIds);

      const enriched = bookings.map((b) => ({
        ...b,
        teacher_name: teacherMap[b.teacher_id] || 'Unknown',
        course_name: courseMap[b.course_id] || 'Unknown Course',
        room_name: roomMap[b.room_id]?.name || 'TBD',
      }));

      setTodayClasses(enriched);

      // Build the Room Heatmap (Morning / Afternoon / Evening with Percentage Occupancy)
      const rooms: Record<string, { name: string; capacity: number; morning: number; afternoon: number; evening: number }> = {};
      
      enriched.forEach(b => {
        const startHour = getHours(new Date(b.start_time));
        const endHour = getHours(new Date(b.end_time));
        const duration = endHour - startHour;
        let timeSlot = '';
        if (startHour < 12) timeSlot = 'morning';
        else if (startHour < 17) timeSlot = 'afternoon';
        else timeSlot = 'evening';

        if (!rooms[b.room_id]) {
          const roomInfo = roomMap[b.room_id] || { name: b.room_name, capacity: 1 };
          rooms[b.room_id] = { 
            name: roomInfo.name, 
            capacity: roomInfo.capacity, 
            morning: 0, 
            afternoon: 0, 
            evening: 0 
          };
        }
        // Add the duration of this booking to the total occupancy for that slot
        rooms[b.room_id][timeSlot as 'morning' | 'afternoon' | 'evening'] += duration;
      });
      
      // Calculate percentages
      Object.keys(rooms).forEach(roomId => {
        rooms[roomId].morning = Math.min(100, Math.round((rooms[roomId].morning / 3) * 100));
        rooms[roomId].afternoon = Math.min(100, Math.round((rooms[roomId].afternoon / 3) * 100));
        rooms[roomId].evening = Math.min(100, Math.round((rooms[roomId].evening / 3) * 100));
      });

      setRoomHeatmap(rooms);

      const uniqueTeachers = [...new Set(enriched.map(b => b.teacher_name))];
      setTodaysTeachers(uniqueTeachers);

      let pending = 0;
      for (const b of enriched) {
        const { count } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('booking_id', b.id);
        if (count === 0) pending++;
      }
      setPendingAttendance(pending);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
    setLoading(false);
  }

  const groupClasses = (classes: Booking[]) => {
    const groups: { [key: string]: Booking[] } = { Morning: [], Afternoon: [], Evening: [] };
    classes.forEach(c => {
      const hour = new Date(c.start_time).getHours();
      if (hour < 12) groups.Morning.push(c);
      else if (hour < 17) groups.Afternoon.push(c);
      else groups.Evening.push(c);
    });
    return groups;
  };

  const grouped = groupClasses(todayClasses);

  // Helper to get occupancy color
  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 50) return 'bg-blue-500 text-white';
    if (percentage > 0) return 'bg-blue-200 text-blue-800';
    return 'bg-gray-100 text-gray-400';
  };

  if (loading) {
    return <div className="animate-pulse space-y-6 p-6"><div className="h-8 bg-gray-200 rounded w-1/3"></div></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      
      {/* 1. Header Row (Left: Greeting / Right: Schedule Button) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {userName} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          <Link href="/dashboard/classes/calendar">
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium flex items-center gap-2">
              <span>📅</span> Schedule
            </button>
          </Link>
        </div>
      </div>

      {/* 2. KPI Pill Badges (5 Cards - Orientation as requested) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-lg">📚</div>
          <div>
            <div className="text-2xl font-bold text-gray-800">{todayClasses.length}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Today's Classes</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">👨‍🏫</div>
          <div>
            <div className="text-2xl font-bold text-gray-800">{todaysTeachers.length}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Teachers on Duty</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-lg">👩‍🎓</div>
          <div>
            <div className="text-2xl font-bold text-gray-800">{todaysStudents.length}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Number of Students</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full ${pendingAttendance > 0 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'} flex items-center justify-center text-lg`}>
            {pendingAttendance > 0 ? '⏳' : '✅'}
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-800">{pendingAttendance}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Pending Attendance</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-lg">🟢</div>
          <div>
            <div className="text-2xl font-bold text-gray-800">{Object.keys(roomHeatmap).length}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Active Rooms</div>
          </div>
        </div>
      </div>

      {/* 3. Room Pulse Heatmap with Legend & Capacity */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>🏢</span> Room Pulse
        </h2>
        
        {/* Visual Legend */}
        <div className="flex items-center gap-6 mb-4 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg w-fit px-4">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-500"></span> Over 50% Booked
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-200"></span> Partially Booked
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-gray-200"></span> Available
          </span>
          <span className="text-gray-400">|</span>
          <span className="flex items-center gap-1">
            <span className="font-bold">M</span> Morning
            <span className="font-bold ml-2">A</span> Afternoon
            <span className="font-bold ml-2">E</span> Evening
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(roomHeatmap).map(([roomId, { name, capacity, morning, afternoon, evening }]) => (
            <div key={roomId} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <div className="font-medium text-gray-700 text-sm">{name}</div>
                <div className="text-xs text-gray-400">Cap: {capacity}</div>
              </div>
              <div className="flex gap-1.5">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-medium transition-colors ${getOccupancyColor(morning)}`}>
                  {morning}%
                </div>
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-medium transition-colors ${getOccupancyColor(afternoon)}`}>
                  {afternoon}%
                </div>
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-medium transition-colors ${getOccupancyColor(evening)}`}>
                  {evening}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Today's Timeline (Split by Time of Day) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
          <span>📅</span> Today's Timeline
        </h2>
        <div className="space-y-8">
          {Object.entries(grouped).map(([timeOfDay, classes]) => (
            classes.length > 0 && (
              <div key={timeOfDay}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                  <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{timeOfDay}</h3>
                  <span className="text-xs text-gray-400 ml-2">({classes.length} classes)</span>
                </div>
                <div className="space-y-2">
                  {classes.map((cls) => (
                    <div key={cls.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 transition">
                      <div className="flex items-center gap-4">
                        <div className="w-16 text-sm font-medium text-gray-500">
                          {format(parseISO(cls.start_time), 'h:mm a')}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{cls.course_name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span>👨‍🏫 {cls.teacher_name}</span>
                            <span className="text-gray-300">•</span>
                            <span>🏫 {cls.room_name}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${cls.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {cls.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* 5. Floating Action Button (Take Attendance) */}
      <Link href="/dashboard/staff/attendance">
        <button className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-3 rounded-full shadow-lg text-white transition-all hover:scale-105 ${pendingAttendance > 0 ? 'bg-orange-600 animate-pulse' : 'bg-blue-600'}`}>
          <span className="text-xl">📋</span>
          <span className="font-medium">Take Attendance</span>
          {pendingAttendance > 0 && (
            <span className="bg-white text-orange-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ml-1">
              {pendingAttendance}
            </span>
          )}
        </button>
      </Link>
    </div>
  );
}