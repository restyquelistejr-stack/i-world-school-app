'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Enrollment {
  id: string;
  enrollment_date: string;
  payment_status: string;
  attendance_count: number;
  class: {
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    schedule: any;
    teacher: {
      id: string;
      full_name: string;
      email: string;
    } | null;
    subject: {
      id: string;
      name: string;
      category: string;
      level: string;
      description: string;
      duration_hours: number;
    };
  };
}

export default function StudentEnrollmentsPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studentId) {
      loadData();
    }
  }, [studentId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load student info
      const { data: studentData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('id', studentId)
        .single();
      setStudent(studentData);

      // Load enrollments with full details
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          class:class_id (
            id,
            status,
            start_date,
            end_date,
            schedule,
            teacher:teacher_id (id, full_name, email),
            subject:subject_id (
              id,
              name,
              category,
              level,
              description,
              duration_hours
            )
          )
        `)
        .eq('student_id', studentId)
        .order('enrollment_date', { ascending: false });

      if (error) throw error;
      setEnrollments(data || []);
    } catch (error) {
      console.error('Error loading enrollments:', error);
      alert('Failed to load enrollments');
    }
    setLoading(false);
  }

  const getPaymentBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      refunded: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getClassStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      open: 'bg-green-100 text-green-800',
      active: 'bg-blue-100 text-blue-800',
      full: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading enrollments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/students/directory">
            <button className="text-gray-600 hover:text-gray-900">← Back to Students</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {student?.full_name || 'Student'}'s Enrollments
          </h1>
          <div className="ml-auto flex gap-3">
            <Link href={`/dashboard/students/enrollment?student=${studentId}`}>
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">
                + New Enrollment
              </button>
            </Link>
          </div>
        </div>

        {enrollments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No enrollments found for this student.</p>
            <Link href={`/dashboard/students/enrollment?student=${studentId}`}>
              <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                Enroll Now
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {enrollment.class?.subject?.name || 'Unknown Subject'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {enrollment.class?.subject?.category || 'Uncategorized'} • 
                        {enrollment.class?.subject?.level || 'N/A'} • 
                        {enrollment.class?.subject?.duration_hours || 0}h
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getClassStatusBadge(enrollment.class?.status || '')}`}>
                      {enrollment.class?.status || 'N/A'}
                    </span>
                  </div>

                  {/* Teacher Info */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">👨‍🏫</span>
                      <div>
                        <div className="text-sm font-medium">
                          {enrollment.class?.teacher?.full_name || 'No teacher assigned'}
                        </div>
                        {enrollment.class?.teacher && (
                          <div className="text-xs text-gray-500">{enrollment.class.teacher.email}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                    <div>
                      <span className="text-gray-500">Schedule</span>
                      <div className="font-medium">
                        {enrollment.class?.schedule?.days?.length > 0 ? (
                          <>
                            {enrollment.class.schedule.days.join(', ')}
                            <span className="text-gray-500 text-xs ml-2">
                              {enrollment.class.schedule.startTime} - {enrollment.class.schedule.endTime}
                            </span>
                          </>
                        ) : (
                          'TBD'
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Dates</span>
                      <div className="font-medium">
                        {enrollment.class?.start_date ? (
                          <>
                            {new Date(enrollment.class.start_date).toLocaleDateString()} - 
                            {new Date(enrollment.class.end_date).toLocaleDateString()}
                          </>
                        ) : (
                          'TBD'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Enrollment Details */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${getPaymentBadge(enrollment.payment_status)}`}>
                        {enrollment.payment_status}
                      </span>
                      <span className="text-gray-500">
                        📊 {enrollment.attendance_count || 0} sessions
                      </span>
                      <span className="text-gray-500">
                        📅 {new Date(enrollment.enrollment_date).toLocaleDateString()}
                      </span>
                    </div>
                    <Link href={`/dashboard/students/enrollment/edit/${enrollment.id}`}>
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Edit →
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