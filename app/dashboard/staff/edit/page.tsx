// app/dashboard/staff/edit/page.tsx
// ⭐ v3.10: Now upserts teachers row (creates if missing) + edits email
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const ROLES = ['admin', 'staff', 'teacher', 'facilities', 'hr', 'accounting'];
const GENDERS = ['male', 'female', 'other'];
const TEACHER_TYPES = ['full-time', 'part-time'];

export default function StaffEditPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffId = searchParams.get('id');

  const isEditMode = !!staffId;

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [teacherRowExists, setTeacherRowExists] = useState(false);

  // Profile form (users table)
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    address: '',
    employee_id: '',
    join_date: '',
    emergency_contact: '',
    emergency_phone: '',
    role: 'staff',
    is_active: true,
  });

  // Teacher form (teachers table)
  const [teacherForm, setTeacherForm] = useState({
    specialization: '',
    teacher_type: 'full-time' as 'full-time' | 'part-time',
    profile_headline: '',
    bio: '',
    about: '',
    hourly_rate: 0,
    years_experience: 0,
    teaching_style: '',
    is_active: true,
  });

  useEffect(() => {
    if (isEditMode && staffId) {
      loadStaffData();
    }
  }, [staffId]);

  async function loadStaffData() {
    setLoading(true);

    try {
      // 1. Load user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', staffId)
        .single();

      if (userError) throw new Error(userError.message);

      setProfileForm({
        full_name: userData.full_name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        gender: userData.gender || '',
        date_of_birth: userData.date_of_birth || '',
        address: userData.address || '',
        employee_id: userData.employee_id || '',
        join_date: userData.join_date || '',
        emergency_contact: userData.emergency_contact || '',
        emergency_phone: userData.emergency_phone || '',
        role: userData.role || 'staff',
        is_active: userData.is_active ?? true,
      });

      // 2. Load teacher data if role is teacher (or try regardless — teachers row may exist for ex-teachers)
      if (userData.role === 'teacher') {
        const { data: teacherData, error: teacherError } = await supabase
          .from('teachers')
          .select('*')
          .eq('id', staffId)
          .maybeSingle();

        if (teacherError) {
          console.warn('Error fetching teacher row:', teacherError);
        }

        if (teacherData) {
          setTeacherRowExists(true);
          setTeacherForm({
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
        } else {
          // No teachers row yet — will be created on save
          setTeacherRowExists(false);
        }
      }

    } catch (error: any) {
      console.error('Error loading staff:', error);
      alert('Error: ' + error.message);
    }

    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (isEditMode) {
        // ⭐ Update users table (now includes email)
        const { error: userError } = await supabase
          .from('users')
          .update({
            full_name: profileForm.full_name,
            email: profileForm.email,           // ⭐ v3.10: allow email edit
            phone: profileForm.phone || null,
            gender: profileForm.gender || null,
            date_of_birth: profileForm.date_of_birth || null,
            address: profileForm.address || null,
            employee_id: profileForm.employee_id || null,
            join_date: profileForm.join_date || null,
            emergency_contact: profileForm.emergency_contact || null,
            emergency_phone: profileForm.emergency_phone || null,
            role: profileForm.role,
            is_active: profileForm.is_active,
          })
          .eq('id', staffId);

        if (userError) throw new Error('Users update failed: ' + userError.message);

        // ⭐ Upsert teachers row when role is teacher
        if (profileForm.role === 'teacher') {
          const { error: teacherError } = await supabase
            .from('teachers')
            .upsert(
              {
                id: staffId,
                specialization: teacherForm.specialization || null,
                teacher_type: teacherForm.teacher_type,
                profile_headline: teacherForm.profile_headline || null,
                bio: teacherForm.bio || null,
                about: teacherForm.about || null,
                hourly_rate: teacherForm.hourly_rate || 0,
                years_experience: teacherForm.years_experience || 0,
                teaching_style: teacherForm.teaching_style || null,
                is_active: teacherForm.is_active,
              },
              { onConflict: 'id' }
            );

          if (teacherError) {
            throw new Error('Teachers upsert failed: ' + teacherError.message);
          }
          setTeacherRowExists(true);
        }

        alert('✅ Staff updated successfully!');
        router.push(`/dashboard/staff/teachers/view?id=${staffId}`);

      } else {
        // ---- CREATE MODE ----
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            full_name: profileForm.full_name,
            email: profileForm.email,
            phone: profileForm.phone || null,
            gender: profileForm.gender || null,
            date_of_birth: profileForm.date_of_birth || null,
            address: profileForm.address || null,
            employee_id: profileForm.employee_id || null,
            join_date: profileForm.join_date || null,
            emergency_contact: profileForm.emergency_contact || null,
            emergency_phone: profileForm.emergency_phone || null,
            role: profileForm.role,
            is_active: profileForm.is_active,
          })
          .select()
          .single();

        if (createError) throw new Error(createError.message);

        if (profileForm.role === 'teacher') {
          const { error: teacherError } = await supabase
            .from('teachers')
            .insert({
              id: newUser.id,
              specialization: teacherForm.specialization || null,
              teacher_type: teacherForm.teacher_type,
              profile_headline: teacherForm.profile_headline || null,
              bio: teacherForm.bio || null,
              about: teacherForm.about || null,
              hourly_rate: teacherForm.hourly_rate || 0,
              years_experience: teacherForm.years_experience || 0,
              teaching_style: teacherForm.teaching_style || null,
              is_active: teacherForm.is_active,
            });

          if (teacherError) throw new Error('Teachers insert failed: ' + teacherError.message);
        }

        alert('✅ Staff created successfully!');
        router.push(`/dashboard/staff/teachers/view?id=${newUser.id}`);
      }

    } catch (error: any) {
      console.error('Error saving:', error);
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
        <Link href={isEditMode ? `/dashboard/staff/teachers/view?id=${staffId}` : '/dashboard/staff/list'}>
          <button className="text-gray-600 hover:text-gray-900">← Back</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? 'Edit Staff' : 'Create New Staff'}
        </h1>
        {isEditMode && profileForm.role === 'teacher' && !teacherRowExists && (
          <span className="ml-2 px-3 py-1 text-xs bg-amber-100 text-amber-800 rounded-full">
            ⚠️ No teacher profile yet — will be created on save
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">
        {/* Tabs */}
        <div className="flex gap-2 border-b pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === 'profile'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Profile
          </button>
          {profileForm.role === 'teacher' && (
            <button
              type="button"
              onClick={() => setActiveTab('teacher')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'teacher'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Teacher Details
            </button>
          )}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  ⚠️ Changing email may affect login credentials.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <select
                  value={profileForm.role}
                  onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <select
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Gender</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={profileForm.date_of_birth}
                  onChange={(e) => setProfileForm({ ...profileForm, date_of_birth: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employee ID</label>
                <input
                  type="text"
                  value={profileForm.employee_id}
                  onChange={(e) => setProfileForm({ ...profileForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Join Date</label>
                <input
                  type="date"
                  value={profileForm.join_date}
                  onChange={(e) => setProfileForm({ ...profileForm, join_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={profileForm.emergency_contact}
                  onChange={(e) => setProfileForm({ ...profileForm, emergency_contact: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Phone</label>
                <input
                  type="text"
                  value={profileForm.emergency_phone}
                  onChange={(e) => setProfileForm({ ...profileForm, emergency_phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profileForm.is_active}
                    onChange={(e) => setProfileForm({ ...profileForm, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Active</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Teacher Tab */}
        {activeTab === 'teacher' && profileForm.role === 'teacher' && (
          <div className="space-y-4">
            {!teacherRowExists && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                ℹ️ This teacher doesn't have a profile row yet. Filling this out and saving will create one.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Teacher Type *</label>
                <select
                  value={teacherForm.teacher_type}
                  onChange={(e) => setTeacherForm({ ...teacherForm, teacher_type: e.target.value as 'full-time' | 'part-time' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {TEACHER_TYPES.map((type) => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Specialization</label>
                <input
                  type="text"
                  value={teacherForm.specialization}
                  onChange={(e) => setTeacherForm({ ...teacherForm, specialization: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Mathematics, English"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Profile Headline</label>
                <input
                  type="text"
                  value={teacherForm.profile_headline}
                  onChange={(e) => setTeacherForm({ ...teacherForm, profile_headline: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Senior Mathematics Teacher"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={teacherForm.bio}
                  onChange={(e) => setTeacherForm({ ...teacherForm, bio: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Short bio..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">About</label>
                <textarea
                  value={teacherForm.about}
                  onChange={(e) => setTeacherForm({ ...teacherForm, about: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Detailed description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hourly Rate ($)</label>
                <input
                  type="number"
                  value={teacherForm.hourly_rate}
                  onChange={(e) => setTeacherForm({ ...teacherForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min={0}
                  step={5}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Years Experience</label>
                <input
                  type="number"
                  value={teacherForm.years_experience}
                  onChange={(e) => setTeacherForm({ ...teacherForm, years_experience: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min={0}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Teaching Style</label>
                <input
                  type="text"
                  value={teacherForm.teaching_style}
                  onChange={(e) => setTeacherForm({ ...teacherForm, teaching_style: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Interactive, Discussion-based"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={teacherForm.is_active}
                    onChange={(e) => setTeacherForm({ ...teacherForm, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Active (teacher profile)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Staff')}
          </button>
          <Link href={isEditMode ? `/dashboard/staff/teachers/view?id=${staffId}` : '/dashboard/staff/list'}>
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}