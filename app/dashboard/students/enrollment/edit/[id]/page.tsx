'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  enrollment_date: string;
  payment_status: string;
  attendance_count: number;
  student?: {
    id: string;
    full_name: string;
    email: string;
  };
  class?: {
    id: string;
    subject_id: string;
    teacher_id: string;
    status: string;
    schedule: any;
    start_date: string;
    end_date: string;
    subject?: {
      id: string;
      name: string;
      category: string;
      level: string;
      duration_hours: number;
    };
    teacher?: {
      id: string;
      full_name: string;
      email: string;
    };
  };
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
}

export default function EditEnrollmentPage() {
  const params = useParams();
  const router = useRouter();
  const enrollmentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [classStatus, setClassStatus] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<string>('');
  const [schedule, setSchedule] = useState<any>({ days: [], startTime: '09:00', endTime: '17:00' });
  const [error, setError] = useState<string | null>(null);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    if (enrollmentId) {
      loadData();
    }
  }, [enrollmentId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Load enrollment with all relations
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('enrollments')
        .select(`
          *,
          student:student_id (id, full_name, email),
          class:class_id (
            id,
            subject_id,
            teacher_id,
            status,
            schedule,
            start_date,
            end_date,
            subject:subject_id (id, name, category, level, duration_hours),
            teacher:teacher_id (id, full_name, email)
          )
        `)
        .eq('id', enrollmentId)
        .single();

      if (enrollmentError) throw enrollmentError;

      setEnrollment(enrollmentData);
      setSelectedTeacher(enrollmentData.class?.teacher_id || '');
      setClassStatus(enrollmentData.class?.status || 'draft');
      setPaymentStatus(enrollmentData.payment_status || 'pending');
      setSchedule(enrollmentData.class?.schedule || { days: [], startTime: '09:00', endTime: '17:00' });

      // Load available teachers
      const { data: teachersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'teacher')
        .eq('is_active', true)
        .order('full_name');

      setTeachers(teachersData || []);

    } catch (error: any) {
      console.error('Error loading enrollment:', error);
      setError('Failed to load enrollment data');
    }
    setLoading(false);
  }

  const toggleDay = (day: string) => {
    setSchedule((prev: any) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d: string) => d !== day)
        : [...prev.days, day]
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Update the class
      const { error: classError } = await supabase
        .from('classes')
        .update({
          teacher_id: selectedTeacher || null,
          status: classStatus,
          schedule: schedule,
        })
        .eq('id', enrollment?.class_id);

      if (classError) throw classError;

      // Update the enrollment
      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .update({
          payment_status: paymentStatus,
        })
        .eq('id', enrollmentId);

      if (enrollmentError) throw enrollmentError;

      alert('✅ Enrollment updated successfully!');
      router.push('/dashboard/students/enrollments');

    } catch (error: any) {
      console.error('Error updating enrollment:', error);
      setError(error.message || 'Failed to update enrollment');
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading enrollment...</p>
        </div>
      </div>
    );
  }

  if (error || !enrollment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || 'Enrollment not found'}</p>
          <Link href="/dashboard/students/enrollments">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Back to Enrollments
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/students/enrollments">
            <button className="text-gray-600 hover:text-gray-900">← Back to Enrollments</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Enrollment</h1>
        </div>

        {/* Student Info Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600">
              {enrollment.student?.full_name?.charAt(0) || 'S'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{enrollment.student?.full_name}</h2>
              <p className="text-sm text-gray-500">{enrollment.student?.email}</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-medium">Enrolled</div>
              <div className="text-sm text-gray-500">
                {new Date(enrollment.enrollment_date).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Subject Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">📚 Subject Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Subject</div>
              <div className="font-medium">{enrollment.class?.subject?.name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Category</div>
              <div className="font-medium">{enrollment.class?.subject?.category || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Level</div>
              <div className="font-medium">{enrollment.class?.subject?.level || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Duration</div>
              <div className="font-medium">{enrollment.class?.subject?.duration_hours || 0} hours</div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6">
          <div className="space-y-6">
            {/* Teacher Assignment */}
            <div>
              <label className="block text-sm font-medium mb-1">Teacher</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No teacher assigned (Admin will assign)</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.full_name} ({teacher.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Class Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Class Status</label>
              <select
                value={classStatus}
                onChange={(e) => setClassStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="active">Active</option>
                <option value="full">Full</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Payment Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium mb-2">Schedule</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {DAYS.map((day) => (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      schedule.days.includes(day)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => setSchedule((prev: any) => ({ ...prev, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Time</label>
                  <input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => setSchedule((prev: any) => ({ ...prev, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Enrollment Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-medium text-gray-700 mb-2">📋 Enrollment Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Enrollment ID:</span>
                  <span className="ml-2 font-mono text-xs">{enrollment.id.slice(0, 8)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Attendance:</span>
                  <span className="ml-2 font-medium">{enrollment.attendance_count || 0} sessions</span>
                </div>
                <div>
                  <span className="text-gray-500">Enrolled Date:</span>
                  <span className="ml-2">{new Date(enrollment.enrollment_date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Class ID:</span>
                  <span className="ml-2 font-mono text-xs">{enrollment.class_id.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Link href="/dashboard/students/enrollments">
                <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}