'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  format, parseISO, getHours, getMinutes,
  addWeeks, startOfWeek, endOfWeek, differenceInHours 
} from 'date-fns';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

export default function DashboardPage() {
  const [todayClasses, setTodayClasses] = useState<Booking[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState(0);
  
  const [dailyClassData, setDailyClassData] = useState<{ day: string; count: number; morning: number; afternoon: number; evening: number }[]>([]);
  const [forecastData, setForecastData] = useState<{ week: string; classes: number }[]>([]);
  
  // Room Pulse Timeline Data (Half-Hourly)
  const [roomPulseData, setRoomPulseData] = useState<{ 
    name: string; 
    capacity: number; 
    slots: { time: string; occupied: boolean }[] 
  }[]>([]);
  
  const [lowStockBooks, setLowStockBooks] = useState<any[]>([]);
  
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

      // 1. TODAY'S DATA
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, class_id')
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
        .in('status', ['confirmed', 'in_progress', 'completed']);

      if (bookings) {
        const teacherIds = [...new Set(bookings.map(b => b.teacher_id))];
        const courseIds = [...new Set(bookings.map(b => b.course_id))];
        const roomIds = [...new Set(bookings.map(b => b.room_id))];
        const classIds = [...new Set(bookings.map(b => b.class_id).filter(id => id))];

        const [teachersData, coursesData, roomsData, enrollmentsData] = await Promise.all([
          supabase.from('users').select('id, full_name').in('id', teacherIds),
          supabase.from('courses').select('id, name').in('id', courseIds),
          supabase.from('rooms').select('id, name, capacity').in('id', roomIds),
          classIds.length > 0 
            ? supabase.from('class_enrollments').select('class_id, student_id').in('class_id', classIds).eq('status', 'active')
            : Promise.resolve({ data: [] })
        ]);

        const teacherMap = Object.fromEntries(teachersData.data?.map(t => [t.id, t.full_name]) || []);
        const courseMap = Object.fromEntries(coursesData.data?.map(c => [c.id, c.name]) || []);
        const roomMap = Object.fromEntries(roomsData.data?.map(r => [r.id, { name: r.name, capacity: r.capacity || 1 }]) || []);

        const uniqueStudentIds = [...new Set(enrollmentsData.data?.map(e => e.student_id) || [])];
        setTodaysStudents(uniqueStudentIds);

        const enriched = bookings.map((b) => ({
          ...b,
          teacher_name: teacherMap[b.teacher_id] || 'Unknown',
          course_name: courseMap[b.course_id] || 'Unknown Course',
          room_name: roomMap[b.room_id]?.name || 'TBD',
          student_count: enrollmentsData.data?.filter((e: any) => e.class_id === b.class_id).length || 0,
        }));

        setTodayClasses(enriched);
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

        // === COMPACT HALF-HOUR ROOM PULSE GANTT CHART DATA ===
        const roomSlots: Record<string, { name: string; capacity: number; slots: { time: string; occupied: boolean }[] }> = {};
        const startHour = 9;
        const endHour = 21;

        Object.entries(roomMap).forEach(([id, info]: any) => { // ✅ FIX: Added `: any` to info
          const slots = [];
          for (let h = startHour; h < endHour; h++) {
            slots.push({ time: `${h}:00`, occupied: false });
            slots.push({ time: `${h}:30`, occupied: false });
          }
          roomSlots[id] = { name: info.name, capacity: info.capacity, slots };
        });

        enriched.forEach((b) => {
          if (!roomSlots[b.room_id]) return;
          const startDate = new Date(b.start_time);
          const endDate = new Date(b.end_time);
          
          roomSlots[b.room_id].slots.forEach((slot) => {
            const [hourStr, minuteStr] = slot.time.split(':');
            const slotDate = new Date();
            slotDate.setHours(parseInt(hourStr), parseInt(minuteStr), 0, 0);
            
            if (slotDate >= startDate && slotDate < endDate) {
              slot.occupied = true;
            }
          });
        });

        setRoomPulseData(Object.values(roomSlots));
      }

      // 2. CLASS COUNT PER DAY
      const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0,0,0,0);
      
      const dailyData = await Promise.all(
        weekDays.map(async (day, index) => {
          const dayStart = new Date(weekStart);
          dayStart.setDate(dayStart.getDate() + index);
          dayStart.setHours(0,0,0,0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23,59,59,999);

          const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .gte('start_time', dayStart.toISOString())
            .lte('start_time', dayEnd.toISOString())
            .in('status', ['confirmed', 'in_progress', 'completed']);

          const { data: dayBookings } = await supabase
            .from('bookings')
            .select('start_time')
            .gte('start_time', dayStart.toISOString())
            .lte('start_time', dayEnd.toISOString())
            .in('status', ['confirmed', 'in_progress', 'completed']);

          let morning = 0, afternoon = 0, evening = 0;
          (dayBookings || []).forEach((b: any) => {
            const hour = getHours(new Date(b.start_time));
            if (hour < 12) morning++;
            else if (hour < 17) afternoon++;
            else evening++;
          });

          return { day, count: count || 0, morning, afternoon, evening };
        })
      );
      setDailyClassData(dailyData);

      // 3. 7-WEEK FORECAST
      const forecastArray = [];
      const today = new Date();
      const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });

      for (let i = 0; i < 7; i++) {
        const weekStartDate = addWeeks(thisWeekStart, i);
        const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });
        
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .gte('start_time', weekStartDate.toISOString())
          .lte('start_time', weekEndDate.toISOString())
          .in('status', ['confirmed', 'in_progress', 'completed']);
        
        forecastArray.push({
          week: i === 0 ? 'This Wk' : `W+${i}`,
          classes: count || 0
        });
      }
      setForecastData(forecastArray);

      // 4. INVENTORY ALERT
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

  // Custom label renderer
  const renderCustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
      <text x={x + width / 2} y={y - 6} fill="#1e293b" fontSize={12} fontWeight="bold" textAnchor="middle">
        {value}
      </text>
    );
  };

  if (loading) {
    return <div className="animate-pulse space-y-6 p-6"><div className="h-8 bg-gray-200 rounded w-1/3"></div></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6 relative">
      
      {/* 1. WELCOME HEADER (Scrolls away normally) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
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

      {/* 2. STICKY KPI HEADER (6 Cards) */}
      <div className="sticky top-[64px] z-20 bg-gray-50/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 shadow-sm border-b border-gray-200/50 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-blue-600 text-base">📚</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Today's Classes</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-800">{todayClasses.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-600 text-base">👨‍🏫</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Teachers on Duty</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-800">{todaysTeachers.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-purple-600 text-base">👩‍🎓</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Number of Students</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-800">{todaysStudents.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-orange-600 text-base">⏳</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Pending Attendance</span>
              </div>
            </div>
            <div className="text-xl font-bold text-orange-600">{pendingAttendance}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-red-600 text-base">⚠️</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Books for Reorder</span>
              </div>
            </div>
            <div className="text-xl font-bold text-red-600">{lowStockBooks.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 text-base">🟢</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">Active Rooms</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-800">{Object.keys(roomPulseData).length}</div>
          </div>
        </div>
      </div>

      {/* 3. CHARTS SECTION WITH STICKY HEADER */}
      <div className="mb-6">
        <div className="sticky top-[160px] z-10 bg-gray-50/90 backdrop-blur-sm py-3 -mx-4 px-4 mb-2 border-b border-gray-200/50 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Class Daily / Weekly Stats</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Sun - Sat Count</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyClassData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} />
                  <Tooltip formatter={(value, name, props) => {
                    if (name === 'count') {
                      const data = props.payload;
                      return [`Morning: ${data.morning} | Afternoon: ${data.afternoon} | Evening: ${data.evening}`, 'Breakdown'];
                    }
                    return [value, name];
                  }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} label={renderCustomBarLabel} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Next 7 Weeks Forecast</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9ca3af'}} />
                  <Tooltip />
                  <Bar dataKey="classes" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} label={renderCustomBarLabel} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ROOM PULSE SECTION WITH STICKY HEADER */}
      <div className="mb-6">
        <div className="sticky top-[160px] z-10 bg-gray-50/90 backdrop-blur-sm py-3 -mx-4 px-4 mb-2 border-b border-gray-200/50 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Room Pulse</h2>
        </div>
        
        <div className="flex items-center gap-6 mb-3 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg w-fit px-4">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-green-500"></span> Occupied</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-gray-200"></span> Available</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[850px]">
              <div className="grid border-b border-gray-200 bg-gray-50 text-[10px]" style={{ gridTemplateColumns: '130px repeat(24, minmax(28px, 1fr))' }}>
                <div className="p-1 font-medium text-gray-600 pl-2 border-r border-gray-200">Room</div>
                {roomPulseData.length > 0 && roomPulseData[0].slots.map((slot, idx) => (
                  <div key={idx} className="p-1 text-center font-medium text-gray-500 border-r border-gray-200 last:border-r-0">{slot.time}</div>
                ))}
              </div>
              {roomPulseData.map((room, roomIndex) => (
                <div key={`room-${roomIndex}`} className="grid border-b border-gray-100 last:border-b-0 text-[10px] hover:bg-gray-50/50 transition" style={{ gridTemplateColumns: '130px repeat(24, minmax(28px, 1fr))' }}>
                  <div className="p-1 pl-2 border-r border-gray-200 flex items-center gap-2 bg-gray-50/30">
                    <span className="font-medium text-gray-800">{room.name}</span>
                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded ml-1">C{room.capacity}</span>
                  </div>
                  {room.slots.map((slot, idx) => (
                    <div key={`${room.name}-slot-${idx}`} className={`h-6 border-r border-gray-100 last:border-r-0 transition-colors ${slot.occupied ? 'bg-green-500' : 'bg-gray-100'}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. TODAY'S TIMELINE WITH STICKY HEADER */}
      <div className="mb-12">
        <div className="sticky top-[160px] z-10 bg-gray-50/90 backdrop-blur-sm py-3 -mx-4 px-4 mb-2 border-b border-gray-200/50 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">Today's Timeline</h2>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                    {classes.map((cls) => {
                      const start = parseISO(cls.start_time);
                      const end = parseISO(cls.end_time);
                      const durationHours = differenceInHours(end, start);
                      return (
                        <div key={cls.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 transition">
                          <div className="flex items-center gap-4">
                            <div className="w-20 text-sm font-medium text-gray-500">{format(start, 'h:mm a')}</div>
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
                            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">👥 {cls.student_count || 0}</span>
                            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{durationHours}h</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </div>

      {/* 6. Floating Action Button (Take Attendance) */}
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