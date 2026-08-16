'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';

interface Enrollment {
  id: string;
  class_id: string;
  class_code: string;
  course_name: string;
  teacher_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  status: string;
}

export default function StudentEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('Loading...');

  useEffect(() => {
    loadStudentData();
  }, []);

  async function loadStudentData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStudentName('Not Logged In');
        setLoading(false);
        return;
      }

      // Get student name
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .single();
      setStudentName(userData?.full_name || 'Student');

      // FIRST: Get all enrollments for this student
      const { data: enrollData, error: enrollError } = await supabase
        .from('class_enrollments')
        .select(`
          id,
          class_id,
          classes:class_id (
            id,
            class_code,
            course:course_id ( name ),
            teacher:teacher_id ( full_name ),
            room:room_id ( name )
          )
        `)
        .eq('student_id', user.id);

      if (enrollError) {
        console.error('Enrollment query error:', enrollError);
        throw enrollError;
      }

      console.log('Found enrollments:', enrollData?.length || 0);

      if (!enrollData || enrollData.length === 0) {
        setEnrollments([]);
        setLoading(false);
        return;
      }

      // SECOND: Get class IDs
      const classIds = enrollData.map((e: any) => e.class_id).filter(Boolean);
      
      if (classIds.length === 0) {
        setEnrollments([]);
        setLoading(false);
        return;
      }

      // THIRD: Get bookings for these classes
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('class_id, start_time, end_time')
        .in('class_id', classIds)
        .order('start_time', { ascending: true });

      if (bookingsError) {
        console.error('Bookings query error:', bookingsError);
        throw bookingsError;
      }

      console.log('Found bookings:', bookingsData?.length || 0);

      // FOURTH: Merge data properly
      const merged: Enrollment[] = enrollData.map((e: any) => {
        // Handle the classes data - it might be an array or object
        let classData = e.classes;
        if (Array.isArray(classData)) {
          classData = classData[0] || {};
        }
        
        const booking = bookingsData?.find((b: any) => b.class_id === e.class_id);
        
        // Get course name from nested structure
        let courseName = 'Unknown Course';
        if (classData.course) {
          if (Array.isArray(classData.course)) {
            courseName = classData.course[0]?.name || 'Unknown Course';
          } else {
            courseName = classData.course.name || 'Unknown Course';
          }
        }

        return {
          id: e.id || e.class_id,
          class_id: e.class_id,
          class_code: classData.class_code || 'N/A',
          course_name: courseName,
          teacher_name: classData.teacher?.full_name || 'TBD',
          room_name: classData.room?.name || 'TBD',
          start_time: booking?.start_time || 'TBD',
          end_time: booking?.end_time || 'TBD',
          status: 'Active',
        };
      });

      setEnrollments(merged);
    } catch (error: any) {
      console.error('Error loading student data:', error);
      alert('Failed to load enrollments. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📚 My Enrollments</h1>
        <p className="text-sm text-gray-500">Welcome, <span className="font-medium text-gray-800">{studentName}</span></p>
        <p className="text-xs text-gray-400 mt-1">
          {enrollments.length} class{enrollments.length !== 1 ? 'es' : ''} enrolled
        </p>
      </div>

      {enrollments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center border border-gray-200">
          <p className="text-gray-500">You are not enrolled in any active classes yet.</p>
          <p className="text-sm text-gray-400 mt-2">Contact your administrator to enroll in classes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {enrollments.map((e) => (
            <div key={e.id} className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-bold text-lg text-gray-900">{e.course_name}</div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <span>📖 <span className="font-mono">{e.class_code}</span></span>
                    <span>🧑‍🏫 {e.teacher_name}</span>
                    <span>📍 {e.room_name}</span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    {e.start_time !== 'TBD' ? (
                      <span>🗓️ {format(parseISO(e.start_time), 'MMM d, yyyy')} • {format(parseISO(e.start_time), 'h:mm a')} - {format(parseISO(e.end_time), 'h:mm a')}</span>
                    ) : (
                      <span className="text-yellow-600">⏳ Schedule pending confirmation</span>
                    )}
                  </div>
                </div>
                <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium whitespace-nowrap ml-2">
                  {e.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}