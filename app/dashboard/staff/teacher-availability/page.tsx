'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  availability: {
    id: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
  }[];
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TeacherAvailabilityPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState({
    day_of_week: '',
    start_time: '09:00',
    end_time: '17:00',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          teacher_availability (
            id,
            day_of_week,
            start_time,
            end_time
          )
        `)
        .eq('role', 'teacher')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;

      // --- FIX: Map the Supabase 'teacher_availability' to the interface 'availability' ---
      const formattedData = (data || []).map((teacher: any) => ({
        ...teacher,
        availability: teacher.teacher_availability || [],
      }));
      // --------------------------------------------------------------------------------

      setTeachers(formattedData);
    } catch (error) {
      console.error('Error loading teachers:', error);
      alert('Failed to load teachers');
    }
    setLoading(false);
  }

  async function addAvailability(teacherId: string) {
    if (!newSlot.day_of_week) {
      alert('Please select a day');
      return;
    }

    try {
      const { error } = await supabase
        .from('teacher_availability')
        .insert({
          teacher_id: teacherId,
          day_of_week: newSlot.day_of_week,
          start_time: newSlot.start_time,
          end_time: newSlot.end_time,
        });

      if (error) throw error;
      alert('✅ Availability added!');
      loadData();
      setNewSlot({
        day_of_week: '',
        start_time: '09:00',
        end_time: '17:00',
      });
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function removeAvailability(id: string) {
    if (!confirm('Remove this availability slot?')) return;

    try {
      const { error } = await supabase
        .from('teacher_availability')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Availability removed!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

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
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/staff/directory">
            <button className="text-gray-600 hover:text-gray-900">← Back to Staff</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Teacher Availability</h1>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teachers.map((teacher) => (
              <div key={teacher.id} className="border rounded-lg p-4 hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{teacher.full_name}</h3>
                  <span className="text-sm text-gray-500">{teacher.email}</span>
                </div>

                {/* Current Availability */}
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700">Current Availability</p>
                  {teacher.availability && teacher.availability.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {teacher.availability.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                          <span>
                            <span className="font-medium">{a.day_of_week}</span>
                            <span className="text-gray-500 ml-2">{a.start_time} - {a.end_time}</span>
                          </span>
                          <button
                            onClick={() => removeAvailability(a.id)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">No availability set</p>
                  )}
                </div>

                {/* Add Availability */}
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-2">Add Availability</p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedTeacher === teacher.id ? newSlot.day_of_week : ''}
                      onChange={(e) => {
                        setSelectedTeacher(teacher.id);
                        setNewSlot({ ...newSlot, day_of_week: e.target.value });
                      }}
                      className="text-sm px-2 py-1 border rounded"
                    >
                      <option value="">Day</option>
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={selectedTeacher === teacher.id ? newSlot.start_time : '09:00'}
                      onChange={(e) => {
                        setSelectedTeacher(teacher.id);
                        setNewSlot({ ...newSlot, start_time: e.target.value });
                      }}
                      className="text-sm px-2 py-1 border rounded"
                    />
                    <input
                      type="time"
                      value={selectedTeacher === teacher.id ? newSlot.end_time : '17:00'}
                      onChange={(e) => {
                        setSelectedTeacher(teacher.id);
                        setNewSlot({ ...newSlot, end_time: e.target.value });
                      }}
                      className="text-sm px-2 py-1 border rounded"
                    />
                    <button
                      onClick={() => addAvailability(teacher.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}