// app/dashboard/staff/teachers/edit/page.tsx
// ⭐ v3.10: Now also edits users table (name, email, phone, gender, etc.)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const TEACHER_TYPES = ['full-time', 'part-time'];

interface TeacherData {
  specialization: string;
  teacher_type: 'full-time' | 'part-time';
  profile_headline: string;
  bio: string;
  about: string;
  hourly_rate: number;
  years_experience: number;
  teaching_style: string;
  is_active: boolean;
}

interface UserData {
  full_name: string;
  email: string;
  phone: string;
  gender: string;
}

export default function EditTeacherPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teacherRowExists, setTeacherRowExists] = useState(false);

  const [userForm, setUserForm] = useState<UserData>({
    full_name: '',
    email: '',
    phone: '',
    gender: '',
  });

  const [formData, setFormData] = useState<TeacherData>({
    specialization: '',
    teacher_type: 'full-time',
    profile_headline: '',
    bio: '',
    about: '',
    hourly_rate: 0,
    years_experience: 0,
    teaching_style: '',
    is_active: true,
  });

  useEffect(() => {
    if (teacherId) {
      loadTeacher();
    } else {
      router.push('/dashboard/staff/teachers');
    }
  }, [teacherId]);

  async function loadTeacher() {
    setLoading(true);

    try {
      // 1. Load teacher row (may not exist)
      const { data: teacherData, error: teacherError } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .maybeSingle();

      if (teacherError) {
        console.warn('Teacher row fetch error:', teacherError);
      }

      if (teacherData) {
        setTeacherRowExists(true);
        setFormData({
          specialization: teacherData.specialization || '',
          teacher_type: (teacherData.teacher_type as 'full-time' | 'part-time') || 'full-time',
          profile_headline: teacherData.profile_headline || '',
          bio: teacherData.bio || '',
          about: teacherData.about || '',
          hourly_rate: teacherData.hourly_rate || 0,
          years_experience: teacherData.years_experience || 0,
          teaching_style: teacherData.teaching_style || '',
          is_active: teacherData.is_active ?? true,
        });
      }

      // 2. Load user row
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('full_name, email, phone, gender')
        .eq('id', teacherId)
        .single();

      if (userError) throw new Error(userError.message);

      setUserForm({
        full_name: userData.full_name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        gender: userData.gender || '',
      });

    } catch (error: any) {
      console.error('Error loading teacher:', error);
      alert('Error: ' + error.message);
    }

    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      // 1. Update users table
      const { error: userError } = await supabase
        .from('users')
        .update({
          full_name: userForm.full_name,
          email: userForm.email,
          phone: userForm.phone || null,
          gender: userForm.gender || null,
        })
        .eq('id', teacherId);

      if (userError) throw new Error('Users update failed: ' + userError.message);

      // 2. Upsert teachers row
      const { error: teacherError } = await supabase
        .from('teachers')
        .upsert(
          {
            id: teacherId,
            specialization: formData.specialization || null,
            teacher_type: formData.teacher_type,
            profile_headline: formData.profile_headline || null,
            bio: formData.bio || null,
            about: formData.about || null,
            hourly_rate: formData.hourly_rate || 0,
            years_experience: formData.years_experience || 0,
            teaching_style: formData.teaching_style || null,
            is_active: formData.is_active,
          },
          { onConflict: 'id' }
        );

      if (teacherError) throw new Error('Teachers upsert failed: ' + teacherError.message);

      alert('✅ Teacher updated successfully!');
      router.push(`/dashboard/staff/teachers/view?id=${teacherId}`);
    } catch (error: any) {
      console.error('Error updating teacher:', error);
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
        <Link href={`/dashboard/staff/teachers/view?id=${teacherId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Profile</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Edit Teacher: {userForm.full_name}
        </h1>
        {!teacherRowExists && (
          <span className="px-3 py-1 text-xs bg-amber-100 text-amber-800 rounded-full">
            ⚠️ No teacher profile yet — will be created on save
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">

        {/* ---------- User / Profile Info ---------- */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">👤 Profile Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input
                type="text"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                ⚠️ Changing email may affect login credentials.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="text"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+1234567890"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gender</label>
              <select
                value={userForm.gender}
                onChange={(e) => setUserForm({ ...userForm, gender: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* ---------- Teacher Details ---------- */}
        <div className="border-t pt-4">
          <h2 className="font-semibold text-gray-800 mb-3">🎓 Teacher Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Teacher Type *</label>
              <select
                value={formData.teacher_type}
                onChange={(e) => setFormData({ ...formData, teacher_type: e.target.value as 'full-time' | 'part-time' })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                {TEACHER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Specialization</label>
              <input
                type="text"
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Mathematics, English"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Profile Headline</label>
              <input
                type="text"
                value={formData.profile_headline}
                onChange={(e) => setFormData({ ...formData, profile_headline: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Senior Mathematics Teacher"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Short bio..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">About</label>
              <textarea
                value={formData.about}
                onChange={(e) => setFormData({ ...formData, about: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Detailed description..."
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
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Teaching Style</label>
              <input
                type="text"
                value={formData.teaching_style}
                onChange={(e) => setFormData({ ...formData, teaching_style: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Interactive, Discussion-based"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active (teacher profile)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link href={`/dashboard/staff/teachers/view?id=${teacherId}`}>
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}