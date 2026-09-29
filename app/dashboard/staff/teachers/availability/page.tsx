// app/dashboard/staff/teachers/availability/page.tsx - 24-HOUR FORMAT
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface AvailabilitySlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  is_recurring: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TeacherAvailabilityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teacherName, setTeacherName] = useState('');
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);

  useEffect(() => {
    if (teacherId) {
      loadData();
    } else {
      router.push('/dashboard/staff/teachers');
    }
  }, [teacherId]);

  async function loadData() {
    setLoading(true);

    try {
      // Get teacher name
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', teacherId)
        .single();

      if (userData) setTeacherName(userData.full_name);

      // Load availability
      const { data: availData, error: availError } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('day_of_week')
        .order('start_time');

      if (availError) throw new Error(availError.message);

      if (availData && availData.length > 0) {
        const formattedData = availData.map((slot: any) => ({
          ...slot,
          is_available: slot.is_available ?? true,
          is_recurring: slot.is_recurring ?? true,
        }));
        setAvailability(formattedData);
      } else {
        // Default: Weekdays 9am-5pm (24-hour format)
        setAvailability([
          { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true },
          { day_of_week: 2, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true },
          { day_of_week: 3, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true },
          { day_of_week: 4, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true },
          { day_of_week: 5, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true },
        ]);
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      alert('Error: ' + error.message);
    }

    setLoading(false);
  }

  const updateAvailability = (index: number, field: string, value: any) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], [field]: value };
    setAvailability(updated);
  };

  const addAvailabilityRow = () => {
    setAvailability([
      ...availability,
      { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true, is_recurring: true }
    ]);
  };

  const removeAvailabilityRow = (index: number) => {
    if (availability.length <= 1) return;
    setAvailability(availability.filter((_, i) => i !== index));
  };

  async function handleSave() {
    setSaving(true);

    try {
      // Delete existing availability
      await supabase
        .from('teacher_availability')
        .delete()
        .eq('teacher_id', teacherId);

      // Insert new availability
      const availabilityData = availability
        .filter(slot => slot.is_available === true)
        .map(slot => ({
          teacher_id: teacherId,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_recurring: slot.is_recurring ?? true,
        }));

      if (availabilityData.length > 0) {
        const { error } = await supabase
          .from('teacher_availability')
          .insert(availabilityData);

        if (error) throw error;
      }

      alert('✅ Availability saved successfully!');
      router.push(`/dashboard/staff/view?id=${teacherId}`);
    } catch (error: any) {
      console.error('Error saving availability:', error);
      alert('Error: ' + error.message);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/dashboard/staff/view?id=${teacherId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Profile</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          📅 {teacherName}'s Availability
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="mb-4 text-sm text-gray-500">
          Set the days and times when {teacherName} is available for classes. (24-hour format)
        </div>

        <div className="space-y-3">
          {availability.map((slot, index) => (
            <div key={index} className="flex items-center gap-3 flex-wrap">
              <select
                value={slot.day_of_week}
                onChange={(e) => updateAvailability(index, 'day_of_week', parseInt(e.target.value))}
                className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {DAYS.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
              {/* ⭐ 24-hour format */}
              <input
                type="time"
                step="900"
                value={slot.start_time}
                onChange={(e) => updateAvailability(index, 'start_time', e.target.value)}
                className="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-500">to</span>
              <input
                type="time"
                step="900"
                value={slot.end_time}
                onChange={(e) => updateAvailability(index, 'end_time', e.target.value)}
                className="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={slot.is_available === true}
                  onChange={(e) => updateAvailability(index, 'is_available', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 focus:ring-blue-500"
                />
                Available
              </label>
              {availability.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAvailabilityRow(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  ✕ Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addAvailabilityRow}
          className="mt-4 text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Time Slot
        </button>

        <div className="mt-6 pt-6 border-t flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Availability'}
          </button>
          <Link href={`/dashboard/staff/view?id=${teacherId}`}>
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}