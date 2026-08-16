'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const SPECIALTIES = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
  'English', 'Literature', 'Writing', 'Speech', 'Drama',
  'History', 'Geography', 'Social Studies', 'Economics', 'Political Science',
  'Art', 'Design', 'Music', 'Photography', 'Digital Arts',
  'Computer Science', 'Programming', 'Web Development', 'AI', 'Data Science',
  'Physical Education', 'Sports', 'Health', 'Swimming', 'Coaching',
  'Languages', 'Chinese', 'Malay', 'Indonesian', 'Japanese', 'Korean', 'Spanish', 'French', 'Portuguese'
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CreateTeacherPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    bio: '',
    about: '',
    profile_headline: '',
    specialization: '',
    years_experience: 0,
    hourly_rate: 0,
    teaching_style: '',
    max_classes_per_day: 5,
  });

  const [availability, setAvailability] = useState([
    { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
    { day_of_week: 2, start_time: '09:00', end_time: '17:00', is_available: true },
    { day_of_week: 3, start_time: '09:00', end_time: '17:00', is_available: true },
    { day_of_week: 4, start_time: '09:00', end_time: '17:00', is_available: true },
    { day_of_week: 5, start_time: '09:00', end_time: '17:00', is_available: true },
  ]);

  const updateAvailability = (index: number, field: string, value: any) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], [field]: value };
    setAvailability(updated);
  };

  const addAvailabilityRow = () => {
    setAvailability([
      ...availability,
      { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }
    ]);
  };

  const removeAvailabilityRow = (index: number) => {
    if (availability.length <= 1) return;
    setAvailability(availability.filter((_, i) => i !== index));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. First, check if user exists or create one
      let userId = formData.email;
      
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', formData.email)
        .single();

      let user;
      if (!existingUser) {
        // Create user
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            email: formData.email,
            full_name: formData.full_name,
            role: 'teacher',
            is_active: true,
          })
          .select()
          .single();

        if (userError) throw userError;
        user = newUser;
      } else {
        user = existingUser;
      }

      // 2. Create teacher record
      const { data: teacherData, error: teacherError } = await supabase
        .from('teachers')
        .insert({
          id: user.id,
          specialization: formData.specialization,
          bio: formData.bio,
          about: formData.about,
          profile_headline: formData.profile_headline,
          hourly_rate: formData.hourly_rate,
          years_experience: formData.years_experience,
          teaching_style: formData.teaching_style,
          is_active: true,
        })
        .select()
        .single();

      if (teacherError) throw teacherError;

      // 3. Create availability slots
      const availabilityData = availability
        .filter(slot => slot.is_available)
        .map(slot => ({
          teacher_id: teacherData.id,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_recurring: true,
        }));

      if (availabilityData.length > 0) {
        const { error: availError } = await supabase
          .from('teacher_availability')
          .insert(availabilityData);

        if (availError) throw availError;
      }

      alert('✅ Teacher created successfully!');
      router.push('/dashboard/staff/teachers');
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      alert('Error: ' + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/staff/teachers">
          <button className="text-gray-600 hover:text-gray-900">← Back to Teachers</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Teacher</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hourly Rate ($)</label>
            <input
              type="number"
              value={formData.hourly_rate}
              onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={0}
              step={5}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Profile Headline</label>
          <input
            type="text"
            value={formData.profile_headline}
            onChange={(e) => setFormData({ ...formData, profile_headline: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Senior Mathematics Teacher"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Specialization</label>
          <input
            type="text"
            value={formData.specialization}
            onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Mathematics, Physics, Chemistry"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Short bio..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">About</label>
          <textarea
            value={formData.about}
            onChange={(e) => setFormData({ ...formData, about: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Detailed description..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Years Experience</label>
            <input
              type="number"
              value={formData.years_experience}
              onChange={(e) => setFormData({ ...formData, years_experience: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Teaching Style</label>
            <input
              type="text"
              value={formData.teaching_style}
              onChange={(e) => setFormData({ ...formData, teaching_style: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Interactive, Discussion-based"
            />
          </div>
        </div>

        {/* Availability */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">📅 Availability</h3>
            <button
              type="button"
              onClick={addAvailabilityRow}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Slot
            </button>
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
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={(e) => updateAvailability(index, 'start_time', e.target.value)}
                  className="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="time"
                  value={slot.end_time}
                  onChange={(e) => updateAvailability(index, 'end_time', e.target.value)}
                  className="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={slot.is_available}
                    onChange={(e) => updateAvailability(index, 'is_available', e.target.checked)}
                  />
                  Available
                </label>
                {availability.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAvailabilityRow(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Teacher'}
          </button>
          <Link href="/dashboard/staff/teachers">
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}