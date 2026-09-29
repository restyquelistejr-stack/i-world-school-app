// app/dashboard/staff/view/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TeacherService } from '@/lib/teacherService';

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  employee_id: string;
  join_date: string;
  gender: string;
  date_of_birth: string;
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  created_at: string;
  // Teacher fields
  specialization?: string;
  teacher_type?: 'full-time' | 'part-time';
  profile_headline?: string;
  bio?: string;
  about?: string;
  hourly_rate?: number;
  years_experience?: number;
  teaching_style?: string;
}

export default function StaffViewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [teacherData, setTeacherData] = useState<any>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  
  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (staffId) {
      loadStaffData();
    } else {
      router.push('/dashboard/staff/list');
    }
  }, [staffId]);

  async function loadStaffData() {
    setLoading(true);

    try {
      // 1. Get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', staffId)
        .single();

      if (userError) throw new Error(userError.message);

      setStaff(userData);

      // 2. If teacher, get teacher data
      if (userData.role === 'teacher') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('*')
          .eq('id', staffId)
          .single();

        setTeacherData(teacher);

        // Get availability
        const { data: availData } = await supabase
          .from('teacher_availability')
          .select('*')
          .eq('teacher_id', staffId)
          .eq('is_active', true)
          .order('day_of_week')
          .order('start_time');

        setAvailability(availData || []);

        // Get leaves
        const { data: leaveData } = await supabase
          .from('staff_leaves')
          .select('*')
          .eq('staff_id', staffId)
          .eq('is_active', true)
          .order('start_date');

        setLeaves(leaveData || []);
      }

    } catch (error: any) {
      console.error('Error loading staff:', error);
      alert('Error: ' + error.message);
    }

    setLoading(false);
  }

  // ✅ Delete teacher function
  async function handleDeleteTeacher() {
    if (!staff || staff.role !== 'teacher') return;
    
    setDeleting(true);
    try {
      const result = await TeacherService.deleteTeacher(staff.id);
      if (result.success) {
        alert(result.message);
        router.push('/dashboard/staff/teachers');
      } else {
        alert(`❌ Failed to delete: ${result.message}\n\nErrors: ${result.details?.errors.join('\n') || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert('Error deleting teacher: ' + error.message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      hr: 'bg-pink-100 text-pink-800',
      accounting: 'bg-blue-100 text-blue-800',
      teacher: 'bg-green-100 text-green-800',
      facilities: 'bg-yellow-100 text-yellow-800',
      staff: 'bg-gray-100 text-gray-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      hr: 'HR',
      accounting: 'Accounting',
      teacher: 'Teacher',
      facilities: 'Facilities',
      staff: 'Staff',
    };
    return labels[role] || role;
  };

  const getDayName = (day: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Staff member not found</h2>
        <Link href="/dashboard/staff/list">
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Back to Staff
          </button>
        </Link>
      </div>
    );
  }

  const isTeacher = staff.role === 'teacher';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard/staff/list" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
            ← Back to Staff
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{staff.full_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadge(staff.role)}`}>
              {getRoleLabel(staff.role)}
            </span>
            <span className={`px-2 py-1 text-xs rounded-full ${staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {staff.is_active ? 'Active' : 'Inactive'}
            </span>
            {staff.employee_id && <span className="text-sm text-gray-500">ID: {staff.employee_id}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/staff/edit?id=${staff.id}`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              ✏️ Edit
            </button>
          </Link>
          {isTeacher && (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleting ? '⏳ Deleting...' : '🗑️ Delete'}
            </button>
          )}
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
        <h2 className="font-bold text-gray-800 mb-4">Profile Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Email:</span>
            <span className="ml-1 font-medium">{staff.email}</span>
          </div>
          <div>
            <span className="text-gray-500">Phone:</span>
            <span className="ml-1 font-medium">{staff.phone || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Gender:</span>
            <span className="ml-1 font-medium">{staff.gender || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Date of Birth:</span>
            <span className="ml-1 font-medium">{staff.date_of_birth || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Join Date:</span>
            <span className="ml-1 font-medium">{staff.join_date || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Employee ID:</span>
            <span className="ml-1 font-medium">{staff.employee_id || '—'}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Address:</span>
            <span className="ml-1 font-medium">{staff.address || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Emergency Contact:</span>
            <span className="ml-1 font-medium">{staff.emergency_contact || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Emergency Phone:</span>
            <span className="ml-1 font-medium">{staff.emergency_phone || '—'}</span>
          </div>
        </div>
      </div>

      {/* Teacher-specific info */}
      {isTeacher && teacherData && (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
            <h2 className="font-bold text-gray-800 mb-4">👨‍🏫 Teacher Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Type:</span>
                <span className={`ml-1 font-medium px-2 py-0.5 rounded-full text-xs ${teacherData.teacher_type === 'full-time' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                  {teacherData.teacher_type || 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Specialization:</span>
                <span className="ml-1 font-medium">{teacherData.specialization || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Profile Headline:</span>
                <span className="ml-1 font-medium">{teacherData.profile_headline || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Hourly Rate:</span>
                <span className="ml-1 font-medium">${teacherData.hourly_rate || '0'}/hr</span>
              </div>
              <div>
                <span className="text-gray-500">Years Experience:</span>
                <span className="ml-1 font-medium">{teacherData.years_experience || '0'} years</span>
              </div>
              <div>
                <span className="text-gray-500">Teaching Style:</span>
                <span className="ml-1 font-medium">{teacherData.teaching_style || '—'}</span>
              </div>
            </div>

            {teacherData.bio && (
              <div className="mt-4">
                <span className="text-gray-500 text-sm">Bio:</span>
                <p className="text-gray-700 mt-1">{teacherData.bio}</p>
              </div>
            )}
          </div>

          {/* Availability */}
          <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">📅 Availability</h2>
              <Link href={`/dashboard/staff/teachers/availability?id=${staff.id}`}>
                <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                  Manage Availability
                </button>
              </Link>
            </div>

            {availability.length === 0 ? (
              <p className="text-gray-500 text-sm">No availability set.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {availability.map((slot, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="font-medium w-24">{getDayName(slot.day_of_week)}</span>
                    <span className="text-gray-600">{slot.start_time} - {slot.end_time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaves */}
          <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">🌴 Leaves</h2>
              <Link href={`/dashboard/staff/teachers/leaves?id=${staff.id}`}>
                <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                  Manage Leaves
                </button>
              </Link>
            </div>

            {leaves.length === 0 ? (
              <p className="text-gray-500 text-sm">No leaves recorded.</p>
            ) : (
              <div className="space-y-2">
                {leaves.map((leave) => (
                  <div key={leave.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium capitalize">{leave.leave_type}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        {leave.start_date} - {leave.end_date}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                      leave.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {leave.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ Delete Teacher</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{staff?.full_name}</strong>?
              <br />
              <span className="text-sm text-red-500">
                This will permanently delete all associated data including availability, leaves, bookings, and classes.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTeacher}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Deleting...
                  </>
                ) : (
                  '🗑️ Delete Teacher'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}