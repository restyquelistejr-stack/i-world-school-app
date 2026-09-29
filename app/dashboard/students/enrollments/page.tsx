// app/dashboard/students/enrollments/page.tsx
// ⭐ Student's own enrollment view — supports self-view AND admin-view (?studentId=)
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

// ==========================================
// TYPES
// ==========================================
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
export default function StudentEnrollmentsPage() {
  const searchParams = useSearchParams();
  const viewingStudentId = searchParams.get('studentId'); // ⭐ Admin mode if present

  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('Loading...');
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);

  useEffect(() => {
    loadStudentData();
  }, [viewingStudentId]);

  async function loadStudentData() {
    setLoading(true);
    setError(null);

    try {
      let studentId: string | null = null;

      if (viewingStudentId) {
        // ⭐ ADMIN MODE: Admin viewing another student
        setIsAdminView(true);
        studentId = viewingStudentId;
      } else {
        // ⭐ SELF MODE: Logged-in student viewing own
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStudentName('Not Logged In');
          setError('Please log in to view your enrollments');
          setLoading(false);
          return;
        }
        setIsAdminView(false);
        studentId = user.id;
      }

      setTargetId(studentId);

      // Get student name
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', studentId)
        .single();
      setStudentName(userData?.full_name || 'Student');

      // ==========================================
      // 1. Load PRIVATE class enrollments
      // ==========================================
      const { data: privateEnrollments } = await supabase
        .from('class_enrollments')
        .select(`
          id,
          status,
          class_id,
          classes:class_id (
            id,
            class_code,
            course:course_id (id, name),
            module:module_id (id, title, level),
            teacher:teacher_id (id, full_name),
            room:room_id (id, name)
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active');

      const privateClassIds = (privateEnrollments || [])
        .map((e: any) => e.class_id)
        .filter(Boolean);

      let bookingsByClass: Record<string, { start_time: string; end_time: string }> = {};
      if (privateClassIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('class_id, start_time, end_time')
          .in('class_id', privateClassIds)
          .order('start_time', { ascending: true });

        (bookingsData || []).forEach((b: any) => {
          if (!bookingsByClass[b.class_id]) {
            bookingsByClass[b.class_id] = {
              start_time: b.start_time,
              end_time: b.end_time,
            };
          }
        });
      }

      // ==========================================
      // 2. Load GROUP class enrollments
      // ==========================================
      const { data: groupEnrollments } = await supabase
        .from('group_class_enrollments')
        .select(`
          id,
          status,
          group_class_id,
          scheduled_group_classes:group_class_id (
            id,
            class_name,
            start_date,
            end_date,
            start_time,
            end_time,
            schedule_days,
            course:course_id (id, name),
            module:module_id (id, title, level),
            room:room_id (id, name),
            teacher_ids
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active');

      // Resolve teacher names
      const allTeacherIds = new Set<string>();
      (groupEnrollments || []).forEach((e: any) => {
        const gc = Array.isArray(e.scheduled_group_classes)
          ? e.scheduled_group_classes[0]
          : e.scheduled_group_classes;
        (gc?.teacher_ids || []).forEach((tid: string) => allTeacherIds.add(tid));
      });

      let teacherMap: Record<string, string> = {};
      if (allTeacherIds.size > 0) {
        const { data: teachersData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', Array.from(allTeacherIds));
        (teachersData || []).forEach((t: any) => { teacherMap[t.id] = t.full_name; });
      }

      // ==========================================
      // 3. Build unified list
      // ==========================================
      const items: EnrollmentItem[] = [];

      (privateEnrollments || []).forEach((e: any) => {
        const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
        if (!cls) return;

        const course = Array.isArray(cls.course) ? cls.course[0] : cls.course;
        const module = Array.isArray(cls.module) ? cls.module[0] : cls.module;
        const teacher = Array.isArray(cls.teacher) ? cls.teacher[0] : cls.teacher;
        const room = Array.isArray(cls.room) ? cls.room[0] : cls.room;
        const booking = bookingsByClass[cls.id];

        items.push({
          id: e.id,
          type: 'private',
          class_id: cls.id,
          class_code: cls.class_code,
          class_name: null,
          course_name: course?.name || 'Unknown Course',
          module_name: module?.title || null,
          teacher_name: teacher?.full_name || null,
          room_name: room?.name || null,
          level: module?.level || null,
          status: e.status,
          start_time: booking?.start_time || null,
          end_time: booking?.end_time || null,
          view_link: `/dashboard/classes/details?id=${cls.id}`,
        });
      });

      (groupEnrollments || []).forEach((e: any) => {
        const gc = Array.isArray(e.scheduled_group_classes)
          ? e.scheduled_group_classes[0]
          : e.scheduled_group_classes;
        if (!gc) return;

        const course = Array.isArray(gc.course) ? gc.course[0] : gc.course;
        const module = Array.isArray(gc.module) ? gc.module[0] : gc.module;
        const room = Array.isArray(gc.room) ? gc.room[0] : gc.room;

        const teacherNames = (gc.teacher_ids || [])
          .map((tid: string) => teacherMap[tid])
          .filter(Boolean);
        const teacherDisplay =
          teacherNames.length === 0 ? null :
          teacherNames.length === 1 ? teacherNames[0] :
          `${teacherNames[0]} + ${teacherNames.length - 1}`;

        items.push({
          id: e.id,
          type: 'group',
          class_id: gc.id,
          class_code: null,
          class_name: gc.class_name,
          course_name: course?.name || 'Unknown Course',
          module_name: module?.title || null,
          teacher_name: teacherDisplay,
          room_name: room?.name || null,
          level: module?.level || null,
          status: e.status,
          group_start_date: gc.start_date,
          group_end_date: gc.end_date,
          group_start_time: gc.start_time,
          group_end_time: gc.end_time,
          schedule_days: gc.schedule_days,
          view_link: `/dashboard/classes/group-class/view?id=${gc.id}`,
        });
      });

      setEnrollments(items);
    } catch (err: any) {
      console.error('Error loading student data:', err);
      setError('Failed to load enrollments. Please try again.');
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb for admin view */}
      {isAdminView && targetId && (
        <div className="mb-4">
          <Link href={`/dashboard/students/view?id=${targetId}`}>
            <button className="text-gray-600 hover:text-gray-900 text-sm">
              ← Back to {studentName}'s Profile
            </button>
          </Link>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdminView ? `📚 ${studentName}'s Enrollments` : '📚 My Enrollments'}
        </h1>
        {!isAdminView && (
          <p className="text-sm text-gray-500">
            Welcome, <span className="font-medium text-gray-800">{studentName}</span>
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {enrollments.length} class{enrollments.length !== 1 ? 'es' : ''} enrolled
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center border border-gray-200">
          <p className="text-gray-500">
            {isAdminView
              ? `${studentName} is not enrolled in any active classes yet.`
              : 'You are not enrolled in any active classes yet.'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {isAdminView
              ? 'Enroll them from a class detail page.'
              : 'Contact your administrator to enroll in classes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {enrollments.map((e) => (
            <div
              key={`${e.type}-${e.id}`}
              className={`bg-white rounded-lg shadow border p-4 hover:shadow-md transition ${
                e.type === 'group' ? 'border-rose-200' : 'border-emerald-200'
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
                      <span className="font-semibold text-gray-800">{e.class_name}</span>
                    )}
                  </div>

                  <div className="font-bold text-lg text-gray-900">{e.course_name}</div>

                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    {e.teacher_name && <span>🧑‍🏫 {e.teacher_name}</span>}
                    {e.room_name && <span>📍 {e.room_name}</span>}
                    {e.type === 'group' && e.schedule_days && e.schedule_days.length > 0 && (
                      <span>📅 {e.schedule_days.map(d => DAY_LABELS[d]).join(', ')}</span>
                    )}
                  </div>

                  <div className="mt-2 text-sm text-gray-500">
                    {e.type === 'private' && e.start_time && e.end_time && (
                      <span>
                        🗓️ {format(parseISO(e.start_time), 'MMM d, yyyy')} •{' '}
                        {format(parseISO(e.start_time), 'h:mm a')} – {format(parseISO(e.end_time), 'h:mm a')}
                      </span>
                    )}
                    {e.type === 'group' && e.group_start_date && e.group_end_date && (
                      <span>
                        🗓️ {format(parseISO(e.group_start_date), 'MMM d, yyyy')} –{' '}
                        {format(parseISO(e.group_end_date), 'MMM d, yyyy')}
                        {e.group_start_time && e.group_end_time && (
                          <span className="ml-2">
                            🕐 {e.group_start_time.slice(0, 5)} – {e.group_end_time.slice(0, 5)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 ml-2">
                  <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium whitespace-nowrap">
                    {e.status}
                  </span>
                  <Link href={e.view_link}>
                    <button className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
                      View Class →
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}