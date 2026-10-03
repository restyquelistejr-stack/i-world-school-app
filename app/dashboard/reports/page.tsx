// app/dashboard/reports/page.tsx
// ⭐ v3.19 — Moved Teacher Weekly Stats + 6-Week Trend here from Dashboard.
//            Removed Classes by Status block.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabaseClient'

// ⭐ v3.19 — Lazy-load the two chart components.
// They're heavy (Recharts SVG) and would block the Reports page's first paint
// if imported eagerly. Load them after the page is interactive.
const TeacherWeeklyStats = dynamic(
  () => import('./components/TeacherWeeklyStats'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    ),
  }
)

const SixWeekTrend = dynamic(
  () => import('./components/SixWeekTrend'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4 animate-pulse"></div>
        <div className="h-72 bg-gray-100 rounded animate-pulse"></div>
      </div>
    ),
  }
)

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalTeachers, setTotalTeachers] = useState(0)
  const [totalClasses, setTotalClasses] = useState(0)
  const [totalEnrollments, setTotalEnrollments] = useState(0)
  const [pendingPayments, setPendingPayments] = useState(0)
  const [paidPayments, setPaidPayments] = useState(0)
  const [recentEnrollments, setRecentEnrollments] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [subjects, setSubjects] = useState<Record<string, string>>({})

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    try {
      const [
        studentsRes,
        teachersRes,
        classesRes,
        enrollmentsRes,
        pendingRes,
        paidRes,
        recentRes,
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('classes').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
        supabase.from('enrollments').select('*').order('enrollment_date', { ascending: false }).limit(10),
      ])

      const { data: studentsData } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'student')
      setStudents(studentsData || [])

      const { data: classesData } = await supabase
        .from('classes')
        .select(`
          id,
          subjects:subjects (
            name
          )
        `)

      const subjectMap: Record<string, string> = {}
      ;(classesData || []).forEach((cls: any) => {
        subjectMap[cls.id] = cls.subjects?.name || 'Unknown'
      })
      setSubjects(subjectMap)

      setTotalStudents(studentsRes.count || 0)
      setTotalTeachers(teachersRes.count || 0)
      setTotalClasses(classesRes.count || 0)
      setTotalEnrollments(enrollmentsRes.count || 0)
      setPendingPayments(pendingRes.count || 0)
      setPaidPayments(paidRes.count || 0)
      setRecentEnrollments(recentRes.data || [])
    } catch (error) {
      console.error('Error loading reports:', error)
    }
    setLoading(false)
  }

  function getStudentName(studentId: string): string {
    const student = students.find(s => s.id === studentId)
    return student?.full_name || studentId || 'N/A'
  }

  function getSubjectName(classId: string): string {
    return subjects[classId] || classId || 'N/A'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading reports...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <button
            onClick={loadReports}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Quick link to Teacher Hours */}
        <Link
          href="/dashboard/reports/teachers"
          className="block bg-white rounded-lg shadow-lg p-4 mb-6 hover:shadow-xl transition border border-gray-200"
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">⏱️</div>
            <div>
              <div className="font-semibold text-gray-900">Teacher Hours Report</div>
              <div className="text-sm text-gray-500">
                Payroll-ready ledger of paid / scheduled / substituted hours per teacher
              </div>
            </div>
            <span className="ml-auto text-gray-400 text-xl">→</span>
          </div>
        </Link>

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

        {/* Payment Status */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
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

        {/* ⭐ v3.19 — Analytics Section */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase mb-3">
            📊 Teacher Analytics
          </h2>
          <div className="space-y-4">
            <TeacherWeeklyStats />
            <SixWeekTrend />
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentEnrollments.map((enrollment: any) => (
                    <tr key={enrollment.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{getStudentName(enrollment.student_id)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{getSubjectName(enrollment.class_id)}</td>
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
  )
}