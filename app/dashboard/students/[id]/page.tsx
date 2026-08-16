'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function StudentDetailsPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([]);

  useEffect(() => {
    loadStudentDetails();
  }, [studentId]);

  async function loadStudentDetails() {
    setLoading(true);
    try {
      // 1. Load Student Info
      const { data: studentData } = await supabase
        .from('users')
        .select('*')
        .eq('id', studentId)
        .single();
      setStudent(studentData);

      // 2. Load Enrolled Classes (via class_enrollments)
      const { data: classData } = await supabase
        .from('class_enrollments')
        .select(`
          id,
          class_id,
          classes:class_id (
            id,
            course:course_id (name)
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active');
      
      setEnrolledClasses(classData || []);
    } catch (error) {
      console.error('Error loading student:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (!student) return <div className="p-6 text-center text-red-500">Student not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/students/directory">
          <button className="text-gray-600 hover:text-gray-900">← Back to Directory</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">👤 {student.full_name}</h1>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Email:</span> <span className="font-medium">{student.email}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{student.phone || 'N/A'}</span></div>
          <div><span className="text-gray-500">Role:</span> <span className="font-medium">{student.role}</span></div>
          <div><span className="text-gray-500">Status:</span> <span className="font-medium text-green-600">Active</span></div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h2 className="text-lg font-bold mb-4">📚 Enrolled Classes</h2>
        {enrolledClasses.length === 0 ? (
          <p className="text-gray-500">This student is not enrolled in any active classes.</p>
        ) : (
          <div className="space-y-2">
            {enrolledClasses.map((enrollment) => (
              <div key={enrollment.id} className="p-3 bg-gray-50 rounded border border-gray-200 flex justify-between items-center">
                <span className="font-medium text-gray-800">
                  {enrollment.classes?.course?.name || 'Unknown Class'}
                </span>
                <Link href={`/dashboard/classes/details/${enrollment.class_id}`}>
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    View Class
                  </button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}