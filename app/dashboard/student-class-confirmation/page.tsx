'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  education_level: string;
}

interface ClassData {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_level: string;
  teacher_id: string | null;
  teacher_name: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  max_students: number;
  current_students: number;
  price: number;
  status: string;
  room: string;
  schedule: any;
  created_at: string;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  is_active: boolean;
  subjects?: any[];
  conflicts?: number;
  availability_score?: number;
  hourly_rate?: number;
}

export default function StudentClassConfirmationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams.get('classId');
  const studentId = searchParams.get('studentId');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('draft');

  useEffect(() => {
    if (classId) {
      loadData();
    } else {
      alert('No class selected');
      router.push('/dashboard/classes');
    }
  }, [classId]);

  async function loadData() {
    setLoading(true);

    try {
      // Load class data - simplified query without nested relationships
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError) {
        console.error('Error loading class:', classError);
        throw classError;
      }

      if (!classData) {
        throw new Error('Class not found');
      }

      console.log('Class data loaded:', classData);

      // Load subject separately
      let subjectName = 'Unknown Subject';
      let subjectLevel = 'N/A';
      if (classData.subject_id) {
        const { data: subjectData, error: subjectError } = await supabase
          .from('subjects')
          .select('name, level')
          .eq('id', classData.subject_id)
          .single();

        if (!subjectError && subjectData) {
          subjectName = subjectData.name || 'Unknown Subject';
          subjectLevel = subjectData.level || 'N/A';
        }
      }

      // Load teacher separately if teacher_id exists
      let teacherName = null;
      if (classData.teacher_id) {
        const { data: teacherData, error: teacherError } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', classData.teacher_id)
          .single();

        if (!teacherError && teacherData) {
          teacherName = teacherData.full_name;
        }
      }

      // Set class data
      setClassData({
        id: classData.id,
        subject_id: classData.subject_id,
        subject_name: subjectName,
        subject_level: subjectLevel,
        teacher_id: classData.teacher_id || null,
        teacher_name: teacherName,
        start_date: classData.start_date,
        end_date: classData.end_date,
        start_time: classData.start_time,
        end_time: classData.end_time,
        max_students: classData.max_students,
        current_students: classData.current_students || 0,
        price: classData.price,
        status: classData.status,
        room: classData.room || 'TBD',
        schedule: classData.schedule || { days: [] },
        created_at: classData.created_at,
      });

      setSelectedStatus(classData.status);

      // Load student if provided
      if (studentId) {
        const { data: studentData, error: studentError } = await supabase
          .from('users')
          .select('id, full_name, email, phone')
          .eq('id', studentId)
          .single();

        if (studentError) {
          console.error('Error loading student:', studentError);
        } else if (studentData) {
          // Also load education level from students table
          const { data: profileData } = await supabase
            .from('students')
            .select('education_level')
            .eq('id', studentId)
            .single();

          setStudent({
            id: studentData.id,
            full_name: studentData.full_name,
            email: studentData.email,
            phone: studentData.phone || '',
            education_level: profileData?.education_level || '',
          });
        }
      }

      // Find available teachers for this subject
      if (classData.subject_id) {
        await findAvailableTeachers(classData.subject_id, classData);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading class data: ' + (error as Error).message);
      router.push('/dashboard/classes');
    }

    setLoading(false);
  }

  async function findAvailableTeachers(subjectId: string, classData: any) {
    try {
      // First, get all active teachers
      const { data: teachers, error: teachersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, gender, is_active')
        .eq('role', 'teacher')
        .eq('is_active', true);

      if (teachersError) {
        console.error('Error loading teachers:', teachersError);
        setAvailableTeachers([]);
        return;
      }

      if (!teachers || teachers.length === 0) {
        setAvailableTeachers([]);
        return;
      }

      // Then, get which teachers can teach this subject
      const { data: teacherSubjects, error: tsError } = await supabase
        .from('teacher_subjects')
        .select('teacher_id, subject_id, rate')
        .eq('subject_id', subjectId);

      if (tsError) {
        console.error('Error loading teacher subjects:', tsError);
        setAvailableTeachers([]);
        return;
      }

      // Create a Set of qualified teacher IDs
      const qualifiedTeacherIds = new Set(teacherSubjects?.map(ts => ts.teacher_id) || []);
      
      // Filter teachers who can teach this subject
      const qualifiedTeachers = teachers.filter(t => qualifiedTeacherIds.has(t.id));

      if (qualifiedTeachers.length === 0) {
        setAvailableTeachers([]);
        return;
      }

      // Check conflicts for each qualified teacher
      const teachersWithAvailability = await Promise.all(
        qualifiedTeachers.map(async (teacher) => {
          // Check for conflicts with existing classes
          const { data: existingClasses } = await supabase
            .from('classes')
            .select('id, start_date, end_date, start_time, end_time, schedule')
            .eq('teacher_id', teacher.id)
            .in('status', ['active', 'open', 'draft'])
            .gte('start_date', classData.start_date)
            .lte('end_date', classData.end_date);

          let conflicts = 0;
          if (existingClasses && existingClasses.length > 0) {
            existingClasses.forEach((cls: any) => {
              const clsDays = cls.schedule?.days || [];
              const overlapDays = clsDays.filter((day: string) => 
                classData.schedule?.days?.includes(day)
              );
              if (overlapDays.length > 0) {
                const timeOverlap = checkTimeOverlap(
                  cls.start_time, cls.end_time,
                  classData.start_time, classData.end_time
                );
                if (timeOverlap) conflicts++;
              }
            });
          }

          const availabilityScore = Math.max(100 - (conflicts * 20), 0);

          // Get teacher's rate for this subject
          const subjectRate = teacherSubjects?.find(
            ts => ts.teacher_id === teacher.id && ts.subject_id === subjectId
          );

          return {
            ...teacher,
            conflicts,
            availability_score: availabilityScore,
            hourly_rate: subjectRate?.rate || 0,
          };
        })
      );

      // Sort by availability score (highest first)
      teachersWithAvailability.sort((a, b) => 
        (b.availability_score || 0) - (a.availability_score || 0)
      );

      setAvailableTeachers(teachersWithAvailability);

    } catch (error) {
      console.error('Error finding teachers:', error);
      setAvailableTeachers([]);
    }
  }

  function checkTimeOverlap(time1Start: string, time1End: string, time2Start: string, time2End: string): boolean {
    return time1Start < time2End && time2Start < time1End;
  }

  async function handleApprove() {
    if (!classId) return;

    setSubmitting(true);

    try {
      const updates: any = {
        status: 'open',
      };

      if (selectedTeacher) {
        updates.teacher_id = selectedTeacher;
      }

      const { error } = await supabase
        .from('classes')
        .update(updates)
        .eq('id', classId);

      if (error) throw error;

      alert('✅ Class confirmed and opened for enrollment!');
      router.push('/dashboard/classes');

    } catch (error: any) {
      console.error('Error approving class:', error);
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  async function handleReject() {
    if (!classId) return;
    
    if (!confirm('Are you sure you want to reject this class request?')) return;

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('classes')
        .update({ status: 'cancelled' })
        .eq('id', classId);

      if (error) throw error;

      alert('✅ Class request rejected.');
      router.push('/dashboard/classes');

    } catch (error: any) {
      console.error('Error rejecting class:', error);
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  async function assignTeacher(teacherId: string) {
    if (!classId) return;

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('classes')
        .update({ teacher_id: teacherId })
        .eq('id', classId);

      if (error) throw error;

      setSelectedTeacher(teacherId);
      alert('✅ Teacher assigned successfully!');

      // Reload data
      await loadData();

    } catch (error: any) {
      console.error('Error assigning teacher:', error);
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading class details...</p>
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Class not found</p>
          <Link href="/dashboard/classes">
            <button className="mt-4 text-blue-600 hover:text-blue-800">Back to Classes</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/classes">
            <button className="text-gray-600 hover:text-gray-900">← Back to Classes</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Confirm Student Class Request</h1>
        </div>

        {/* Status Banner */}
        <div className={`p-4 rounded-lg mb-6 ${
          classData.status === 'draft' ? 'bg-yellow-50 border border-yellow-200' :
          classData.status === 'open' ? 'bg-green-50 border border-green-200' :
          'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">Status: </span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                classData.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                classData.status === 'open' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {classData.status.toUpperCase()}
              </span>
            </div>
            {classData.status === 'draft' && (
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  Reject Request
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  Approve & Open Class
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Student Information */}
        {student && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">👤 Student Request</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Student Name</p>
                <p className="font-medium">{student.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{student.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-medium">{student.phone || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Education Level</p>
                <p className="font-medium">{student.education_level || '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Class Details */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📚 Class Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Subject</p>
              <p className="font-medium">{classData.subject_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Level</p>
              <p className="font-medium">{classData.subject_level}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Schedule</p>
              <p className="font-medium">
                {classData.schedule?.days?.join(', ') || 'TBD'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Time</p>
              <p className="font-medium">
                {classData.start_time} - {classData.end_time}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Dates</p>
              <p className="font-medium">
                {classData.start_date} to {classData.end_date}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Price per Session</p>
              <p className="font-medium">${classData.price}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Room</p>
              <p className="font-medium">{classData.room || 'TBD'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Students Enrolled</p>
              <p className="font-medium">{classData.current_students} / {classData.max_students}</p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 This class was created from a student registration request. 
              Review the details and assign a teacher before opening.
            </p>
          </div>
        </div>

        {/* Teacher Assignment */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">👨‍🏫 Teacher Assignment</h2>
          
          {classData.teacher_id ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{classData.teacher_name || 'Assigned'}</p>
                  <p className="text-sm text-gray-600">Teacher assigned to this class</p>
                </div>
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Assigned</span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Select a teacher to assign to this class. Teachers are sorted by availability.
              </p>

              {availableTeachers.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-700">No teachers available for this subject.</p>
                  <p className="text-sm text-gray-500 mt-1">
                    The class will be created without a teacher assignment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableTeachers.map((teacher) => (
                    <div
                      key={teacher.id}
                      className="border rounded-lg p-4 hover:border-blue-500 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{teacher.full_name}</h4>
                            {teacher.availability_score === 100 && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                                Fully Available
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-1 text-sm">
                            <div>
                              <span className="text-gray-500">Conflicts:</span>
                              <span className={`ml-1 font-medium ${
                                (teacher.conflicts || 0) === 0 ? 'text-green-600' : 'text-yellow-600'
                              }`}>
                                {teacher.conflicts || 0}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Availability:</span>
                              <span className="ml-1 font-medium">
                                {teacher.availability_score || 0}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Gender:</span>
                              <span className="ml-1">
                                {teacher.gender || '—'}
                              </span>
                            </div>
                          </div>
                          {teacher.email && (
                            <p className="text-sm text-gray-500 mt-1">{teacher.email}</p>
                          )}
                        </div>
                        <button
                          onClick={() => assignTeacher(teacher.id)}
                          disabled={submitting}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">⚡ Quick Actions</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => router.push(`/dashboard/classes/edit?id=${classId}`)}
              className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition text-center"
            >
              <div className="text-2xl mb-2">✏️</div>
              <p className="font-semibold text-blue-700">Edit Class Details</p>
              <p className="text-sm text-gray-500">Modify schedule, price, or capacity</p>
            </button>

            <button
              onClick={() => router.push(`/dashboard/enrollments?classId=${classId}`)}
              className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition text-center"
            >
              <div className="text-2xl mb-2">👨‍🎓</div>
              <p className="font-semibold text-green-700">Manage Enrollments</p>
              <p className="text-sm text-gray-500">Add or remove students</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}