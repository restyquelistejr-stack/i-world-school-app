'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, startOfDay } from 'date-fns';

interface Course {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  full_name: string;
}

interface Room {
  id: string;
  name: string;
}

interface ClassRecord {
  id: string;
  class_code: string;
  course_id: string;
  teacher_id: string | null;
  room_id: string | null;
  max_students: number;
  total_sessions: number;
  status: string;
  created_at: string;
  course?: Course;
  teacher?: Teacher;
  room?: Room;
  level?: string;
  start_date?: string;
  end_date?: string;
  enrolled_count?: number;
}

interface Booking {
  id: string;
  room_id: string;
  teacher_id: string;
  course_id: string;
  student_id: string | null;
  start_time: string;
  end_time: string;
  status: string;
  room: { id: string; name: string } | null;
  teacher: { id: string; full_name: string } | null;
  course: { id: string; name: string } | null;
}

export default function ManageClasses() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBookingsManager, setShowBookingsManager] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [coursesRes, teachersRes, roomsRes] = await Promise.all([
        supabase.from('courses').select('id, name').eq('is_active', true).order('name'),
        supabase.from('users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).order('full_name'),
        supabase.from('rooms').select('id, name').eq('is_active', true).order('name'),
      ]);

      if (!coursesRes.error) setCourses(coursesRes.data || []);
      if (!teachersRes.error) setTeachers(teachersRes.data || []);
      if (!roomsRes.error) setRooms(roomsRes.data || []);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });

      if (classesError) {
        console.error("Error fetching classes:", classesError);
        setClasses([]);
      } else {
        const formatted = await Promise.all(
          (classesData || []).map(async (item: any) => {
            const enriched: ClassRecord = {
              ...item,
              course: coursesRes.data?.find(c => c.id === item.course_id),
              teacher: teachersRes.data?.find(t => t.id === item.teacher_id),
              room: roomsRes.data?.find(r => r.id === item.room_id),
              level: 'N/A',
              start_date: 'N/A',
              end_date: 'N/A',
              enrolled_count: 0
            };

            const { data: levelData } = await supabase
              .from('course_modules')
              .select('level')
              .eq('course_id', item.course_id)
              .limit(1)
              .single();
            if (levelData) enriched.level = levelData.level || 'N/A';

            const { data: optionsData } = await supabase
              .from('class_options')
              .select('start_time')
              .eq('class_id', item.id)
              .order('start_time', { ascending: true });
            
            if (optionsData && optionsData.length > 0) {
              const first = optionsData[0];
              const last = optionsData[optionsData.length - 1];
              enriched.start_date = first.start_time ? format(parseISO(first.start_time), 'MMM d, yyyy') : 'N/A';
              enriched.end_date = last.start_time ? format(parseISO(last.start_time), 'MMM d, yyyy') : 'N/A';
            }

            const { count } = await supabase
              .from('class_enrollments')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', item.id)
              .eq('status', 'active');

            enriched.enrolled_count = count || 0;
            return enriched;
          })
        );

        setClasses(formatted);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  async function loadBookings() {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`*, room:room_id ( id, name ), teacher:teacher_id ( id, full_name ), course:course_id ( id, name )`)
        .gte('start_time', startOfDay(new Date()).toISOString())
        .order('start_time', { ascending: true });

      if (error) {
        setBookings([]);
      } else {
        setBookings(data || []);
      }
    } catch (error: any) {
      console.error('Error loading bookings:', error);
    }
  }

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this scheduled booking?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) alert('Failed to delete: ' + error.message);
    else loadBookings();
  };

  async function deleteClass(id: string) {
    if (!confirm('Are you sure you want to permanently delete this class and ALL its bookings?')) return;

    try {
      const { error: bookingError } = await supabase
        .from('bookings')
        .delete()
        .eq('class_id', id);

      if (bookingError) {
        alert('Failed to delete bookings: ' + bookingError.message);
        return;
      }

      const { error: classError } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (classError) {
        alert('Failed to delete class: ' + classError.message);
        return;
      }

      alert('✅ Class and its bookings deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error deleting class: ' + error.message);
    }
  }

  function getStatusClass(status: string) {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_admin: 'bg-purple-100 text-purple-800',
      pending_student: 'bg-yellow-100 text-yellow-800',
      pending_enrollment: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-teal-100 text-teal-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">📚 Class Management</h1>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <Link href="/dashboard/classes/inquire">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
              📝 Inquire Class
            </button>
          </Link>
          <button
            onClick={() => {
              setShowBookingsManager(!showBookingsManager);
              if (!showBookingsManager) loadBookings();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm flex items-center gap-2 ${showBookingsManager ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
          >
            📅 {showBookingsManager ? 'Close Bookings' : 'Manage Bookings'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-y-auto max-h-[500px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sess</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrolled</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classes.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-500 text-sm">No classes created yet.</td></tr>
                ) : (
                  classes.map((c) => {
                    const max = c.max_students || 1;
                    const enrolled = c.enrolled_count || 0;
                    const percentage = Math.min(100, Math.round((enrolled / max) * 100));

                    return (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap font-mono text-xs font-bold text-gray-600">
                          {c.class_code || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                          {/* ✅ FINAL LINK: Using query string ?id= */}
                          <Link href={`/dashboard/classes/details?id=${c.id}`} prefetch={true} className="hover:text-blue-600 hover:underline">
                            {c.course?.name || 'N/A'}
                          </Link>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-600">
                          {c.level || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {c.start_date}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {c.end_date}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 text-center">
                          {c.total_sessions || 0}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 text-center">
                          {c.max_students || 0}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-medium text-gray-800">{enrolled}</span>
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1">
                              <div className="h-1.5 bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-400">{percentage}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusClass(c.status)}`}>
                            {c.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex justify-end gap-2">
                            {/* ✅ FINAL LINK: Using query string ?id= */}
                            <Link href={`/dashboard/classes/details?id=${c.id}`} prefetch={true}>
                              <button className="text-blue-600 hover:text-blue-800 hover:underline">View</button>
                            </Link>
                            <button onClick={() => deleteClass(c.id)} className="text-red-600 hover:text-red-800 hover:underline">Delete</button>
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

        {showBookingsManager && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">📅 Upcoming Scheduled Bookings</h2>
              <button onClick={() => loadBookings()} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">🔄 Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {bookings.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No upcoming bookings found.</td></tr>
                  ) : (
                    bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-medium text-gray-800">{b.room?.name || 'Unknown'}</td>
                        <td className="px-4 py-3">{b.course?.name || '-'}</td>
                        <td className="px-4 py-3">{b.teacher?.full_name || '-'}</td>
                        <td className="px-4 py-3">{format(parseISO(b.start_time), 'MMM d, h:mm a')}</td>
                        <td className="px-4 py-3">{format(parseISO(b.end_time), 'h:mm a')}</td>
                        <td className="px-4 py-3 flex justify-center gap-2">
                          <button onClick={async () => { if(confirm('Delete this booking?')) { await supabase.from('bookings').delete().eq('id', b.id); loadBookings(); } }} className="p-1 text-red-600 hover:bg-red-50 rounded transition" title="Delete">🗑️</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}