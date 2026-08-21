'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  specialization: string | null;
  is_active: boolean;
}

interface AssignedTeacher {
  id: string;
  teacher_id: string;
  course_id: string;
  teacher: Teacher;
}

export default function AssignTeachersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const courseId = searchParams.get('id') as string;

  const [courseName, setCourseName] = useState('');
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [assignedTeachers, setAssignedTeachers] = useState<AssignedTeacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadData();
    }
  }, [courseId]);

  async function loadData() {
    setLoading(true);
    try {
      // Get course name
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('name')
        .eq('id', courseId)
        .single();

      if (courseError) {
        console.error('Error loading course:', courseError);
      } else if (course) {
        setCourseName(course.name);
      }

      // Get all active teachers from users table
      const { data: teachers, error: teachersError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'teacher')
        .eq('is_active', true)
        .order('full_name');

      if (teachersError) {
        console.error('Error loading teachers:', teachersError);
      } else if (teachers) {
        // Map to Teacher interface with default values
        const mappedTeachers: Teacher[] = teachers.map((t: any) => ({
          id: t.id,
          full_name: t.full_name,
          email: t.email || '',
          specialization: null,
          is_active: true,
        }));
        setAllTeachers(mappedTeachers);
      }

      // Get assigned teachers for this course from staff_courses table
      const { data: assignments, error: assignmentsError } = await supabase
        .from('staff_courses')
        .select(`
          id,
          teacher_id,
          course_id,
          teacher:users!teacher_id(id, full_name, email)
        `)
        .eq('course_id', courseId);

      if (assignmentsError) {
        console.error('Error loading assignments:', assignmentsError);
      } else if (assignments) {
        // Transform the data to match our interface
        const formattedAssignments: AssignedTeacher[] = assignments.map((item: any) => ({
          id: item.id,
          teacher_id: item.teacher_id,
          course_id: item.course_id,
          teacher: {
            id: item.teacher?.id || item.teacher_id,
            full_name: item.teacher?.full_name || 'Unknown',
            email: item.teacher?.email || '',
            specialization: null,
            is_active: true,
          }
        }));
        setAssignedTeachers(formattedAssignments);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  async function assignTeacher() {
    if (!selectedTeacherId) {
      alert('Please select a teacher');
      return;
    }

    // Check if already assigned
    if (assignedTeachers.some(a => a.teacher_id === selectedTeacherId)) {
      alert('This teacher is already assigned to this course');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_courses')
        .insert({
          teacher_id: selectedTeacherId,
          course_id: courseId,
        });

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      alert('✅ Teacher assigned successfully!');
      setSelectedTeacherId('');
      await loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + (error.message || 'Failed to assign teacher'));
    }
    setSaving(false);
  }

  async function removeAssignment(assignmentId: string, teacherName: string) {
    if (!confirm(`Remove ${teacherName} from this course?`)) return;

    try {
      const { error } = await supabase
        .from('staff_courses')
        .delete()
        .eq('id', assignmentId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      await loadData();
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + (error.message || 'Failed to remove teacher'));
    }
  }

  const availableTeachers = allTeachers.filter(
    t => !assignedTeachers.some(a => a.teacher_id === t.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          <h2 className="text-xl font-bold mb-2">No Course Selected</h2>
          <p>Please select a course to assign teachers.</p>
          <Link href="/dashboard/academics/courses" className="text-blue-600 hover:underline mt-4 inline-block">
            ← Back to Courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/dashboard/academics/courses/details?id=${courseId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Course</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Assign Teachers - {courseName}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Assign New Teacher */}
        <div className="border-b pb-4">
          <h3 className="font-medium text-gray-800 mb-3">Assign New Teacher</h3>
          <div className="flex gap-3">
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a teacher...</option>
              {availableTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name} {teacher.email ? `- ${teacher.email}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={assignTeacher}
              disabled={saving || !selectedTeacherId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Assigning...' : 'Assign'}
            </button>
          </div>
          {availableTeachers.length === 0 && allTeachers.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              All available teachers are already assigned to this course.
            </p>
          )}
          {allTeachers.length === 0 && (
            <p className="text-sm text-yellow-600 mt-2">
              ⚠️ No teachers found. Please add teachers to the system first.
            </p>
          )}
        </div>

        {/* Assigned Teachers List */}
        <div>
          <h3 className="font-medium text-gray-800 mb-3">
            Assigned Teachers ({assignedTeachers.length})
          </h3>
          {assignedTeachers.length === 0 ? (
            <p className="text-gray-500 text-sm">No teachers assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {assignedTeachers.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {assignment.teacher.full_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {assignment.teacher.email}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAssignment(assignment.id, assignment.teacher.full_name)}
                    className="text-red-500 hover:text-red-700 text-sm transition"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}