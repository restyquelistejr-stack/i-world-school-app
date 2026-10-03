// app/dashboard/classes/details/ClassDetailsClient.tsx
// ⭐ v3.8: Shows substitute teacher when assigned
// ⭐ v3.9: Teacher contact info visible in summary
// ⭐ v3.15: Attendance column + SessionRosterModal wired for private classes
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EnrollStudentsModal from '@/components/EnrollStudentsModal';
import TeacherContactInfo from '@/components/TeacherContactInfo';
import SessionRosterModal from '@/components/SessionRosterModal';   // ⭐ v3.15

export default function ClassDetailsClient({ classId }: { classId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [classData, setClassData] = useState<any>(null);
  const [courseName, setCourseName] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleLevel, setModuleLevel] = useState('');
  const [moduleSessions, setModuleSessions] = useState<any[]>([]);
  const [teacherName, setTeacherName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [lockedSchedules, setLockedSchedules] = useState<any[]>([]);
  const [inquiryPreferences, setInquiryPreferences] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // ⭐ v3.9: teacher contact state
  const [teacherContact, setTeacherContact] = useState<{
    full_name: string;
    email?: string;
    phone?: string;
    teacher_type?: string;
  } | null>(null);

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  // ⭐ v3.15: attendance modal state
  const [rosterBooking, setRosterBooking] = useState<{
    bookingId: string;
    label: string;
  } | null>(null);

  // ==========================================================
  // LOAD DETAILS
  // ==========================================================
  const loadDetails = async () => {
    if (!classId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      const { data: c, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (error || !c) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setClassData(c);

      const [
        courseRes,
        moduleRes,
        moduleSessionsRes,
        teacherRes,
        roomRes,
        scheduleRes,
        inquiryRes,
        bookingsRes,
      ] = await Promise.all([
        supabase.from('courses').select('name').eq('id', c.course_id).single(),
        c.module_id
          ? supabase.from('course_modules').select('title, level').eq('id', c.module_id).single()
          : Promise.resolve({ data: null }),
        c.module_id
          ? supabase.from('module_sessions').select('*').eq('module_id', c.module_id).order('session_number')
          : Promise.resolve({ data: [] }),

        // ⭐ v3.9: fetch teacher + contact info
        c.teacher_id
          ? Promise.all([
              supabase.from('users').select('full_name, email, phone').eq('id', c.teacher_id).single(),
              supabase.from('teachers').select('teacher_type').eq('id', c.teacher_id).maybeSingle(),
            ]).then(([u, p]) => ({ data: { ...u.data, teacher_type: p.data?.teacher_type || null } }))
          : Promise.resolve({ data: null }),

        c.room_id
          ? supabase.from('rooms').select('name').eq('id', c.room_id).single()
          : Promise.resolve({ data: null }),
        supabase
          .from('class_options')
          .select(`
            *,
            rooms:room_id (name),
            users:teacher_id (full_name)
          `)
          .eq('class_id', classId)
          .order('session_index'),
        supabase.from('inquiry_availability').select('*').eq('class_id', classId),
        supabase
          .from('bookings')
          .select('id, start_time, end_time, teacher_id, substitute_teacher_id, needs_attention, attention_reason')
          .eq('class_id', classId)
          .in('status', ['confirmed', 'in_progress', 'pending']),
      ]);

      if (courseRes.data) setCourseName(courseRes.data.name);
      if (moduleRes.data) {
        setModuleTitle(moduleRes.data.title);
        setModuleLevel(moduleRes.data.level || 'N/A');
      }
      if (moduleSessionsRes.data) setModuleSessions(moduleSessionsRes.data || []);

      // ⭐ v3.9: set teacher contact info
      if (teacherRes.data) {
        setTeacherName(teacherRes.data.full_name);
        setTeacherContact({
          full_name: teacherRes.data.full_name,
          email: teacherRes.data.email || undefined,
          phone: teacherRes.data.phone || undefined,
          teacher_type: teacherRes.data.teacher_type || undefined,
        });
      }

      if (roomRes.data) setRoomName(roomRes.data.name);

      // ⭐ v3.8: Build substitute map keyed by booking start_time
      // ⭐ v3.15: Also build booking map so private sessions can link to their booking row
      const bookings = bookingsRes.data || [];

      const substituteTeacherIds = [
        ...new Set(bookings.map((b: any) => b.substitute_teacher_id).filter(Boolean)),
      ];

      const { data: substituteTeachers } = substituteTeacherIds.length > 0
        ? await supabase.from('users').select('id, full_name').in('id', substituteTeacherIds)
        : { data: [] as any[] };

      const substituteTeacherMap: Record<string, string> = {};
      (substituteTeachers || []).forEach((t: any) => {
        substituteTeacherMap[t.id] = t.full_name;
      });

      const substituteByStartTime: Record<string, {
        substitute_teacher_id: string;
        substitute_teacher_name: string;
        needs_attention: boolean;
        attention_reason: string | null;
      }> = {};

      for (const b of bookings) {
        if (b.substitute_teacher_id) {
          substituteByStartTime[b.start_time] = {
            substitute_teacher_id: b.substitute_teacher_id,
            substitute_teacher_name: substituteTeacherMap[b.substitute_teacher_id] || 'Substitute',
            needs_attention: b.needs_attention || false,
            attention_reason: b.attention_reason || null,
          };
        }
      }

      // ⭐ v3.15: map bookings by start_time → booking id + teacher id
      const bookingByStartTime: Record<string, { id: string; teacher_id: string | null }> = {};
      for (const b of bookings) {
        if (b.start_time) {
          bookingByStartTime[b.start_time] = {
            id: b.id,
            teacher_id: b.teacher_id || null,
          };
        }
      }

      if (scheduleRes.data) {
        const scheduleWithDetails = scheduleRes.data.map((item: any) => {
          const subInfo = substituteByStartTime[item.start_time];
          const realBooking = bookingByStartTime[item.start_time]; // ⭐ v3.15
          return {
            ...item,
            room_name: item.rooms?.name || roomRes.data?.name || 'Not Assigned',
            teacher_name: item.users?.full_name || teacherRes.data?.full_name || 'Not Assigned',
            substitute_teacher_id: subInfo?.substitute_teacher_id || null,
            substitute_teacher_name: subInfo?.substitute_teacher_name || null,
            needs_attention: subInfo?.needs_attention || false,
            attention_reason: subInfo?.attention_reason || null,
            booking_id: realBooking?.id || null,               // ⭐ v3.15
            booking_teacher_id: realBooking?.teacher_id || null, // ⭐ v3.15
          };
        });
        setLockedSchedules(scheduleWithDetails);

        if (scheduleRes.data.length > 0) {
          const sorted = [...scheduleRes.data].sort(
            (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          );
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          if (first) setStartDate(new Date(first.start_time).toLocaleDateString());
          if (last) setEndDate(new Date(last.start_time).toLocaleDateString());
        }
      }

      if (inquiryRes.data) setInquiryPreferences(inquiryRes.data || []);

      await loadEnrolledStudents();
    } catch (err) {
      console.error('Error loading details:', err);
      setNotFound(true);
    }
    setLoading(false);
  };

  // ==========================================================
  // LOAD ENROLLED STUDENTS
  // ==========================================================
  const loadEnrolledStudents = async () => {
    const { data: enrollmentRows } = await supabase
      .from('class_enrollments')
      .select('id, student_id, status')
      .eq('class_id', classId)
      .eq('status', 'active');

    if (!enrollmentRows || enrollmentRows.length === 0) {
      setEnrolledStudents([]);
      return;
    }

    const studentIds = enrollmentRows.map((e: any) => e.student_id).filter(Boolean);

    const { data: studentUsers } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', studentIds);

    const studentMap = Object.fromEntries(
      (studentUsers || []).map((u: any) => [u.id, u])
    );

    setEnrolledStudents(
      enrollmentRows.map((e: any) => ({
        id: e.id,
        student_id: e.student_id,
        status: e.status,
        student: studentMap[e.student_id] || null,
      }))
    );
  };

  useEffect(() => {
    if (classId) loadDetails();
  }, [classId]);

  // ==========================================================
  // UNENROLL STUDENT
  // ==========================================================
  const handleUnenrollStudent = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to remove this student from the class? (The student account will NOT be deleted).')) return;

    try {
      const { error } = await supabase
        .from('class_enrollments')
        .delete()
        .eq('id', enrollmentId);

      if (error) throw error;

      alert('✅ Student removed from class successfully.');
      loadDetails();
    } catch (error: any) {
      alert('Error removing student: ' + error.message);
    }
  };

  // ==========================================================
  // STATUS HELPERS
  // ==========================================================
  const updateStatus = async (newStatus: string) => {
    if (!classData) return;

    try {
      const { error } = await supabase
        .from('classes')
        .update({ status: newStatus })
        .eq('id', classData.id);

      if (error) {
        alert('Failed to update status: ' + error.message);
        return;
      }

      router.push('/dashboard/classes/management');
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!classData) return;

    if (confirm('Delete this class and all associated data? This action cannot be undone.')) {
      try {
        await supabase.from('class_options').delete().eq('class_id', classData.id);
        await supabase.from('inquiry_availability').delete().eq('class_id', classData.id);

        const { error } = await supabase
          .from('classes')
          .delete()
          .eq('id', classData.id);

        if (error) {
          alert('Failed to delete class: ' + error.message);
          return;
        }

        router.push('/dashboard/classes/management');
      } catch (err: any) {
        alert('Error deleting class: ' + err.message);
      }
    }
  };

  // ==========================================================
  // FINALIZE
  // ==========================================================
  const handleFinalize = async () => {
    if (!classData) return;

    try {
      const { data: options, error: optionsError } = await supabase
        .from('class_options')
        .select('*')
        .eq('class_id', classData.id);

      if (optionsError) {
        alert('Failed to fetch class options: ' + optionsError.message);
        return;
      }

      if (!options || options.length === 0) {
        alert('No class options found to finalize.');
        return;
      }

      for (const opt of options) {
        const optStart = new Date(opt.start_time);
        const optEnd = new Date(opt.end_time);

        const { data: teacherConflicts, error: teacherError } = await supabase
          .from('bookings')
          .select('*')
          .eq('teacher_id', opt.teacher_id)
          .gte('start_time', new Date(optStart.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .lte('start_time', new Date(optStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
          .in('status', ['confirmed', 'in_progress', 'pending']);

        if (teacherError) {
          alert('Failed to check teacher conflicts: ' + teacherError.message);
          return;
        }

        if (teacherConflicts) {
          for (const booking of teacherConflicts) {
            const bookingStart = new Date(booking.start_time);
            const bookingEnd = new Date(booking.end_time);
            if (optStart < bookingEnd && optEnd > bookingStart) {
              alert(`Conflict detected! Teacher is already booked for ${bookingStart.toLocaleString()}`);
              return;
            }
          }
        }

        const { data: roomConflicts, error: roomError } = await supabase
          .from('bookings')
          .select('*')
          .eq('room_id', opt.room_id)
          .gte('start_time', new Date(optStart.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .lte('start_time', new Date(optStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
          .in('status', ['confirmed', 'in_progress', 'pending']);

        if (roomError) {
          alert('Failed to check room conflicts: ' + roomError.message);
          return;
        }

        if (roomConflicts) {
          for (const booking of roomConflicts) {
            const bookingStart = new Date(booking.start_time);
            const bookingEnd = new Date(booking.end_time);
            if (optStart < bookingEnd && optEnd > bookingStart) {
              alert(`Conflict detected! Room is already booked for ${bookingStart.toLocaleString()}`);
              return;
            }
          }
        }
      }

      const { error: updateError } = await supabase
        .from('classes')
        .update({ status: 'active' })
        .eq('id', classData.id);

      if (updateError) {
        alert('Failed to update class status: ' + updateError.message);
        return;
      }

      const bookingInserts = options.map((opt) => ({
        room_id: opt.room_id,
        teacher_id: opt.teacher_id,
        course_id: classData.course_id,
        start_time: opt.start_time,
        end_time: opt.end_time,
        status: 'confirmed',
        class_id: classData.id,
      }));

      const { error: bookingError } = await supabase
        .from('bookings')
        .insert(bookingInserts);

      if (bookingError) {
        console.error('Booking insert error:', bookingError);
        alert('Failed to create bookings: ' + bookingError.message);
        await supabase.from('classes').update({ status: 'pending_enrollment' }).eq('id', classData.id);
        return;
      }

      router.push('/dashboard/classes/management');
    } catch (err: any) {
      console.error('Error finalizing class:', err);
      alert('Error finalizing class: ' + err.message);
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: { [key: string]: string } = {
      draft: 'Draft',
      pending_admin: 'Pending Admin Approval',
      pending_student: 'Pending Student Approval',
      pending_enrollment: 'Pending Enrollment',
      active: 'Active',
      cancelled: 'Cancelled',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      draft: 'text-gray-600',
      pending_admin: 'text-blue-600',
      pending_student: 'text-yellow-600',
      pending_enrollment: 'text-purple-600',
      active: 'text-green-600',
      cancelled: 'text-red-600',
    };
    return colorMap[status] || 'text-gray-600';
  };

  // ==========================================================
  // RENDER
  // ==========================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/classes/management">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          <h2 className="text-xl font-bold mb-2">Class Not Found</h2>
          <p>The class you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/dashboard/classes/management"
            className="text-blue-600 hover:underline text-sm mb-2 inline-block"
          >
            ← Back to Management
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">📋 Class Details</h1>
        </div>
        <button
          onClick={() => setShowAddStudentModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2"
        >
          ➕ Add Students
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Status:</span>{' '}
            <span className={`font-bold capitalize ${getStatusColor(classData.status)}`}>
              {getStatusDisplay(classData.status)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Class Code:</span>{' '}
            <span className="font-bold">{classData.class_code || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Course:</span>{' '}
            <span className="font-medium">{courseName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Module:</span>{' '}
            <span className="font-medium">{moduleTitle || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Level:</span>{' '}
            <span className="font-medium">{moduleLevel || 'N/A'}</span>
          </div>

          {/* ⭐ v3.9: Teacher with contact info */}
          <div className="col-span-2">
            <span className="text-gray-500">Teacher:</span>
            {teacherContact ? (
              <div className="mt-0.5">
                <TeacherContactInfo
                  fullName={teacherContact.full_name}
                  phone={teacherContact.phone}
                  email={teacherContact.email}
                  teacherType={teacherContact.teacher_type}
                />
              </div>
            ) : (
              <span className="font-medium ml-1">Not Assigned</span>
            )}
          </div>

          <div>
            <span className="text-gray-500">Max Students:</span>{' '}
            <span className="font-medium">{classData.max_students}</span>
          </div>
          <div>
            <span className="text-gray-500">Total Sessions:</span>{' '}
            <span className="font-medium">{classData.total_sessions}</span>
          </div>
          <div>
            <span className="text-gray-500">Start Date:</span>{' '}
            <span className="font-medium">{startDate || classData.start_date || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">End Date:</span>{' '}
            <span className="font-medium">{endDate || classData.end_date || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Duration:</span>{' '}
            <span className="font-medium">
              {startDate && endDate
                ? `${Math.ceil(
                    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )} days`
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Module Sessions */}
        {moduleSessions.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📚 Module Classes</h3>
            <div className="flex flex-wrap gap-2">
              {moduleSessions.map((session) => (
                <span
                  key={session.id}
                  className={`px-3 py-1.5 text-xs rounded-full border ${
                    session.lesson_type === 'Lecture'
                      ? 'bg-blue-100 border-blue-200 text-blue-700'
                      : session.lesson_type === 'Practice'
                      ? 'bg-green-100 border-green-200 text-green-700'
                      : session.lesson_type === 'Lab'
                      ? 'bg-orange-100 border-orange-200 text-orange-700'
                      : 'bg-red-100 border-red-200 text-red-700'
                  }`}
                >
                  {session.session_number}. {session.session_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {inquiryPreferences.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📋 Student Preferences</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {inquiryPreferences.map((pref, idx) => (
                <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200">
                  <span className="font-medium">Day {pref.day_of_week}:</span> {pref.start_time} - {pref.end_time}
                </div>
              ))}
            </div>
          </div>
        )}

        {lockedSchedules.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📅 Proposed Schedule</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Session
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Room
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Teacher
                    </th>
                    {/* ⭐ v3.15 — Actions */}
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lockedSchedules.map((s, idx) => {
                    const hasSubstitute = !!s.substitute_teacher_name;
                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-gray-50 ${
                          hasSubstitute ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          Session {idx + 1}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {new Date(s.start_time).toLocaleString()} -{' '}
                          {new Date(s.end_time).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {s.room_name || 'Not Assigned'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {hasSubstitute ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-emerald-700">
                                  👨‍🏫 {s.substitute_teacher_name}
                                </span>
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-semibold">
                                  🔄 SUB
                                </span>
                              </div>
                              <span className="text-[11px] text-gray-400 line-through">
                                {s.teacher_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-600">
                              {s.teacher_name || 'Not Assigned'}
                            </span>
                          )}
                        </td>
                        {/* ⭐ v3.15 — Attendance button (only when a real booking exists) */}
                        <td className="px-4 py-2 text-sm">
                          {s.booking_id ? (
                            <button
                              onClick={() =>
                                setRosterBooking({
                                  bookingId: s.booking_id,
                                  label: `Session ${idx + 1} · ${new Date(s.start_time).toLocaleString()}`,
                                })
                              }
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                            >
                              📋 Attendance
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t pt-4">
          {classData.status === 'draft' && (
            <Link
              href={`/dashboard/classes/inquire/results?${new URLSearchParams({
                courseId: classData.course_id,
                moduleId: classData.module_id || '',
                packageId: classData.package_id || '',
                maxStudents: classData.max_students.toString(),
                startDate: classData.requested_start_date || '',
                duration: classData.requested_duration_days?.toString() || '30',
                availabilities: JSON.stringify(inquiryPreferences),
              }).toString()}`}
            >
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                View Ranking Options
              </button>
            </Link>
          )}
          {classData.status === 'pending_admin' && (
            <button
              onClick={() => updateStatus('pending_student')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Submit for Student Approval
            </button>
          )}
          {classData.status === 'pending_student' && (
            <>
              <button
                onClick={() => updateStatus('pending_enrollment')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Student Confirmed
              </button>
              <button
                onClick={() => updateStatus('cancelled')}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancel (Student Rejected)
              </button>
            </>
          )}
          {classData.status === 'pending_enrollment' && (
            <button
              onClick={handleFinalize}
              className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
            >
              Confirm & Enroll (Lock Calendar)
            </button>
          )}
          {classData.status === 'active' && (
            <div className="text-sm text-green-600 bg-green-50 px-4 py-2 rounded border border-green-200">
              ✅ Class is active and scheduled
            </div>
          )}
          {classData.status === 'cancelled' && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded border border-red-200">
              ❌ Class has been cancelled
            </div>
          )}
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Delete Class
          </button>
        </div>
      </div>

      {/* ENROLLED STUDENTS */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-8">
        <h3 className="font-bold text-gray-800 mb-4">
          👨‍🎓 Enrolled Students ({enrolledStudents.length})
        </h3>
        {enrolledStudents.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No students enrolled yet. Click <strong>"Add Students"</strong> above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {enrolledStudents.map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {enrollment.student?.full_name || 'Unknown Student'}
                  </span>
                  <span className="ml-4 text-sm text-gray-500">
                    {enrollment.student?.email || ''}
                  </span>
                </div>
                <button
                  onClick={() => handleUnenrollStudent(enrollment.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  ✕ Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <EnrollStudentsModal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        onSuccess={loadDetails}
        classContext={{
          type: 'private',
          classId: classData.id,
          className: classData.class_code,
          courseName: courseName,
          scheduleSlots: lockedSchedules,
        }}
        defaultTab="new"
      />

      {/* ⭐ v3.15 — Attendance modal for private sessions */}
      {rosterBooking && (
        <SessionRosterModal
          isOpen={!!rosterBooking}
          sessionType="booking"
          sessionId={rosterBooking.bookingId}
          sessionLabel={rosterBooking.label}
          onClose={() => setRosterBooking(null)}
          onSaved={loadDetails}
        />
      )}
    </div>
  );
}