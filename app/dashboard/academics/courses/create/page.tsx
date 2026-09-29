'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const AGE_GROUPS = [
  { value: 'adult', label: '👨‍🎓 Adult' },
  { value: 'young_learner', label: '🧒 Young Learner' },
];

const COURSE_TYPES = [
  { value: 'daily_english', label: 'Daily English' },
  { value: 'business_english', label: 'Business English' },
  { value: 'young_learners', label: 'Young Learners' },
  { value: 'exam_prep', label: 'Exam Preparation' },
];

const DELIVERY_MODES = [
  { value: 'on_site', label: '🏫 On-Site' },
  { value: 'online', label: '💻 Online' },
  { value: 'hybrid', label: '🔄 Hybrid' },
];

export default function CreateCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    age_group: '',
    course_type: '',
    description: '',
    duration_hours: 40,
    delivery_mode: 'on_site',
    pricing_mode: 'package',
    price_per_hour_on_site: 30,
    price_per_hour_online: 25,
    link_url: '',
  });

  const [packages, setPackages] = useState([
    { name: '24 Lessons (2-3 Months)', sessions: 24, amount: 1858, is_active: true },
    { name: '48 Lessons (4-6 Months)', sessions: 48, amount: 3173, is_active: true },
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create course
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          name: formData.name,
          age_group: formData.age_group,
          course_type: formData.course_type,
          description: formData.description,
          duration_hours: formData.duration_hours,
          delivery_mode: formData.delivery_mode,
          pricing_mode: formData.pricing_mode,
          price_per_hour_on_site: formData.price_per_hour_on_site,
          price_per_hour_online: formData.price_per_hour_online,
          link_url: formData.link_url,
          is_active: true,
        })
        .select()
        .single();

      if (courseError) throw courseError;

      // 2. Create packages
      if (packages.length > 0) {
        const packagesToInsert = packages.map(pkg => ({
          course_id: course.id,
          name: pkg.name,
          sessions: pkg.sessions,
          amount: pkg.amount,
          is_active: pkg.is_active,
        }));

        const { error: packageError } = await supabase
          .from('course_packages')
          .insert(packagesToInsert);

        if (packageError) throw packageError;
      }

      alert('✅ Course created successfully!');
      router.push('/dashboard/academics/courses');
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/academics/courses">
          <button className="text-gray-600 hover:text-gray-900">← Back to Courses</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Course</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Course Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Age Group *</label>
            <select
              value={formData.age_group}
              onChange={(e) => setFormData({ ...formData, age_group: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select</option>
              {AGE_GROUPS.map((group) => (
                <option key={group.value} value={group.value}>{group.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Course Type *</label>
            <select
              value={formData.course_type}
              onChange={(e) => setFormData({ ...formData, course_type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select</option>
              {COURSE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Delivery Mode</label>
            <select
              value={formData.delivery_mode}
              onChange={(e) => setFormData({ ...formData, delivery_mode: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {DELIVERY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Total Hours</label>
            <input
              type="number"
              value={formData.duration_hours}
              onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Public Course URL</label>
            <input
              type="url"
              value={formData.link_url}
              onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="https://..."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Pricing Packages */}
        <div className="border-t pt-6">
          <h2 className="font-bold text-gray-800 mb-4">💰 Pricing Packages</h2>
          <div className="space-y-3">
            {packages.map((pkg, index) => (
              <div key={index} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg">
                <input
                  type="text"
                  value={pkg.name}
                  onChange={(e) => {
                    const updated = [...packages];
                    updated[index].name = e.target.value;
                    setPackages(updated);
                  }}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Package name"
                />
                <input
                  type="number"
                  value={pkg.sessions}
                  onChange={(e) => {
                    const updated = [...packages];
                    updated[index].sessions = parseInt(e.target.value) || 0;
                    setPackages(updated);
                  }}
                  className="w-20 px-3 py-2 border rounded-lg text-sm text-center"
                  placeholder="Sess"
                />
                <input
                  type="number"
                  value={pkg.amount}
                  onChange={(e) => {
                    const updated = [...packages];
                    updated[index].amount = parseFloat(e.target.value) || 0;
                    setPackages(updated);
                  }}
                  className="w-24 px-3 py-2 border rounded-lg text-sm text-center"
                  placeholder="$"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (packages.length <= 1) return;
                    setPackages(packages.filter((_, i) => i !== index));
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPackages([...packages, { name: '', sessions: 0, amount: 0, is_active: true }])}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-500 transition"
            >
              + Add Package
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/dashboard/academics/courses">
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Course'}
          </button>
        </div>
      </form>
    </div>
  );
}