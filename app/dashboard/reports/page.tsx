'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalEnrollments, setTotalEnrollments] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [paidPayments, setPaidPayments] = useState(0);
  const [classesByStatus, setClassesByStatus] = useState<Record<string, number>>({});
  const [recentEnrollments, setRecentEnrollments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Record<string, string>>({});

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    
    try {
      // 1. Get counts
      const [
        studentsRes,
        teachersRes,
        classesRes,
        enrollmentsRes,
        pendingRes,
        paidRes,
        classesStatusRes,
        recentRes
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('classes').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
        supabase.from('classes').select('status'),
        supabase.from('enrollments')
          .select('*')
          .order('enrollment_date', { ascending: false })
          .limit(10)
      ]);

      // 2. Get students for display
      const { data: studentsData } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'student');

      setStudents(studentsData || []);

      // 3. Get classes with subject names for display
      const { data: classesData } = await supabase
        .from('classes')
        .select(`
          id,
          subjects:subjects (
            name
          )
        `);

      // Create a map of class_id -> subject_name
      const subjectMap: Record<string, string> = {};
      (classesData || []).forEach((cls: any) => {
        subjectMap[cls.id] = cls.subjects?.name || 'Unknown';
      });
      setSubjects(subjectMap);

      // 4. Count classes by status
      const statusCounts: Record<string, number> = {};
      (classesStatusRes.data || []).forEach((c: any) => {
        const status = c.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      setTotalStudents(studentsRes.count || 0);
      setTotalTeachers(teachersRes.count || 0);
      setTotalClasses(classesRes.count || 0);
      setTotalEnrollments(enrollmentsRes.count || 0);
      setPendingPayments(pendingRes.count || 0);
      setPaidPayments(paidRes.count || 0);
      setClassesByStatus(statusCounts);
      setRecentEnrollments(recentRes.data || []);

    } catch (error) {
      console.error('Error loading reports:', error);
      alert('Failed to load reports');
    }
    
    setLoading(false);
  }

  function getStatusColor(status: string) {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      open: 'bg-green-100 text-green-800',
      full: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  function getStudentName(studentId: string): string {
    const student = students.find(s => s.id === studentId);
    return student?.full_name || studentId || 'N/A';
  }

  function getSubjectName(classId: string): string {
    return subjects[classId] || classId || 'N/A';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <button
            onClick={loadReports}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-500">Total Students</div>
            <div className="text-3xl font-bold text-blue-600">{totalStudents}</div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-500">Total Teachers</div>
            <div className="text-3xl font-bold text-purple-600">{totalTeachers}</div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-500">Total Classes</div>
            <div className="text-3xl font-bold text-green-600">{totalClasses}</div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-500">Total Enrollments</div>
            <div className="text-3xl font-bold text-orange-600">{totalEnrollments}</div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Payment Status</h3>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-500">Pending</div>
                <div className="text-2xl font-bold text-yellow-600">{pendingPayments}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Paid</div>
                <div className="text-2xl font-bold text-green-600">{paidPayments}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total</div>
                <div className="text-2xl font-bold text-blue-600">{totalEnrollments}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Classes by Status</h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(classesByStatus).map(([status, count]) => (
                <div key={status} className="text-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(status)}`}>
                    {status}
                  </span>
                  <div className="text-xl font-bold">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Enrollments */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Recent Enrollments</h3>
          </div>
          {recentEnrollments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No recent enrollments</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Class
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Enrolled
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentEnrollments.map((enrollment: any) => (
                    <tr key={enrollment.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStudentName(enrollment.student_id)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSubjectName(enrollment.class_id)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(enrollment.enrollment_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}