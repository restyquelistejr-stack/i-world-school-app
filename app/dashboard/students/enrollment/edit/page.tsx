// app/dashboard/students/enrollment/edit/page.tsx
// ⭐ Edit enrollment (query-param style)
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function EnrollmentEditPage() {
  const searchParams = useSearchParams();
  const enrollmentId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (enrollmentId) loadEnrollment();
  }, [enrollmentId]);

  async function loadEnrollment() {
    setLoading(true);
    const { data } = await supabase
      .from('class_enrollments')
      .select(`
        id,
        status,
        class_id,
        student_id,
        classes:class_id (
          id,
          class_code,
          course:course_id (name)
        )
      `)
      .eq('id', enrollmentId)
      .single();

    setEnrollment(data);
    setLoading(false);
  }

  async function handleSave(newStatus: string) {
    if (!enrollmentId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('class_enrollments')
        .update({ status: newStatus })
        .eq('id', enrollmentId);

      if (error) throw error;

      alert('✅ Enrollment updated!');
      window.history.back();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700">Enrollment not found</p>
        </div>
      </div>
    );
  }

  const cls = Array.isArray(enrollment.classes) ? enrollment.classes[0] : enrollment.classes;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/students/directory">
          <button className="text-gray-600 hover:text-gray-900">← Back</button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">✏️ Edit Enrollment</h1>

        <div className="mb-6">
          <div className="text-sm text-gray-500">Class</div>
          <div className="font-medium">{cls?.course?.name || 'Unknown'}</div>
          {cls?.class_code && (
            <div className="text-xs font-mono text-gray-500 mt-0.5">{cls.class_code}</div>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <div className="flex gap-2">
            {['active', 'inactive'].map(status => (
              <button
                key={status}
                onClick={() => handleSave(status)}
                disabled={saving || enrollment.status === status}
                className={`px-4 py-2 rounded-lg transition ${
                  enrollment.status === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}