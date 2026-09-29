// app/dashboard/classes/confirmation-print/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';
import Link from 'next/link';

interface BookingDetails {
  id: string;
  booking_type: string;
  format: string;
  student_name: string;
  student_email: string;
  student_phone?: string;
  course_name: string;
  course_id: string;
  module_name: string;
  module_id?: string;
  level: string;
  teacher_name: string;
  teacher_id: string;
  room_name: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  class_code: string;
  hours: number;
  session_type: string;
  created_at: string;
}

export default function ConfirmationPrintPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bookingId) {
      loadBookingDetails();
    } else {
      setLoading(false);
      setError('No booking ID provided');
    }
  }, [bookingId]);

  async function loadBookingDetails() {
    setLoading(true);
    setError(null);
    try {
      if (!bookingId) {
        setLoading(false);
        setError('No booking ID provided');
        return;
      }

      // ✅ FIXED: Query trial_class_bookings directly
      const { data: trial, error: trialError } = await supabase
        .from('trial_class_bookings')
        .select(`
          *,
          course:course_id (id, name, description),
          module:module_id (id, title, level, description),
          teacher:selected_teacher_id (id, full_name, email, phone),
          room:room_id (id, name, capacity),
          student:student_id (id, full_name, email, phone)
        `)
        .eq('id', bookingId)
        .single();

      if (!trialError && trial) {
        let studentName = 'Student';
        let studentEmail = 'student@email.com';
        let studentPhone = '';
        
        if (trial.student) {
          studentName = trial.student.full_name || 'Student';
          studentEmail = trial.student.email || 'student@email.com';
          studentPhone = trial.student.phone || '';
        }

        // Format the date and time properly
        let formattedDate = 'TBD';
        let formattedStartTime = 'TBD';
        let formattedEndTime = 'TBD';

        if (trial.selected_date) {
          formattedDate = format(new Date(trial.selected_date), 'EEEE, MMMM d, yyyy');
        }

        if (trial.selected_time) {
          const [hours, minutes] = trial.selected_time.split(':');
          const startDate = new Date();
          startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          formattedStartTime = format(startDate, 'h:mm a');

          const endDate = new Date(startDate);
          const durationHours = trial.hours || 2;
          endDate.setHours(endDate.getHours() + durationHours);
          formattedEndTime = format(endDate, 'h:mm a');
        }

        setDetails({
          id: trial.id,
          booking_type: 'Trial Class',
          format: trial.session_type === 'private' ? 'Private Lesson' : 'Group Session',
          student_name: studentName,
          student_email: studentEmail,
          student_phone: studentPhone,
          course_name: trial.course?.name || 'N/A',
          course_id: trial.course_id || '',
          module_name: trial.module?.title || 'N/A',
          module_id: trial.module_id || '',
          level: trial.module?.level || 'N/A',
          teacher_name: trial.teacher?.full_name || 'Not Assigned',
          teacher_id: trial.selected_teacher_id || '',
          room_name: trial.room?.name || 'TBD',
          room_id: trial.room_id || '',
          date: formattedDate,
          start_time: formattedStartTime,
          end_time: formattedEndTime,
          status: trial.status || 'confirmed',
          class_code: `TRIAL-${trial.id.slice(0, 8)}`,
          hours: trial.hours || 2,
          session_type: trial.session_type || 'private',
          created_at: trial.created_at || new Date().toISOString(),
        });
        return;
      }

      // If not found in trial_class_bookings, try regular bookings
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          course:course_id (id, name),
          teacher:teacher_id (id, full_name, email, phone),
          room:room_id (id, name, capacity),
          class:class_id (class_code),
          student:student_id (id, full_name, email, phone)
        `)
        .eq('id', bookingId)
        .single();

      if (!bookingError && booking) {
        // ... handle regular bookings
        setError('Regular booking found but not fully implemented in this view');
        return;
      }

      setError('Booking not found');
    } catch (error) {
      console.error('Error loading booking details:', error);
      setError('Error loading booking details');
    }
    setLoading(false);
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      draft: 'bg-gray-100 text-gray-700',
      cancelled: 'bg-red-100 text-red-700',
      completed: 'bg-blue-100 text-blue-700',
      active: 'bg-green-100 text-green-700',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600">Booking not found</h2>
        <p className="text-gray-500">{error || "The booking you're looking for doesn't exist."}</p>
        <div className="mt-4 flex justify-center gap-4">
          <Link
            href="/dashboard/classes/management"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Back to Management
          </Link>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white min-h-screen" id="print-area">
      {/* School Header */}
      <div className="text-center border-b pb-6 mb-6">
        <h1 className="text-2xl font-bold text-blue-600">🏫 iWorld Learning Center</h1>
        <p className="text-sm text-gray-500">Booking Confirmation</p>
        <div className="text-xs text-gray-400 mt-1">
          <span>Booking ID: {details.class_code}</span>
          <span className="mx-2">•</span>
          <span>Date: {format(new Date(), 'MMMM d, yyyy')}</span>
        </div>
      </div>

      {/* Status Badge */}
      <div className="text-center mb-6">
        <span className={`inline-block px-6 py-2 rounded-full text-sm font-semibold ${getStatusColor(details.status)}`}>
          {details.status.toUpperCase()}
        </span>
      </div>

      {/* Booking Details */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {details.booking_type} - {details.format}
          </h2>
          <p className="text-gray-500">Class Code: {details.class_code}</p>
        </div>

        {/* Student & Teacher Info */}
        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Student</p>
            <p className="font-semibold text-gray-900">{details.student_name}</p>
            <p className="text-sm text-gray-500">{details.student_email}</p>
            {details.student_phone && (
              <p className="text-sm text-gray-500">📞 {details.student_phone}</p>
            )}
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Teacher</p>
            <p className="font-semibold text-gray-900">{details.teacher_name}</p>
            <p className="text-sm text-gray-500">ID: {details.teacher_id || 'N/A'}</p>
          </div>
        </div>

        {/* Course & Module Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Course</p>
            <p className="font-semibold text-gray-900">{details.course_name}</p>
            <p className="text-sm text-gray-500">ID: {details.course_id}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Level</p>
            <p className="font-semibold text-gray-900">{details.level}</p>
          </div>
          <div className="col-span-2 bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Module</p>
            <p className="font-semibold text-gray-900">{details.module_name}</p>
            <p className="text-sm text-gray-500">ID: {details.module_id || 'N/A'}</p>
          </div>
        </div>

        {/* Schedule & Room Info */}
        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Date</p>
            <p className="font-semibold text-gray-900">{details.date}</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Time</p>
            <p className="font-semibold text-gray-900">{details.start_time} - {details.end_time}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Room</p>
            <p className="font-semibold text-gray-900">{details.room_name}</p>
            <p className="text-sm text-gray-500">ID: {details.room_id || 'TBD'}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Duration</p>
            <p className="font-semibold text-gray-900">{details.hours} hours</p>
          </div>
          <div className="col-span-2 bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-400 font-medium uppercase">Booking Type</p>
            <p className="font-semibold text-gray-900">{details.booking_type}</p>
            <p className="text-sm text-gray-500">Format: {details.format}</p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="border-t pt-4 mt-4 bg-yellow-50 p-4 rounded-lg">
          <p className="text-sm text-gray-700">
            📧 A confirmation email has been sent to <strong>{details.student_email}</strong>
          </p>
          <p className="text-sm text-gray-700 mt-1">
            ⏰ Please arrive <strong>5-10 minutes</strong> before the scheduled time.
          </p>
          <p className="text-sm text-gray-700 mt-1">
            📍 Location: {details.room_name}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            🎯 This is a trial class. After the trial, you can convert to a full course.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t mt-8 pt-4 text-center text-xs text-gray-400">
        <p>This is a system-generated confirmation.</p>
        <p>For any changes or cancellations, please contact the admin.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <button
            onClick={() => window.print()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            🖨️ Print
          </button>
          <Link
            href="/dashboard/classes/management"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
          >
            Back to Management
          </Link>
          <Link
            href={`/dashboard/classes/trial-to-register?trialId=${details.id}`}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
          >
            🔄 Convert to Class
          </Link>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}