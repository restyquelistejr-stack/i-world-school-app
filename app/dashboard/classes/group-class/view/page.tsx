// app/dashboard/classes/group-class/view/page.tsx
// ⭐ v3.8: Shows substitute teacher + flagged sessions
// ⭐ v3.9: Teacher contact info visible
// ⭐ v3.14b: Attendance marking per session + withdrawal attendance flip
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import EnrollStudentsModal from '@/components/EnrollStudentsModal';
import TeacherContactInfo from '@/components/TeacherContactInfo';
import SessionRosterModal from '@/components/SessionRosterModal';
import { onStudentWithdrawnFromGroup } from '@/lib/attendanceService';

interface GroupClass {
  id: string;
  class_name: string;
  course_id: string;
  module_id: string;
  teacher_ids: string[];
  room_id: string;
  total_sessions: number;
  start_date: string;
  end_date: string;
  schedule_days: number[];
  start_time: string;
  end_time: string;
  cycle: string;
  max_students: number;
  current_students: number;
  status: string;
  created_at: string;
}

interface Session {
  id: string;
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  status: string;
  teacher_id: string | null;
  substitute_teacher_id: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  room?: { name: string };
  teacher_name?: string;
  substitute_teacher_name?: string | null;
}

interface Student {
  id: string;
  full_name: string;
  email: string;
  enrollment_status: string;
}

interface TeacherContact {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  teacher_type?: string | null;
}

export default function GroupClassViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupClassId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [groupClass, setGroupClass] = useState<GroupClass | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courseName, setCourseName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [teachers, setTeachers] = useState<TeacherContact[]>([]);
  const [roomName, setRoomName] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // ⭐ v3.14b: attendance modal state
  const [rosterSession, setRosterSession] = useState<Session | null>(null);

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    if (groupClassId) {
      loadData();
    } else {
      setNotFound(true);
      setLoading(false);
    }
  }, [groupClassId]);

  async function loadData() {
    setLoading(true);

    try {
      const { data: gc, error: gcError } = await supabase
        .from('scheduled_group_classes')
        .select('*')
        .eq('id', groupClassId)
        .single();

      if (gcError || !gc) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setGroupClass(gc);

      const { data: course } = await supabase
        .from('courses')
        .select('name')
        .eq('id', gc.course_id)
        .single();
      if (course) setCourseName(course.name);

      const { data: module } = await supabase
        .from('course_modules')
        .select('title')
        .eq('id', gc.module_id)
        .single();
      if (module) setModuleName(module.title);

      if (gc.teacher_ids && gc.teacher_ids.length > 0) {
        const [usersRes, profilesRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, full_name, email, phone')
            .in('id', gc.teacher_ids),
          supabase
            .from('teachers')
            .select('id, teacher_type')
            .in('id', gc.teacher_ids),
        ]);

        const profileMap: Record<string, any> = {};
        (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });

        const enriched: TeacherContact[] = (usersRes.data || []).map((u: any) => ({
          ...u,
          teacher_type: profileMap[u.id]?.teacher_type || null,
        }));

        setTeachers(enriched);
      }

      if (gc.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', gc.room_id)
          .single();
        if (room) setRoomName(room.name);
      }

      const { data: sessionData } = await supabase
        .from('group_class_sessions')
        .select(`
          id,
          session_number,
          session_date,
          start_time,
          end_time,
          room_id,
          status,
          teacher_id,
          substitute_teacher_id,
          needs_attention,
          attention_reason,
          room:room_id (name)
        `)
        .eq('group_class_id', groupClassId)
        .order('session_number');

      if (sessionData) {
        const allTeacherIds = new Set<string>();
        for (const s of sessionData as any[]) {
          if (s.teacher_id) allTeacherIds.add(s.teacher_id);
          if (s.substitute_teacher_id) allTeacherIds.add(s.substitute_teacher_id);
        }

        const { data: teacherLookup } = allTeacherIds.size > 0
          ? await supabase.from('users').select('id, full_name').in('id', [...allTeacherIds])
          : { data: [] as any[] };

        const teacherNameMap: Record<string, string> = {};
        (teacherLookup || []).forEach((t: any) => { teacherNameMap[t.id] = t.full_name; });

        const enrichedSessions: Session[] = (sessionData as any[]).map((s) => ({
          ...s,
          teacher_name: s.teacher_id ? teacherNameMap[s.teacher_id] || 'Unknown' : undefined,
          substitute_teacher_name: s.substitute_teacher_id
            ? teacherNameMap[s.substitute_teacher_id] || 'Substitute'
            : null,
        }));

        setSessions(enrichedSessions);
      }

      const { data: enrollRows } = await supabase
        .from('group_class_enrollments')
        .select('id, student_id, status')
        .eq('group_class_id', groupClassId)
        .eq('status', 'active');

      if (enrollRows && enrollRows.length > 0) {
        const studentIds = enrollRows.map(e => e.student_id).filter(Boolean);

        const { data: studentUsers } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', studentIds);

        const studentMap = Object.fromEntries((studentUsers || []).map((u: any) => [u.id, u]));

        setStudents(
          enrollRows.map((e: any) => ({
            id: e.student_id,
            full_name: studentMap[e.student_id]?.full_name || 'Unknown',
            email: studentMap[e.student_id]?.email || '',
            enrollment_status: e.status,
          }))
        );
      } else {
        setStudents([]);
      }

    } catch (err) {
      console.error('Error loading data:', err);
      setNotFound(true);
    }

    setLoading(false);
  }

  async function updateStatus(newStatus: string) {
    if (!groupClass) return;
    if (!confirm(`Change status to "${newStatus}"?`)) return;

    const { error } = await supabase
      .from('scheduled_group_classes')
      .update({ status: newStatus })
      .eq('id', groupClassId);

    if (error) {
      alert('Error updating status: ' + error.message);
    } else {
      loadData();
    }
  }

  async function unenrollStudent(studentId: string) {
    if (!confirm('Remove this student from the group class?')) return;

    const { error } = await supabase
      .from('group_class_enrollments')
      .delete()
      .eq('group_class_id', groupClassId)
      .eq('student_id', studentId);

    if (error) {
      alert('Error removing student: ' + error.message);
    } else {
      // ⭐ v3.14b: flip future attendance to not_expected
      if (groupClassId) {
        await onStudentWithdrawnFromGroup(groupClassId, studentId);
      }

      await supabase
        .from('scheduled_group_classes')
        .update({ current_students: Math.max(0, (groupClass?.current_students || 0) - 1) })
        .eq('id', groupClassId);

      loadData();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notFound || !groupClass) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/classes/management">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Group Class Not Found</h2>
          <p className="text-yellow-700">The group class you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    pending_admin: 'bg-purple-100 text-purple-800',
    pending_teacher: 'bg-orange-100 text-orange-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-teal-100 text-teal-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    pending_admin: 'Pending Admin',
    pending_teacher: 'Pending Teacher',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const substitutedCount = sessions.filter(s => !!s.substitute_teacher_id).length;
  const flaggedCount = sessions.filter(
    s => s.needs_attention && s.attention_reason !== 'room_unassigned'
  ).length;
  const roomFlaggedCount = sessions.filter(
    s => s.needs_attention && s.attention_reason === 'room_unassigned'
  ).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/dashboard/classes/management" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
            ← Back to Management
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            👥 {groupClass.class_name || 'Group Class'}
          </h1>
        </div>
        <button
          onClick={() => setShowEnrollModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          ➕ Enroll Students
        </button>
      </div>

      {(substitutedCount > 0 || flaggedCount > 0 || roomFlaggedCount > 0) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {substitutedCount > 0 && (
            <span className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-full text-xs font-medium">
              🔄 {substitutedCount} session{substitutedCount !== 1 ? 's' : ''} substituted
            </span>
          )}
          {flaggedCount > 0 && (
            <Link href="/dashboard/substitutes/needed">
              <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded-full text-xs font-medium hover:bg-amber-200 transition cursor-pointer">
                ⚠️ {flaggedCount} session{flaggedCount !== 1 ? 's' : ''} need substitutes →
              </span>
            </Link>
          )}
          {roomFlaggedCount > 0 && (
            <Link href="/dashboard/classes/rooms/needed">
              <span className="px-3 py-1 bg-orange-100 border border-orange-300 text-orange-800 rounded-full text-xs font-medium hover:bg-orange-200 transition cursor-pointer">
                🏫 {roomFlaggedCount} session{roomFlaggedCount !== 1 ? 's' : ''} need rooms →
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[groupClass.status]}`}>{statusLabels[groupClass.status]}</span></div>
          <div><span className="text-gray-500">Cycle:</span> <span className="font-medium">{groupClass.cycle}</span></div>
          <div><span className="text-gray-500">Course:</span> <span className="font-medium">{courseName}</span></div>
          <div><span className="text-gray-500">Module:</span> <span className="font-medium">{moduleName}</span></div>
          <div><span className="text-gray-500">Room:</span> <span className="font-medium">{roomName}</span></div>
          <div>
            <span className="text-gray-500">Students:</span>{' '}
            <span className={`font-medium ${
              groupClass.current_students >= groupClass.max_students ? 'text-red-600' : ''
            }`}>
              {groupClass.current_students}/{groupClass.max_students}
            </span>
            {groupClass.current_students >= groupClass.max_students && (
              <span className="ml-1 text-xs text-red-600">(full)</span>
            )}
          </div>
          <div><span className="text-gray-500">Total Sessions:</span> <span className="font-medium">{groupClass.total_sessions}</span></div>
          <div><span className="text-gray-500">Schedule:</span> <span className="font-medium">
            {groupClass.schedule_days?.map(d => daysOfWeek[d]).join(', ')}
          </span></div>
          <div><span className="text-gray-500">Time:</span> <span className="font-medium">{groupClass.start_time} - {groupClass.end_time}</span></div>
          <div><span className="text-gray-500">Start Date:</span> <span className="font-medium">{format(parseISO(groupClass.start_date), 'MMM d, yyyy')}</span></div>
          <div><span className="text-gray-500">End Date:</span> <span className="font-medium">{format(parseISO(groupClass.end_date), 'MMM d, yyyy')}</span></div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-semibold text-gray-700 mb-2">👨‍🏫 Teachers</h3>
          <div className="space-y-2">
            {teachers.length === 0 ? (
              <span className="text-gray-500 text-sm">No teachers assigned</span>
            ) : (
              teachers.map(t => (
                <div key={t.id} className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <TeacherContactInfo
                    fullName={t.full_name}
                    phone={t.phone}
                    email={t.email}
                    teacherType={t.teacher_type}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sessions — v3.14b: Attendance column */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
        <h3 className="font-bold text-gray-800 mb-4">📅 Sessions ({sessions.length})</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sessions.map((session) => {
                const hasSubstitute = !!session.substitute_teacher_id && !!session.substitute_teacher_name;
                const isTeacherFlagged = session.needs_attention && session.attention_reason !== 'room_unassigned';
                const isRoomFlagged = session.needs_attention && session.attention_reason === 'room_unassigned';

                return (
                  <tr
                    key={session.id}
                    className={`hover:bg-gray-50 ${
                      hasSubstitute ? 'bg-emerald-50/40' : ''
                    } ${
                      (isTeacherFlagged || isRoomFlagged) ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {session.session_number}
                        {isTeacherFlagged && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
                            ⚠️
                          </span>
                        )}
                        {isRoomFlagged && (
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full">
                            🏫
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {format(parseISO(session.session_date), 'EEE, MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{session.start_time}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{session.end_time}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {session.room?.name || roomName || 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {hasSubstitute ? (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-emerald-700">
                              👨‍🏫 {session.substitute_teacher_name}
                            </span>
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-semibold">
                              🔄 SUB
                            </span>
                          </div>
                          {session.teacher_name && (
                            <span className="text-[11px] text-gray-400 line-through">
                              {session.teacher_name}
                            </span>
                          )}
                        </div>
                      ) : session.teacher_name ? (
                        <div className="flex flex-col">
                          <span className="text-gray-700">👨‍🏫 {session.teacher_name}</span>
                          {(() => {
                            const teacher = teachers.find(t => t.id === session.teacher_id);
                            return teacher?.phone ? (
                              <span className="text-[10px] text-gray-400">📞 {teacher.phone}</span>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">No teacher assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        session.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        session.status === 'ongoing' ? 'bg-yellow-100 text-yellow-800' :
                        session.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {/* ⭐ v3.14b: Attendance button */}
                      <button
                        onClick={() => setRosterSession(session)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                      >
                        📋 Attendance
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Students */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
        <h3 className="font-bold text-gray-800 mb-4">
          👨‍🎓 Enrolled Students ({students.length})
          {groupClass.max_students > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              capacity: {groupClass.current_students}/{groupClass.max_students}
            </span>
          )}
        </h3>
        {students.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No students enrolled yet. Click <strong>Enroll Students</strong> above.
          </p>
        ) : (
          <div className="space-y-2">
            {students.map((student) => (
              <div key={student.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <span className="font-medium text-gray-800">{student.full_name}</span>
                  <span className="ml-4 text-sm text-gray-500">{student.email}</span>
                  <span className={`ml-4 text-xs px-2 py-0.5 rounded-full ${
                    student.enrollment_status === 'active' ? 'bg-green-100 text-green-700' :
                    student.enrollment_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {student.enrollment_status}
                  </span>
                </div>
                <button
                  onClick={() => unenrollStudent(student.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  ✕ Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Actions */}
      <div className="flex flex-wrap gap-3 mt-6">
        {groupClass.status === 'draft' && (
          <button onClick={() => updateStatus('pending_admin')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Submit for Admin Approval
          </button>
        )}
        {groupClass.status === 'pending_admin' && (
          <>
            <button onClick={() => updateStatus('pending_teacher')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Admin Approved → Notify Teachers
            </button>
            <button onClick={() => updateStatus('cancelled')} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              Reject
            </button>
          </>
        )}
        {groupClass.status === 'pending_teacher' && (
          <>
            <button onClick={() => updateStatus('active')} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Teacher Confirmed → Activate
            </button>
            <button onClick={() => updateStatus('cancelled')} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              Cancel
            </button>
          </>
        )}
        {groupClass.status === 'active' && (
          <button onClick={() => updateStatus('completed')} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">
            Mark as Completed
          </button>
        )}
        {groupClass.status === 'cancelled' && (
          <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded border border-red-200">
            ❌ Class has been cancelled
          </div>
        )}
        {groupClass.status === 'completed' && (
          <div className="text-sm text-teal-600 bg-teal-50 px-4 py-2 rounded border border-teal-200">
            ✅ Class has been completed
          </div>
        )}
      </div>

      <EnrollStudentsModal
        isOpen={showEnrollModal}
        onClose={() => setShowEnrollModal(false)}
        onSuccess={loadData}
        classContext={{
          type: 'group',
          classId: groupClass.id,
          className: groupClass.class_name,
          courseName: courseName,
          maxStudents: groupClass.max_students,
          currentStudents: groupClass.current_students,
        }}
        defaultTab="existing"
      />

      {/* ⭐ v3.14b: Attendance modal */}
      {rosterSession && (
        <SessionRosterModal
          isOpen={!!rosterSession}
          sessionType="group_session"
          sessionId={rosterSession.id}
          sessionLabel={`Session #${rosterSession.session_number} · ${format(parseISO(rosterSession.session_date), 'EEE, MMM d')} · ${rosterSession.start_time.slice(0,5)}–${rosterSession.end_time.slice(0,5)}`}
          onClose={() => setRosterSession(null)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}