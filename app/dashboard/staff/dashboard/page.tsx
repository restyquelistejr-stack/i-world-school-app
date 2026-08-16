'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StaffStats {
  total: number;
  active: number;
  teachers: number;
  admins: number;
  facilities: number;
  availableTeachers: number;
  busyTeachers: number;
  classesToday: number;
}

export default function StaffDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StaffStats>({
    total: 0,
    active: 0,
    teachers: 0,
    admins: 0,
    facilities: 0,
    availableTeachers: 0,
    busyTeachers: 0,
    classesToday: 0,
  });
  const [recentStaff, setRecentStaff] = useState<any[]>([]);
  const [todayClasses, setTodayClasses] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 [Dashboard] Loading staff data...');

      // 1. Get all staff users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'staff', 'teacher', 'facilities'])
        .order('created_at', { ascending: false });

      console.log('🔍 [Dashboard] Users query result:', { 
        data: usersData, 
        error: usersError,
        count: usersData?.length || 0 
      });

      if (usersError) {
        console.error('❌ [Dashboard] Users query error:', usersError);
        setError('Failed to load users: ' + usersError.message);
        setLoading(false);
        return;
      }

      const staffUsers = usersData || [];
      console.log('📊 [Dashboard] Total staff users found:', staffUsers.length);
      console.log('📊 [Dashboard] Staff users:', staffUsers.map(u => ({ 
        name: u.full_name, 
        role: u.role,
        email: u.email 
      })));

      // Calculate stats
      const total = staffUsers.length;
      const active = staffUsers.filter(u => u.is_active).length;
      const teachers = staffUsers.filter(u => u.role === 'teacher').length;
      const admins = staffUsers.filter(u => u.role === 'admin').length;
      const facilities = staffUsers.filter(u => u.role === 'facilities').length;

      console.log('📈 [Dashboard] Stats:', { total, active, teachers, admins, facilities });

      // Get teacher availability
      const teacherIds = staffUsers.filter(u => u.role === 'teacher').map(u => u.id);
      let availableTeachers = 0;
      let busyTeachers = 0;

      if (teacherIds.length > 0) {
        console.log('🔍 [Dashboard] Checking availability for teachers:', teacherIds.length);
        
        const { data: availability, error: availError } = await supabase
          .from('teacher_availability')
          .select('teacher_id')
          .in('teacher_id', teacherIds)
          .eq('is_active', true);

        console.log('🔍 [Dashboard] Availability query:', { 
          data: availability, 
          error: availError,
          count: availability?.length || 0 
        });

        const availableIds = new Set(availability?.map(a => a.teacher_id) || []);
        availableTeachers = availableIds.size;
        busyTeachers = teachers - availableTeachers;
        console.log('📈 [Dashboard] Teacher availability:', { availableTeachers, busyTeachers });
      }

      // Get today's classes
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      console.log('🔍 [Dashboard] Fetching today\'s classes between:', { 
        start: today.toISOString(), 
        end: tomorrow.toISOString() 
      });

      const { data: classData, error: classError } = await supabase
        .from('class_sessions')
        .select(`
          *,
          class:class_id(*),
          teacher:teacher_id(id, full_name),
          room:room_id(id, name)
        `)
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())
        .in('status', ['scheduled', 'in_progress']);

      console.log('🔍 [Dashboard] Class sessions query:', { 
        data: classData, 
        error: classError,
        count: classData?.length || 0 
      });

      setStats({
        total,
        active,
        teachers,
        admins,
        facilities,
        availableTeachers,
        busyTeachers,
        classesToday: classData?.length || 0,
      });

      setRecentStaff(staffUsers.slice(0, 5));
      setTodayClasses(classData || []);

      console.log('✅ [Dashboard] Dashboard loaded successfully!');

    } catch (error: any) {
      console.error('❌ [Dashboard] Error loading dashboard:', error);
      setError('Error: ' + error.message);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <h3 className="font-semibold">Error Loading Dashboard</h3>
          <p className="text-sm">{error}</p>
          <button 
            onClick={loadDashboardData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of all staff activities and statistics</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Staff</div>
          <div className="text-xs text-green-600">{stats.active} active</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold">{stats.teachers}</div>
          <div className="text-sm text-gray-500">Teachers</div>
          <div className="text-xs text-blue-600">{stats.availableTeachers} available</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold">{stats.classesToday}</div>
          <div className="text-sm text-gray-500">Classes Today</div>
          <div className="text-xs text-yellow-600">Upcoming sessions</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold">{stats.admins + stats.facilities}</div>
          <div className="text-sm text-gray-500">Admin & Staff</div>
          <div className="text-xs text-gray-500">{stats.admins} admins, {stats.facilities} facilities</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="font-semibold mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/staff/directory">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              View Staff
            </button>
          </Link>
          <Link href="/dashboard/staff/teacher-matching">
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              Teacher Matching
            </button>
          </Link>
          <Link href="/dashboard/classes/calendar">
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
              View Calendar
            </button>
          </Link>
        </div>
      </div>

      {/* Teacher Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="font-semibold mb-3">Teacher Status</h3>
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="text-sm text-gray-500">Available Teachers</div>
            <div className="text-xl font-bold text-green-600">{stats.availableTeachers}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Busy Teachers</div>
            <div className="text-xl font-bold text-red-600">{stats.busyTeachers}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Teachers</div>
            <div className="text-xl font-bold text-blue-600">{stats.teachers}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Availability</div>
            <div className="text-xl font-bold">
              {stats.teachers > 0 ? Math.round((stats.availableTeachers / stats.teachers) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* Recent Staff */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="font-semibold mb-3">Recent Staff</h3>
        {recentStaff.length === 0 ? (
          <p className="text-gray-500 text-sm">No staff members found.</p>
        ) : (
          <div className="space-y-2">
            {recentStaff.map((staff) => (
              <div key={staff.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{staff.full_name}</div>
                  <div className="text-sm text-gray-500">{staff.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {staff.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{staff.role}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Classes */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3">Today's Classes</h3>
        {todayClasses.length === 0 ? (
          <p className="text-gray-500 text-sm">No classes scheduled today</p>
        ) : (
          <div className="space-y-2">
            {todayClasses.map((cls) => (
              <div key={cls.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{cls.class?.name || 'Class'}</div>
                  <div className="text-sm text-gray-500">
                    {cls.teacher?.full_name || 'No teacher'} · {cls.room?.name || 'No room'}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(cls.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link href="/dashboard/classes/calendar">
            <button className="text-blue-600 hover:text-blue-800 text-sm">
              View Full Calendar →
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}