//app/dashboard/staff/teachers/view/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// --- INTERFACES ---
interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  specialization: string;
  teacher_type: 'full-time' | 'part-time' | null;
  profile_headline: string;
  bio: string;
  about: string;
  hourly_rate: number;
  years_experience: number;
  teaching_style: string;
  is_active: boolean;
  availability_count: number;
}

interface AvailabilitySlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
}

interface Leave {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  is_active: boolean;
  created_at: string;
}

interface Qualification {
  id: string;
  course_id: string;
  course_name: string;
  module_id: string | null;
  module_title: string | null;
  module_level: string | null;
  type: 'course' | 'module';
}

// --- CONSTANTS ---
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- MAIN COMPONENT ---
export default function TeacherViewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [showAllLeaves, setShowAllLeaves] = useState(false);

  useEffect(() => {
    if (teacherId) {
      loadTeacherData();
    } else {
      router.push('/dashboard/staff/teachers');
    }
  }, [teacherId]);

  // ==========================================
  // MAIN LOAD FUNCTION
  // ==========================================
  async function loadTeacherData() {
    setLoading(true);

    try {
      // 1. Get teacher data
      const { data: teacherData, error: teacherError } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .single();

      if (teacherError) throw new Error(teacherError.message);

      // 2. Get user data
      const { data: userData } = await supabase
        .from('users')
        .select('full_name, email, phone, gender')
        .eq('id', teacherId)
        .single();

      // 3. Get availability count
      const { count } = await supabase
        .from('teacher_availability')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', teacherId)
        .eq('is_active', true);

      // 4. Get availability details
      const { data: availData } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

      // 5. Get leaves
      const { data: leaveData } = await supabase
        .from('staff_leaves')
        .select('*')
        .eq('staff_id', teacherId)
        .eq('is_active', true)
        .order('start_date', { ascending: false });

      // 6. Get qualifications - FIXED
      await loadQualifications();

      setTeacher({
        id: teacherData.id,
        full_name: userData?.full_name || 'Unknown',
        email: userData?.email || 'No email',
        phone: userData?.phone || '',
        gender: userData?.gender || '',
        specialization: teacherData.specialization || '',
        teacher_type: teacherData.teacher_type || null,
        profile_headline: teacherData.profile_headline || '',
        bio: teacherData.bio || '',
        about: teacherData.about || '',
        hourly_rate: teacherData.hourly_rate || 0,
        years_experience: teacherData.years_experience || 0,
        teaching_style: teacherData.teaching_style || '',
        is_active: teacherData.is_active ?? true,
        availability_count: count || 0,
      });

      setAvailability(availData || []);
      setLeaves(leaveData || []);

    } catch (error: any) {
      console.error('Error loading teacher:', error);
      alert('Error: ' + error.message);
    }

    setLoading(false);
  }

  // ==========================================
  // LOAD QUALIFICATIONS - FIXED
  // ==========================================
  async function loadQualifications() {
    try {
      const allQualifications: Qualification[] = [];

      // 1. Get course-level qualifications (staff_courses)
      // ✅ FIXED: No is_active column, removed .eq('is_active', true)
      const { data: staffCourses } = await supabase
        .from('staff_courses')
        .select(`
          id,
          course_id,
          course:course_id (id, name)
        `)
        .eq('staff_id', teacherId);

      for (const sc of staffCourses || []) {
        const courseData = (sc as any).course;
        allQualifications.push({
          id: sc.id,
          course_id: sc.course_id,
          course_name: courseData?.name || 'Unknown',
          module_id: null,
          module_title: null,
          module_level: null,
          type: 'course'
        });
      }

      // 2. Get module-level qualifications (teacher_modules)
      const { data: teacherModules } = await supabase
        .from('teacher_modules')
        .select(`
          id,
          module_id,
          module:module_id (id, title, level, course_id)
        `)
        .eq('teacher_id', teacherId)
        .eq('is_active', true);

      for (const tm of teacherModules || []) {
        const moduleData = (tm as any).module;
        if (moduleData) {
          // Get course name
          let courseName = 'Unknown';
          if (moduleData.course_id) {
            const { data: course } = await supabase
              .from('courses')
              .select('name')
              .eq('id', moduleData.course_id)
              .single();
            if (course) courseName = course.name;
          }

          allQualifications.push({
            id: tm.id,
            course_id: moduleData.course_id || '',
            course_name: courseName,
            module_id: moduleData.id || null,
            module_title: moduleData.title || null,
            module_level: moduleData.level || null,
            type: 'module'
          });
        }
      }

      // Sort by course name
      allQualifications.sort((a, b) => a.course_name.localeCompare(b.course_name));
      setQualifications(allQualifications);

    } catch (error) {
      console.error('Error loading qualifications:', error);
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================
  const getDayName = (day: number) => {
    return DAYS[day] || 'Unknown';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '⏳ Pending',
      approved: '✅ Approved',
      rejected: '❌ Rejected',
      cancelled: '🚫 Cancelled',
    };
    return labels[status] || status;
  };

  const getLeaveTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      annual: 'Annual Leave',
      sick: 'Sick Leave',
      personal: 'Personal Leave',
      emergency: 'Emergency Leave',
      other: 'Other',
    };
    return labels[type] || type;
  };

  const getLevelLabel = (level: string) => {
    if (!level) return '';
    return level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ');
  };

  // Get upcoming leaves (status pending or approved)
  const upcomingLeaves = leaves.filter(l => 
    l.status === 'pending' || l.status === 'approved'
  );

  // Get past leaves
  const pastLeaves = leaves.filter(l => 
    l.status === 'rejected' || l.status === 'cancelled'
  );

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Teacher not found</h2>
        <Link href="/dashboard/staff/teachers">
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Back to Teachers
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard/staff/teachers" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
            ← Back to Teachers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{teacher.full_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {teacher.teacher_type && (
              <span className={`px-2 py-1 text-xs rounded-full ${teacher.teacher_type === 'full-time' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                {teacher.teacher_type}
              </span>
            )}
            <span className={`px-2 py-1 text-xs rounded-full ${teacher.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {teacher.is_active ? 'Active' : 'Inactive'}
            </span>
            {teacher.specialization && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                {teacher.specialization}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/staff/teachers/edit?id=${teacher.id}`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              ✏️ Edit
            </button>
          </Link>
          <Link href={`/dashboard/staff/teachers/availability?id=${teacher.id}`}>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              📅 Availability
            </button>
          </Link>
          <Link href={`/dashboard/staff/teachers/leaves?id=${teacher.id}`}>
            <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition">
              🌴 Leaves
            </button>
          </Link>
          <Link href={`/dashboard/staff/teachers/qualifications?id=${teacher.id}`}>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
              🎓 Qualifications
            </button>
          </Link>
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
        <h2 className="font-bold text-gray-800 mb-4">Profile Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Email:</span>
            <span className="ml-1 font-medium">{teacher.email}</span>
          </div>
          <div>
            <span className="text-gray-500">Phone:</span>
            <span className="ml-1 font-medium">{teacher.phone || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Gender:</span>
            <span className="ml-1 font-medium">{teacher.gender || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Specialization:</span>
            <span className="ml-1 font-medium">{teacher.specialization || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Years Experience:</span>
            <span className="ml-1 font-medium">{teacher.years_experience || '0'} years</span>
          </div>
          <div>
            <span className="text-gray-500">Hourly Rate:</span>
            <span className="ml-1 font-medium">${teacher.hourly_rate || '0'}/hr</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Profile Headline:</span>
            <span className="ml-1 font-medium">{teacher.profile_headline || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Teaching Style:</span>
            <span className="ml-1 font-medium">{teacher.teaching_style || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Availability Slots:</span>
            <span className="ml-1 font-medium">{teacher.availability_count}</span>
          </div>
        </div>

        {teacher.bio && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="font-semibold text-gray-700">Bio</h3>
            <p className="text-gray-600 mt-1">{teacher.bio}</p>
          </div>
        )}

        {teacher.about && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="font-semibold text-gray-700">About</h3>
            <p className="text-gray-600 mt-1">{teacher.about}</p>
          </div>
        )}
      </div>

      {/* Qualifications */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-800">🎓 Course & Module Qualifications</h2>
          <Link href={`/dashboard/staff/teachers/qualifications?id=${teacher.id}`}>
            <button className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition">
              Manage Qualifications
            </button>
          </Link>
        </div>

        {qualifications.length === 0 ? (
          <p className="text-gray-500 text-sm">No qualifications assigned. Click "Manage Qualifications" to assign.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(
              qualifications.reduce((acc: Record<string, Qualification[]>, q) => {
                if (!acc[q.course_id]) acc[q.course_id] = [];
                acc[q.course_id].push(q);
                return acc;
              }, {})
            ).map(([courseId, courseQualifications]) => (
              <div key={courseId} className="border border-gray-200 rounded-lg p-3">
                <div className="font-medium text-gray-800">
                  📚 {courseQualifications[0].course_name}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {courseQualifications.map((q, idx) => {
                    const displayText = q.module_id 
                      ? `Level: ${getLevelLabel(q.module_level || '')} → ${q.module_title}`
                      : 'All Modules';
                    
                    return (
                      <span 
                        key={idx}
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          q.module_id 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'bg-green-100 text-green-700 border border-green-200'
                        }`}
                      >
                        {displayText}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-800">📅 Availability</h2>
          <Link href={`/dashboard/staff/teachers/availability?id=${teacher.id}`}>
            <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition">
              Manage Availability
            </button>
          </Link>
        </div>

        {availability.length === 0 ? (
          <p className="text-gray-500 text-sm">No availability set.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {availability.map((slot, index) => {
              const dayName = getDayName(slot.day_of_week);
              return (
                <div key={index} className="flex flex-col items-center p-2 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">{dayName}</span>
                  <span className="text-sm font-medium text-gray-700">
                    {slot.start_time} - {slot.end_time}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leaves */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-800">🌴 Leaves</h2>
          <Link href={`/dashboard/staff/teachers/leaves?id=${teacher.id}`}>
            <button className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition">
              Manage Leaves
            </button>
          </Link>
        </div>

        {leaves.length === 0 ? (
          <p className="text-gray-500 text-sm">No leave requests found.</p>
        ) : (
          <div className="space-y-2">
            {upcomingLeaves.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upcoming / Pending</p>
                <div className="space-y-2">
                  {upcomingLeaves.slice(0, showAllLeaves ? undefined : 3).map((leave) => (
                    <div key={leave.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <div>
                        <span className="text-sm font-medium">{getLeaveTypeLabel(leave.leave_type)}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {leave.start_date} - {leave.end_date}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(leave.status)}`}>
                        {getStatusLabel(leave.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastLeaves.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Past / Completed</p>
                <div className="space-y-2">
                  {pastLeaves.slice(0, showAllLeaves ? undefined : 3).map((leave) => (
                    <div key={leave.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100 opacity-75">
                      <div>
                        <span className="text-sm font-medium">{getLeaveTypeLabel(leave.leave_type)}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {leave.start_date} - {leave.end_date}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(leave.status)}`}>
                        {getStatusLabel(leave.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leaves.length > 6 && (
              <button
                onClick={() => setShowAllLeaves(!showAllLeaves)}
                className="text-xs text-blue-600 hover:text-blue-800 mt-2"
              >
                {showAllLeaves ? 'Show less' : `Show ${leaves.length - 6} more leaves`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}