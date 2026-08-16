'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ClassAssignment {
  id: string;
  subject_name: string;
  subject_level: string;
  teacher_id: string | null;
  teacher_name: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  room: string;
  enrolled_students: number;
  max_students: number;
  status: string;
  schedule: any;
  student_preferences?: any;
}

interface TeacherAvailability {
  teacher_id: string;
  teacher_name: string;
  available_days: string[];
  available_times: { start: string; end: string }[];
  conflicts: number;
  score: number;
}

export default function ClassAssignmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams.get('classId');
  
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<ClassAssignment | null>(null);
  const [availableTeachers, setAvailableTeachers] = useState<TeacherAvailability[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [proposedSchedule, setProposedSchedule] = useState<any>(null);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);

  useEffect(() => {
    if (classId) {
      loadClassData();
    } else {
      // Show all unassigned classes
      loadUnassignedClasses();
    }
  }, [classId]);

  async function loadClassData() {
    setLoading(true);
    try {
      // Load class details
      const { data: cls, error } = await supabase
        .from('classes')
        .select(`
          *,
          subject:subject_id (id, name, level),
          teacher:teacher_id (id, full_name),
          enrollments (student_id)
        `)
        .eq('id', classId)
        .single();

      if (error) throw error;

      setClassData({
        id: cls.id,
        subject_name: cls.subject?.name || 'Unknown',
        subject_level: cls.subject?.level || 'N/A',
        teacher_id: cls.teacher_id,
        teacher_name: cls.teacher?.full_name || null,
        start_date: cls.start_date,
        end_date: cls.end_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        room: cls.room,
        enrolled_students: cls.enrollments?.length || 0,
        max_students: cls.max_students,
        status: cls.status,
        schedule: cls.schedule,
      });

      // Find available teachers
      await findAvailableTeachers(cls);

    } catch (error) {
      console.error('Error loading class:', error);
      alert('Error loading class data');
    }
    setLoading(false);
  }

  async function loadUnassignedClasses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select(`
          *,
          subject:subject_id (id, name, level),
          enrollments (student_id)
        `)
        .is('teacher_id', null)
        .in('status', ['open', 'draft']);

      if (error) throw error;

      // Process and show list
      console.log('Unassigned classes:', data);
      setClassData(data?.[0] || null);
      
    } catch (error) {
      console.error('Error loading classes:', error);
    }
    setLoading(false);
  }

  async function findAvailableTeachers(cls: any) {
    try {
      // Get all active teachers
      const { data: teachers, error } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          teacher_subjects!inner (
            subject_id,
            rate
          )
        `)
        .eq('role', 'teacher')
        .eq('is_active', true)
        .eq('teacher_subjects.subject_id', cls.subject_id);

      if (error) throw error;

      // Check teacher availability for the class schedule
      const availability = await Promise.all((teachers || []).map(async (teacher) => {
        // Check for conflicts
        const { data: conflicts } = await supabase
          .from('class_sessions')
          .select('id')
          .eq('teacher_id', teacher.id)
          .gte('session_date', cls.start_date)
          .lte('session_date', cls.end_date);

        // Check other classes
        const { data: otherClasses } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', teacher.id)
          .eq('status', 'active')
          .gte('start_date', cls.start_date)
          .lte('end_date', cls.end_date);

        const conflictCount = (conflicts?.length || 0) + (otherClasses?.length || 0);

        return {
          teacher_id: teacher.id,
          teacher_name: teacher.full_name,
          available_days: ['Monday', 'Wednesday', 'Friday'], // This would come from teacher's availability
          available_times: [{ start: '09:00', end: '17:00' }],
          conflicts: conflictCount,
          score: Math.max(100 - (conflictCount * 10), 0),
        };
      }));

      availability.sort((a, b) => b.score - a.score);
      setAvailableTeachers(availability);

    } catch (error) {
      console.error('Error finding teachers:', error);
    }
  }

  async function assignTeacher(teacherId: string) {
    if (!classId) return;

    try {
      const { error } = await supabase
        .from('classes')
        .update({
          teacher_id: teacherId,
          status: 'open'
        })
        .eq('id', classId);

      if (error) throw error;

      alert('✅ Teacher assigned successfully!');
      router.push('/dashboard/classes');
      
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function proposeNewSchedule(scheduleData: any) {
    // This would propose a new schedule based on teacher availability
    // and student preferences
    setProposedSchedule(scheduleData);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/classes">
            <button className="text-gray-600 hover:text-gray-900">← Back to Classes</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Class Assignment</h1>
        </div>

        {classData ? (
          <>
            {/* Class Details */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Class Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Subject</p>
                  <p className="font-medium">{classData.subject_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Level</p>
                  <p className="font-medium">{classData.subject_level}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Students</p>
                  <p className="font-medium">{classData.enrolled_students}/{classData.max_students}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    classData.status === 'open' ? 'bg-green-100 text-green-800' :
                    classData.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {classData.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Schedule</p>
                  <p className="font-medium">{classData.start_date} - {classData.end_date}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium">{classData.start_time} - {classData.end_time}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Room</p>
                  <p className="font-medium">{classData.room || 'TBD'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Current Teacher</p>
                  <p className="font-medium">{classData.teacher_name || 'Unassigned'}</p>
                </div>
              </div>
            </div>

            {/* Available Teachers */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">Available Teachers</h2>
              
              {availableTeachers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">No teachers available for this subject.</p>
                  <button
                    onClick={() => router.push('/dashboard/admin-settings?tab=teachers')}
                    className="mt-2 text-blue-600 hover:text-blue-800"
                  >
                    Add teachers for this subject →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableTeachers.map((teacher) => (
                    <div
                      key={teacher.teacher_id}
                      className="border rounded-lg p-4 hover:border-blue-500 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{teacher.teacher_name}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span>Availability: {teacher.available_days.join(', ')}</span>
                            <span>Conflicts: {teacher.conflicts}</span>
                            <span>Match Score: {teacher.score}%</span>
                          </div>
                        </div>
                        <button
                          onClick={() => assignTeacher(teacher.teacher_id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No unassigned classes found.</p>
            <Link href="/dashboard/classes">
              <button className="mt-4 text-blue-600 hover:text-blue-800">
                View all classes →
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}