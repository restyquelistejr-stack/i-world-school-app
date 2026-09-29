// app/dashboard/classes/book/components/Confirmation.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { BookingData, GeneratedSession } from '../types';
import { DAYS_OF_WEEK } from '../types';
import { format, parseISO } from 'date-fns';

interface ConfirmationProps {
  data: BookingData;
  onBack: () => void;
  onSubmit: (data: BookingData) => Promise<void>;
}

export default function Confirmation({ data, onBack, onSubmit }: ConfirmationProps) {
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  
  // Detailed fields
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [courseName, setCourseName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [level, setLevel] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [hasSessions, setHasSessions] = useState(false);
  const [isGroupClass, setIsGroupClass] = useState(false);

  useEffect(() => {
    loadDetails();
  }, []);

  async function loadDetails() {
    setLoadingDetails(true);
    try {
      // Check if this is a group class booking
      setIsGroupClass(!!data.isGroupClassBooking || !!data.selected_group_class_id);

      // 1. Load student details
      if (data.student_id) {
        const { data: student } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', data.student_id)
          .single();
        if (student) {
          setStudentName(student.full_name || '');
          setStudentEmail(student.email || '');
        }
      }

      // 2. Load course name
      if (data.course_id) {
        const { data: course } = await supabase
          .from('courses')
          .select('name')
          .eq('id', data.course_id)
          .single();
        if (course) setCourseName(course.name);
      }

      // 3. Load module name and level
      if (data.module_id) {
        const { data: module } = await supabase
          .from('course_modules')
          .select('title, level')
          .eq('id', data.module_id)
          .single();
        if (module) {
          setModuleName(module.title || '');
          setLevel(module.level || 'N/A');
        }
      }

      // 4. Load teacher name
      if (data.teacher_id) {
        const { data: teacher } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', data.teacher_id)
          .single();
        if (teacher) setTeacherName(teacher.full_name || '');
      }

      // 5. Check if we have sessions
      const sessions = data.generated_sessions || [];
      if (sessions.length > 0) {
        setHasSessions(true);
        
        // For group classes, get room from first session
        const firstSession = sessions[0];
        if (firstSession.room_name) {
          setRoomName(firstSession.room_name);
        } else if (firstSession.room_id) {
          const { data: room } = await supabase
            .from('rooms')
            .select('name')
            .eq('id', firstSession.room_id)
            .single();
          if (room) setRoomName(room.name);
        }
        
        // Set time display from first session
        if (firstSession.start_time && firstSession.end_time) {
          setTimeDisplay(`${firstSession.start_time} - ${firstSession.end_time}`);
        }
      } else if (data.room_id) {
        // Fallback: load room from room_id
        const { data: room } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', data.room_id)
          .single();
        if (room) setRoomName(room.name);
      }

      // 6. Build time display from start_time if not set
      if (!timeDisplay && data.start_time) {
        const endTime = data.end_time || addHoursToTime(data.start_time, data.hours_per_session || 2);
        setTimeDisplay(`${data.start_time} - ${endTime}`);
      } else if (!timeDisplay && data.start_date) {
        setTimeDisplay(`Starts: ${data.start_date}`);
      }

      console.log('Confirmation data loaded:', {
        studentName,
        courseName,
        moduleName,
        level,
        teacherName,
        roomName,
        timeDisplay,
        hasSessions,
        isGroupClass,
        sessionCount: sessions.length,
        data
      });

    } catch (error) {
      console.error('Error loading details:', error);
    }
    setLoadingDetails(false);
  }

  function addHoursToTime(time: string, hours: number): string {
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = (h || 0) * 60 + (m || 0) + (hours || 2) * 60;
    const newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  const getDayLabels = (days?: number[]) => {
    if (!days || days.length === 0) return 'N/A';
    return days.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(', ');
  };

  const handleSubmit = async () => {
    if (!agreed) {
      alert('Please agree to the terms and conditions');
      return;
    }
    
    // Validate required fields
    if (!data.student_id) {
      alert('Student is required');
      return;
    }
    if (!data.course_id) {
      alert('Course is required');
      return;
    }
    
    // For group classes, we need selected_group_class_id
    if (isGroupClass && !data.selected_group_class_id) {
      alert('Group class is required');
      return;
    }
    
    // For private classes, we need sessions or start date
    if (!isGroupClass && !data.start_date && !data.generated_sessions?.length) {
      alert('Start date or generated sessions are required');
      return;
    }
    
    setSubmitting(true);
    try {
      const submitData: BookingData = {
        ...data,
        isGroupClassBooking: isGroupClass,
      };
      
      console.log('Submitting confirmation data:', submitData);
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting:', error);
      alert('Failed to submit booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingDetails) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isTrial = data.action === 'trial';
  const sessions = data.generated_sessions || [];

  return (
    <div className="space-y-6">
      {/* Booking Summary */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-4">📋 Booking Summary</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Student */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Student</p>
            <p className="font-medium text-gray-900">{studentName || 'N/A'}</p>
            {studentEmail && (
              <p className="text-xs text-gray-500">{studentEmail}</p>
            )}
          </div>
          
          {/* Course */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Course</p>
            <p className="font-medium text-gray-900">{courseName || 'N/A'}</p>
          </div>
          
          {/* Module */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Module</p>
            <p className="font-medium text-gray-900">{moduleName || 'N/A'}</p>
          </div>
          
          {/* Level */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Level</p>
            <p className="font-medium text-gray-900 capitalize">{level || 'N/A'}</p>
          </div>
          
          {/* Format */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Format</p>
            <p className="font-medium text-gray-900 capitalize">
              {isGroupClass ? '👥 Group' : '👤 Private'}
            </p>
          </div>
          
          {/* Action */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Action</p>
            <p className="font-medium text-gray-900 capitalize">
              {isTrial ? '🎯 Trial' : '📝 Registration'}
            </p>
          </div>
          
          {/* Teacher */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Teacher</p>
            <p className="font-medium text-gray-900">{teacherName || 'Auto-matched'}</p>
          </div>
          
          {/* Room */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Room</p>
            <p className="font-medium text-gray-900">{roomName || 'TBD'}</p>
          </div>
          
          {/* Date */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Start Date</p>
            <p className="font-medium text-gray-900">{data.start_date || data.trial_date || 'TBD'}</p>
          </div>
          
          {/* Time */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Time</p>
            <p className="font-medium text-gray-900">{timeDisplay || 'TBD'}</p>
          </div>
          
          {/* Hours per Session (Private only) */}
          {!isGroupClass && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Hours per Session</p>
              <p className="font-medium text-gray-900">{data.hours_per_session || 2} hours</p>
            </div>
          )}
          
          {/* Number of Sessions */}
          {!isTrial && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Number of Sessions</p>
              <p className="font-medium text-gray-900">{data.number_of_sessions || sessions.length || 'N/A'}</p>
            </div>
          )}
          
          {/* Preferred Days (Private only) */}
          {!isGroupClass && (
            <div className="md:col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Preferred Days</p>
              <p className="font-medium text-gray-900">{getDayLabels(data.preferred_days)}</p>
            </div>
          )}
          
          {/* ✅ Sessions Schedule */}
          {sessions.length > 0 && (
            <div className="md:col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Schedule ({sessions.length} sessions)</p>
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                {sessions.map((session, idx) => (
                  <div key={idx} className="text-sm text-gray-600 flex items-center gap-3 p-1 hover:bg-white rounded">
                    <span className="font-medium text-gray-700 w-12">#{session.session_number}</span>
                    <span>{format(parseISO(session.date), 'MMM d, yyyy')}</span>
                    <span className="text-gray-500">{session.start_time} - {session.end_time}</span>
                    <span className="text-xs text-gray-400">🏠 {session.room_name || 'TBD'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Group Class Info */}
          {isGroupClass && data.selected_group_class_id && (
            <div className="md:col-span-2 bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-600 font-medium">👥 Group Class Enrollment</p>
              <p className="text-sm text-blue-700">
                Student will be enrolled in the selected group class.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Trial Info */}
      {isTrial && (
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <p className="text-sm text-purple-700">
            🎯 This is a <strong>trial class</strong>. After the trial, you can convert to a full course registration.
          </p>
        </div>
      )}

      {/* Terms */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">I agree to the terms and conditions</p>
            <p className="text-xs text-gray-400">
              By proceeding, you agree to our booking policy, cancellation policy, and privacy policy.
            </p>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !agreed}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Submitting...
            </>
          ) : (
            `✅ Confirm ${isTrial ? 'Trial' : 'Registration'}`
          )}
        </button>
      </div>
    </div>
  );
}