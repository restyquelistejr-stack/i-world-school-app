// app/dashboard/classes/book/components/Success.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookingData } from '../types';

interface SuccessProps {
  data: BookingData;
  onDone?: () => void; // ⭐ Add this prop
}

export default function Success({ data, onDone }: SuccessProps) {
  const router = useRouter();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isGroupClass, setIsGroupClass] = useState(false);

  useEffect(() => {
    const storedId = sessionStorage.getItem('lastBookingId');
    if (storedId) {
      setBookingId(storedId);
    }
    setIsGroupClass(!!data.isGroupClassBooking);
  }, [data]);

  const handleDone = () => {
    if (onDone) {
      onDone();
    } else {
      router.push('/dashboard/classes/management');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow p-8 border border-gray-200 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isGroupClass ? '✅ Enrolled in Group Class!' : '✅ Booking Confirmed!'}
        </h2>
        
        <p className="text-gray-600 mb-6">
          {isGroupClass 
            ? 'The student has been successfully enrolled in the group class.'
            : 'The booking has been successfully created and confirmed.'
          }
        </p>

        {bookingId && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500">Booking Reference</p>
            <p className="font-mono font-bold text-gray-900">{bookingId}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleDone}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            📋 View All Classes
          </button>
          
          {isGroupClass ? (
            <Link href={`/dashboard/classes/group-class/view?id=${data.selected_group_class_id}`}>
              <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                👥 View Group Class
              </button>
            </Link>
          ) : bookingId && (
            <Link href={`/dashboard/classes/details?id=${bookingId}`}>
              <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                📖 View Booking Details
              </button>
            </Link>
          )}
          
          <button
            onClick={() => router.push('/dashboard/classes/book')}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            📚 New Booking
          </button>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h4 className="font-medium text-blue-800 mb-2">📋 Next Steps</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          {isGroupClass ? (
            <>
              <li>✅ Student is now enrolled in the group class</li>
              <li>📅 The student will attend all scheduled sessions</li>
              <li>👥 You can view the group class details from the link above</li>
              <li>📊 You can track attendance from the class management page</li>
            </>
          ) : (
            <>
              <li>📅 The class schedule has been confirmed</li>
              <li>👨‍🏫 The teacher has been assigned</li>
              <li>🏠 The room has been reserved</li>
              <li>📊 You can track attendance from the class management page</li>
              {data.action === 'trial' && (
                <li>🔄 After the trial, convert to a full registration</li>
              )}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}