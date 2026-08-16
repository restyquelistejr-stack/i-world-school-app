'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Teacher {
  id: string;
  specialization: string;
  bio: string;
  about: string;
  profile_headline: string;
  hourly_rate: number;
  years_experience: number;
  teaching_style: string;
  is_active: boolean;
  email: string;
  full_name: string;
  availability_count: number;
}

export default function TeacherProfilePage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [availability, setAvailability] = useState<any[]>([]);

  useEffect(() => {
    if (teacherId) {
      loadTeacher();
    }
  }, [teacherId]);

  async function loadTeacher() {
    setLoading(true);
    try {
      // 1. Get teacher data
      const { data: teacherData, error: teacherError } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .single();

      if (teacherError) throw teacherError;

      // 2. Get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', teacherId)
        .single();

      if (userError) {
        console.error('Error loading user:', userError);
      }

      // 3. Get availability
      const { data: availData, error: availError } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('day_of_week')
        .order('start_time');

      if (availError) {
        console.error('Error loading availability:', availError);
      }

      setTeacher({
        ...teacherData,
        email: userData?.email || 'No email',
        full_name: userData?.full_name || 'Unknown',
        availability_count: availData?.length || 0,
      });
      setAvailability(availData || []);
    } catch (error) {
      console.error('Error loading teacher:', error);
      alert('Failed to load teacher');
    }
    setLoading(false);
  }

  const getDayName = (day: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-gray-900">Teacher not found</h2>
        <Link href="/dashboard/staff/teachers">
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Back to Teachers
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/staff/teachers">
            <button className="text-gray-600 hover:text-gray-900">← Back to Teachers</button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Profile</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/staff/teachers/${teacherId}/edit`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              ✏️ Edit Profile
            </button>
          </Link>
          <Link href={`/dashboard/staff/teachers/${teacherId}/availability`}>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              📅 Availability
            </button>
          </Link>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">{teacher.full_name}</h2>
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                teacher.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {teacher.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-gray-500">{teacher.email}</p>
            {teacher.profile_headline && (
              <p className="text-sm text-gray-600 mt-1">{teacher.profile_headline}</p>
            )}
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>💰 ${teacher.hourly_rate}/hr</div>
            <div>📅 {teacher.years_experience} years</div>
            <div>📋 {teacher.availability_count} slots</div>
          </div>
        </div>

        {teacher.specialization && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <span className="font-medium text-blue-700">Specialization:</span>
            <span className="ml-2 text-blue-600">{teacher.specialization}</span>
          </div>
        )}

        {teacher.bio && (
          <div className="mt-4">
            <h3 className="font-semibold text-gray-700">Bio</h3>
            <p className="text-gray-600 mt-1">{teacher.bio}</p>
          </div>
        )}

        {teacher.about && (
          <div className="mt-4">
            <h3 className="font-semibold text-gray-700">About</h3>
            <p className="text-gray-600 mt-1">{teacher.about}</p>
          </div>
        )}

        {teacher.teaching_style && (
          <div className="mt-4">
            <h3 className="font-semibold text-gray-700">Teaching Style</h3>
            <p className="text-gray-600 mt-1">{teacher.teaching_style}</p>
          </div>
        )}
      </div>

      {/* Availability Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-700 mb-4">📅 Availability</h3>
        {availability.length === 0 ? (
          <p className="text-gray-500">No availability set</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availability.map((slot, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="font-medium w-24">{getDayName(slot.day_of_week)}</span>
                <span className="text-gray-600">
                  {slot.start_time} - {slot.end_time}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}