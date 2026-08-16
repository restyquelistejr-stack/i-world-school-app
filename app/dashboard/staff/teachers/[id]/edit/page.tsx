'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function EditTeacherPage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    specialization: '',
    bio: '',
    about: '',
    profile_headline: '',
    hourly_rate: 0,
    years_experience: 0,
    teaching_style: '',
    is_active: true,
  });

  useEffect(() => {
    if (teacherId) {
      loadTeacher();
    }
  }, [teacherId]);

  async function loadTeacher() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .single();

      if (error) throw error;

      setFormData({
        specialization: data.specialization || '',
        bio: data.bio || '',
        about: data.about || '',
        profile_headline: data.profile_headline || '',
        hourly_rate: data.hourly_rate || 0,
        years_experience: data.years_experience || 0,
        teaching_style: data.teaching_style || '',
        is_active: data.is_active || true,
      });
    } catch (error) {
      console.error('Error loading teacher:', error);
      alert('Failed to load teacher');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('teachers')
        .update({
          specialization: formData.specialization,
          bio: formData.bio,
          about: formData.about,
          profile_headline: formData.profile_headline,
          hourly_rate: formData.hourly_rate,
          years_experience: formData.years_experience,
          teaching_style: formData.teaching_style,
          is_active: formData.is_active,
        })
        .eq('id', teacherId);

      if (error) throw error;

      alert('✅ Teacher updated successfully!');
      router.push(`/dashboard/staff/teachers/${teacherId}`);
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
        <Link href={`/dashboard/staff/teachers/${teacherId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Profile</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Teacher</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Specialization</label>
            <input
              type="text"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Profile Headline</label>
            <input
              type="text"
              value={formData.profile_headline}
              onChange={(e) => setFormData({ ...formData, profile_headline: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">About</label>
          <textarea
            value={formData.about}
            onChange={(e) => setFormData({ ...formData, about: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Teaching Style</label>
          <input
            type="text"
            value={formData.teaching_style}
            onChange={(e) => setFormData({ ...formData, teaching_style: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="w-4 h-4"
          />
          <label className="text-sm font-medium">Active</label>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link href={`/dashboard/staff/teachers/${teacherId}`}>
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}