'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Student {
  id: string;
  full_name: string;
  email: string;
  student_no: string;
  interests: string[];
  availability: any[];
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  profile_headline: string;
  years_experience: number;
  subjects: any[];
  availability: any[];
  active_classes: number;
  match_score: number;
}

interface PendingEnrollment {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  status: string;
  created_at: string;
  student?: Student;
  teacher_id?: string;
  teacher?: Teacher;
  matched_teachers?: Teacher[];
}

export default function TeacherMatchingDashboard() {
  const router = useRouter();
  const [pendingEnrollments, setPendingEnrollments] = useState<PendingEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [matchedTeachers, setMatchedTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Get all pending enrollments with class info
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select(`
          *,
          class:class_id (
            id,
            subject_id,
            subject:subject_id (id, name, level),
            teacher_id,
            status,
            start_date,
            end_date,
            schedule
          ),
          student:student_id (id, full_name, email)
        `)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false });

      if (enrollmentError) throw enrollmentError;

      // Process and format the data
      const formattedEnrollments = await Promise.all(
        (enrollments || []).map(async (enrollment: any) => {
          const subject = enrollment.class?.subject;
          const student = enrollment.student;
          
          // Find matching teachers for this subject
          const matchedTeachers = await findMatchingTeachers(subject?.id, student);
          
          return {
            id: enrollment.id,
            student_id: enrollment.student_id,
            class_id: enrollment.class_id,
            subject_id: subject?.id,
            subject_name: subject?.name || 'Unknown Subject',
            status: 'pending',
            created_at: enrollment.created_at,
            student: student,
            teacher_id: enrollment.class?.teacher_id,
            matched_teachers: matchedTeachers,
          };
        })
      );

      setPendingEnrollments(formattedEnrollments);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    }
    setLoading(false);
  }

  async function findMatchingTeachers(subjectId: string, student: any) {
    if (!subjectId) return [];

    try {
      // Get teachers who can teach this subject
      const { data: teacherSubjects, error: tsError } = await supabase
        .from('teacher_subjects')
        .select(`
          teacher_id,
          rate,
          users:teacher_id (
            id,
            full_name,
            email,
            teachers (
              profile_headline,
              years_experience
            )
          )
        `)
        .eq('subject_id', subjectId)
        .eq('is_active', true);

      if (tsError) throw tsError;

      if (!teacherSubjects || teacherSubjects.length === 0) return [];

      // Get teacher availability and current load
      const teachersWithData = await Promise.all(
        teacherSubjects.map(async (ts: any) => {
          const teacher = ts.users;
          const teacherProfile = teacher?.teachers || {};

          // Get teacher availability
          const { data: availability } = await supabase
            .from('teacher_availability')
            .select('day_of_week, start_time, end_time')
            .eq('teacher_id', ts.teacher_id);

          // Get active classes count
          const { count: activeClasses } = await supabase
            .from('classes')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', ts.teacher_id)
            .in('status', ['active', 'open']);

          // Calculate match score
          let matchScore = 70;
          if (availability && availability.length > 0) matchScore += 10;
          if (teacherProfile.years_experience > 5) matchScore += 10;
          if ((activeClasses || 0) < 3) matchScore += 10;

          return {
            id: teacher.id,
            full_name: teacher.full_name,
            email: teacher.email,
            profile_headline: teacherProfile?.profile_headline || '',
            years_experience: teacherProfile?.years_experience || 0,
            rate: ts.rate || 0,
            availability: availability || [],
            active_classes: activeClasses || 0,
            match_score: Math.min(matchScore, 100),
          };
        })
      );

      // Sort by match score
      return teachersWithData.sort((a, b) => b.match_score - a.match_score);

    } catch (error) {
      console.error('Error finding teachers:', error);
      return [];
    }
  }

  async function assignTeacher(enrollmentId: string, teacherId: string) {
    try {
      // Get the enrollment to find the class_id
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('id', enrollmentId)
        .single();

      if (enrollmentError) throw enrollmentError;

      // Update the class with the assigned teacher
      const { error: classError } = await supabase
        .from('classes')
        .update({ 
          teacher_id: teacherId,
          status: 'open'  // Change status to open once teacher is assigned
        })
        .eq('id', enrollment.class_id);

      if (classError) throw classError;

      // Update enrollment status
      const { error: updateError } = await supabase
        .from('enrollments')
        .update({ 
          payment_status: 'pending', // Keep as pending until payment is confirmed
          status: 'active'
        })
        .eq('id', enrollmentId);

      if (updateError) throw updateError;

      alert('✅ Teacher assigned successfully! The class is now open for enrollment.');
      setShowAssignModal(false);
      loadData();

    } catch (error: any) {
      console.error('Error assigning teacher:', error);
      alert('Error: ' + error.message);
    }
  }

  const getMatchColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Teacher Matching</h1>
            <p className="text-gray-500 text-sm">Match students with available teachers</p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
              {pendingEnrollments.length} pending matches
            </span>
          </div>
        </div>

        {pendingEnrollments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No pending enrollments to match.</p>
            <p className="text-sm text-gray-400 mt-2">When students enroll, they'll appear here for teacher assignment.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingEnrollments.map((enrollment) => (
              <div key={enrollment.id} className="bg-white rounded-lg shadow-lg p-6 border border-gray-100">
                {/* Student & Subject Info */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {enrollment.student?.full_name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{enrollment.student?.full_name || 'Unknown Student'}</h3>
                        <p className="text-sm text-gray-500">{enrollment.student?.email}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {enrollment.subject_name}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        Enrolled on {new Date(enrollment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedEnrollment(enrollment.id);
                        setMatchedTeachers(enrollment.matched_teachers || []);
                        setShowAssignModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                    >
                      Assign Teacher
                    </button>
                  </div>
                </div>

                {/* Matched Teachers Preview */}
                {enrollment.matched_teachers && enrollment.matched_teachers.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">👨‍🏫 Best Matches</p>
                    <div className="flex flex-wrap gap-2">
                      {enrollment.matched_teachers.slice(0, 3).map((teacher) => (
                        <span
                          key={teacher.id}
                          className={`px-3 py-1 text-sm rounded-full border ${getMatchColor(teacher.match_score)}`}
                        >
                          {teacher.full_name} ({teacher.match_score}% match)
                        </span>
                      ))}
                      {enrollment.matched_teachers.length > 3 && (
                        <span className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-600">
                          +{enrollment.matched_teachers.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Assign Teacher</h2>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {matchedTeachers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">No teachers available for this subject.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Please check teacher availability or add more teachers who can teach this subject.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matchedTeachers.map((teacher) => (
                    <div
                      key={teacher.id}
                      className="border rounded-lg p-4 hover:border-blue-500 transition cursor-pointer"
                      onClick={() => {
                        if (selectedEnrollment) {
                          assignTeacher(selectedEnrollment, teacher.id);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{teacher.full_name}</h4>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${getMatchColor(teacher.match_score)}`}>
                              {teacher.match_score}% Match
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">{teacher.email}</p>
                          {teacher.profile_headline && (
                            <p className="text-sm text-gray-600 mt-1">{teacher.profile_headline}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span>⭐ {teacher.years_experience} years exp</span>
                            <span>📚 {teacher.active_classes} active classes</span>
                            <span>💰 ${teacher.rate}/hr</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedEnrollment) {
                              assignTeacher(selectedEnrollment, teacher.id);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}