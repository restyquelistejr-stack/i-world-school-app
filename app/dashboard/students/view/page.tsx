// app/dashboard/students/view/page.tsx
// ⭐ FIXED: Split queries — no nested join dependency
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';

// ==========================================
// TYPES
// ==========================================
interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  gender?: string;
  date_of_birth?: string;
  nationality?: string;
  address?: string;
  educational_background?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  created_at?: string;
}

interface EnrollmentItem {
  id: string;
  type: 'private' | 'group';
  class_id: string | null;
  class_code: string | null;
  class_name: string | null;
  course_name: string;
  module_name: string | null;
  teacher_name: string | null;
  room_name: string | null;
  level: string | null;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  group_start_date?: string | null;
  group_end_date?: string | null;
  group_start_time?: string | null;
  group_end_time?: string | null;
  schedule_days?: number[] | null;
  view_link: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function StudentViewPage() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'private' | 'group'>('all');

  useEffect(() => {
    if (studentId) {
      loadStudentDetails();
    } else {
      setError('No student selected');
      setLoading(false);
    }
  }, [studentId]);

  // ==========================================
  // LOAD DATA — SPLIT QUERIES (NO NESTED JOINS)
  // ==========================================
  async function loadStudentDetails() {
    if (!studentId) return;
    setLoading(true);
    setError(null);

    try {
      // ------------------------------------------
      // 1. Load student profile
      // ------------------------------------------
      const { data: studentData, error: studentError } = await supabase
        .from('users')
        .select('*')
        .eq('id', studentId)
        .single();

      if (studentError || !studentData) {
        setError('Student not found');
        setLoading(false);
        return;
      }

      setStudent(studentData);

      const items: EnrollmentItem[] = [];

      // ------------------------------------------
      // 2. Load PRIVATE class enrollments (STEP 1: raw enrollment rows)
      // ------------------------------------------
      const { data: privateEnrollRows } = await supabase
        .from('class_enrollments')
        .select('id, class_id, student_id, status')
        .eq('student_id', studentId)
        .eq('status', 'active');

      if (privateEnrollRows && privateEnrollRows.length > 0) {
        const classIds = privateEnrollRows.map(e => e.class_id).filter(Boolean) as string[];

        // STEP 2: fetch classes
        const { data: classesData } = await supabase
          .from('classes')
          .select('id, class_code, class_type, status, course_id, module_id, teacher_id, room_id')
          .in('id', classIds);

        // STEP 3: fetch lookup data in parallel
        const courseIds = Array.from(new Set((classesData || []).map(c => c.course_id).filter(Boolean)));
        const moduleIds = Array.from(new Set((classesData || []).map(c => c.module_id).filter(Boolean)));
        const teacherIds = Array.from(new Set((classesData || []).map(c => c.teacher_id).filter(Boolean)));
        const roomIds = Array.from(new Set((classesData || []).map(c => c.room_id).filter(Boolean)));

        const [coursesRes, modulesRes, teachersRes, roomsRes, bookingsRes] = await Promise.all([
          courseIds.length > 0
            ? supabase.from('courses').select('id, name').in('id', courseIds)
            : Promise.resolve({ data: [] }),
          moduleIds.length > 0
            ? supabase.from('course_modules').select('id, title, level').in('id', moduleIds)
            : Promise.resolve({ data: [] }),
          teacherIds.length > 0
            ? supabase.from('users').select('id, full_name').in('id', teacherIds)
            : Promise.resolve({ data: [] }),
          roomIds.length > 0
            ? supabase.from('rooms').select('id, name').in('id', roomIds)
            : Promise.resolve({ data: [] }),
          // Fetch earliest booking per class for schedule display
          supabase
            .from('bookings')
            .select('class_id, start_time, end_time')
            .in('class_id', classIds)
            .order('start_time', { ascending: true }),
        ]);

        const courseMap = Object.fromEntries((coursesRes.data || []).map((c: any) => [c.id, c]));
        const moduleMap = Object.fromEntries((modulesRes.data || []).map((m: any) => [m.id, m]));
        const teacherMap = Object.fromEntries((teachersRes.data || []).map((t: any) => [t.id, t]));
        const roomMap = Object.fromEntries((roomsRes.data || []).map((r: any) => [r.id, r]));

        const firstBookingByClass: Record<string, any> = {};
        (bookingsRes.data || []).forEach((b: any) => {
          if (!firstBookingByClass[b.class_id]) {
            firstBookingByClass[b.class_id] = b;
          }
        });

        // STEP 4: Build private enrollment items
        privateEnrollRows.forEach((enroll: any) => {
          const cls = (classesData || []).find(c => c.id === enroll.class_id);
          if (!cls) return;

          const course = courseMap[cls.course_id];
          const module = moduleMap[cls.module_id];
          const teacher = teacherMap[cls.teacher_id];
          const room = roomMap[cls.room_id];
          const booking = firstBookingByClass[cls.id];

          items.push({
            id: enroll.id,
            type: 'private',
            class_id: cls.id,
            class_code: cls.class_code,
            class_name: null,
            course_name: course?.name || 'Unknown Course',
            module_name: module?.title || null,
            teacher_name: teacher?.full_name || null,
            room_name: room?.name || null,
            level: module?.level || null,
            status: enroll.status,
            start_time: booking?.start_time || null,
            end_time: booking?.end_time || null,
            view_link: `/dashboard/classes/details?id=${cls.id}`,
          });
        });
      }

      // ------------------------------------------
      // 3. Load GROUP class enrollments (same pattern)
      // ------------------------------------------
      const { data: groupEnrollRows } = await supabase
        .from('group_class_enrollments')
        .select('id, group_class_id, student_id, status, enrollment_date')
        .eq('student_id', studentId)
        .eq('status', 'active');

      if (groupEnrollRows && groupEnrollRows.length > 0) {
        const gcIds = groupEnrollRows.map(e => e.group_class_id).filter(Boolean) as string[];

        const { data: groupClassesData } = await supabase
          .from('scheduled_group_classes')
          .select('id, class_name, status, start_date, end_date, start_time, end_time, schedule_days, course_id, module_id, room_id, teacher_ids')
          .in('id', gcIds);

        const gcCourseIds = Array.from(new Set((groupClassesData || []).map(c => c.course_id).filter(Boolean)));
        const gcModuleIds = Array.from(new Set((groupClassesData || []).map(c => c.module_id).filter(Boolean)));
        const gcRoomIds = Array.from(new Set((groupClassesData || []).map(c => c.room_id).filter(Boolean)));

        const allTeacherIds = new Set<string>();
        (groupClassesData || []).forEach((gc: any) => {
          (gc.teacher_ids || []).forEach((tid: string) => allTeacherIds.add(tid));
        });

        const [gcCoursesRes, gcModulesRes, gcRoomsRes, gcTeachersRes] = await Promise.all([
          gcCourseIds.length > 0
            ? supabase.from('courses').select('id, name').in('id', gcCourseIds)
            : Promise.resolve({ data: [] }),
          gcModuleIds.length > 0
            ? supabase.from('course_modules').select('id, title, level').in('id', gcModuleIds)
            : Promise.resolve({ data: [] }),
          gcRoomIds.length > 0
            ? supabase.from('rooms').select('id, name').in('id', gcRoomIds)
            : Promise.resolve({ data: [] }),
          allTeacherIds.size > 0
            ? supabase.from('users').select('id, full_name').in('id', Array.from(allTeacherIds))
            : Promise.resolve({ data: [] }),
        ]);

        const gcCourseMap = Object.fromEntries((gcCoursesRes.data || []).map((c: any) => [c.id, c]));
        const gcModuleMap = Object.fromEntries((gcModulesRes.data || []).map((m: any) => [m.id, m]));
        const gcRoomMap = Object.fromEntries((gcRoomsRes.data || []).map((r: any) => [r.id, r]));
        const gcTeacherMap = Object.fromEntries((gcTeachersRes.data || []).map((t: any) => [t.id, t]));

        groupEnrollRows.forEach((enroll: any) => {
          const gc = (groupClassesData || []).find(c => c.id === enroll.group_class_id);
          if (!gc) return;

          const course = gcCourseMap[gc.course_id];
          const module = gcModuleMap[gc.module_id];
          const room = gcRoomMap[gc.room_id];

          const teacherNames = (gc.teacher_ids || [])
            .map((tid: string) => gcTeacherMap[tid]?.full_name)
            .filter(Boolean);
          const teacherDisplay =
            teacherNames.length === 0 ? null :
            teacherNames.length === 1 ? teacherNames[0] :
            `${teacherNames[0]} + ${teacherNames.length - 1}`;

          items.push({
            id: enroll.id,
            type: 'group',
            class_id: gc.id,
            class_code: null,
            class_name: gc.class_name,
            course_name: course?.name || 'Unknown Course',
            module_name: module?.title || null,
            teacher_name: teacherDisplay,
            room_name: room?.name || null,
            level: module?.level || null,
            status: enroll.status,
            group_start_date: gc.start_date,
            group_end_date: gc.end_date,
            group_start_time: gc.start_time,
            group_end_time: gc.end_time,
            schedule_days: gc.schedule_days,
            view_link: `/dashboard/classes/group-class/view?id=${gc.id}`,
          });
        });
      }

      // ------------------------------------------
      // 4. Sort and set
      // ------------------------------------------
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
        return 0;
      });

      setEnrollments(items);
    } catch (err: any) {
      console.error('Error loading student:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/dashboard/students/directory">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Directory</button>
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700">{error || 'Student not found'}</p>
        </div>
      </div>
    );
  }

  const filteredEnrollments = enrollments.filter(e => {
    if (activeTab === 'all') return true;
    return e.type === activeTab;
  });

  const counts = {
    all: enrollments.length,
    private: enrollments.filter(e => e.type === 'private').length,
    group: enrollments.filter(e => e.type === 'group').length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/students/directory">
          <button className="text-gray-600 hover:text-gray-900">← Back to Directory</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">👤 {student.full_name}</h1>
      </div>

      {/* Profile Card */}
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Profile Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block text-xs uppercase tracking-wider">Email</span>
            <span className="font-medium">{student.email}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs uppercase tracking-wider">Phone</span>
            <span className="font-medium">{student.phone || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs uppercase tracking-wider">Role</span>
            <span className="font-medium capitalize">{student.role}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs uppercase tracking-wider">Status</span>
            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
              student.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {student.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {student.gender && (
            <div>
              <span className="text-gray-500 block text-xs uppercase tracking-wider">Gender</span>
              <span className="font-medium">{student.gender}</span>
            </div>
          )}
          {student.date_of_birth && (
            <div>
              <span className="text-gray-500 block text-xs uppercase tracking-wider">Date of Birth</span>
              <span className="font-medium">{format(parseISO(student.date_of_birth), 'MMMM d, yyyy')}</span>
            </div>
          )}
          {student.nationality && (
            <div>
              <span className="text-gray-500 block text-xs uppercase tracking-wider">Nationality</span>
              <span className="font-medium">{student.nationality}</span>
            </div>
          )}
          {student.educational_background && (
            <div>
              <span className="text-gray-500 block text-xs uppercase tracking-wider">Education</span>
              <span className="font-medium">{student.educational_background}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5 pt-5 border-t border-gray-100">
          <Link href={`/dashboard/students/registration?student=${student.id}`}>
            <button className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
              ✏️ Edit Profile
            </button>
          </Link>
          <Link href={`/dashboard/students/enrollments?studentId=${student.id}`}>
            <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              📚 Manage Enrollments
            </button>
          </Link>
        </div>
      </div>

      {/* Enrollments Card */}
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">📚 Enrolled Classes</h2>
          <span className="text-sm text-gray-500">
            {counts.all} total ({counts.private} private, {counts.group} group)
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              activeTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setActiveTab('private')}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              activeTab === 'private' ? 'bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            📚 Private ({counts.private})
          </button>
          <button
            onClick={() => setActiveTab('group')}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              activeTab === 'group' ? 'bg-rose-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            👥 Group ({counts.group})
          </button>
        </div>

        {filteredEnrollments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {activeTab === 'all'
                ? 'This student is not enrolled in any active classes.'
                : `No ${activeTab} class enrollments.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEnrollments.map((e) => (
              <div
                key={`${e.type}-${e.id}`}
                className={`p-4 rounded-lg border transition hover:shadow-sm ${
                  e.type === 'group'
                    ? 'border-rose-200 bg-rose-50/30'
                    : 'border-emerald-200 bg-emerald-50/30'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        e.type === 'group'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {e.type === 'group' ? '👥 Group' : '📚 Private'}
                      </span>
                      {e.class_code && (
                        <span className="font-mono text-xs text-gray-500">{e.class_code}</span>
                      )}
                      {e.class_name && e.type === 'group' && (
                        <span className="font-medium text-gray-800">{e.class_name}</span>
                      )}
                    </div>

                    <div className="text-base font-semibold text-gray-900">
                      {e.course_name}
                    </div>
                    {e.module_name && (
                      <div className="text-sm text-gray-600 mt-0.5">
                        📖 {e.module_name}
                        {e.level && <span className="ml-2 text-xs text-gray-400">({e.level})</span>}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm text-gray-600">
                      {e.teacher_name && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">👨‍🏫</span>
                          <span>{e.teacher_name}</span>
                        </div>
                      )}
                      {e.room_name && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">🏠</span>
                          <span>{e.room_name}</span>
                        </div>
                      )}
                      {e.type === 'group' && e.schedule_days && e.schedule_days.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">📅</span>
                          <span>{e.schedule_days.map(d => DAY_LABELS[d]).join(', ')}</span>
                        </div>
                      )}
                    </div>

                    {e.type === 'private' && e.start_time && e.end_time && (
                      <div className="text-xs text-gray-500 mt-2">
                        🗓️ First session: {format(parseISO(e.start_time), 'MMM d, yyyy')} • {format(parseISO(e.start_time), 'h:mm a')} – {format(parseISO(e.end_time), 'h:mm a')}
                      </div>
                    )}
                    {e.type === 'group' && e.group_start_date && e.group_end_date && (
                      <div className="text-xs text-gray-500 mt-2">
                        🗓️ {format(parseISO(e.group_start_date), 'MMM d, yyyy')} – {format(parseISO(e.group_end_date), 'MMM d, yyyy')}
                        {e.group_start_time && e.group_end_time && (
                          <span className="ml-2">
                            🕐 {e.group_start_time.slice(0, 5)} – {e.group_end_time.slice(0, 5)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex flex-col gap-2 items-end shrink-0">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      e.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {e.status}
                    </span>
                    <Link href={e.view_link}>
                      <button className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
                        {e.type === 'group' ? '👥 View Class' : '📖 View Class'}
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}