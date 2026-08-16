'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

interface Course {
  id: string;
  name: string;
  code: string;
}

interface Competency {
  id: string;
  name: string;
  description: string;
  status: string;
  course_id: string;
  course?: Course;
  created_at: string;
}

export default function CompetenciesPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Competency | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active',
    course_id: courseId || '',
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name, code')
        .eq('status', 'active')
        .order('name');
      setCourses(coursesData || []);

      let query = supabase
        .from('competencies')
        .select(`
          *,
          course:course_id (id, name, code)
        `)
        .order('name');

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCompetencies(data || []);
    } catch (error) {
      console.error('Error loading competencies:', error);
      alert('Failed to load competencies');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('competencies')
          .update(formData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Competency updated successfully!');
      } else {
        const { error } = await supabase
          .from('competencies')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Competency created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this competency?')) return;

    try {
      const { error } = await supabase
        .from('competencies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Competency deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      description: '',
      status: 'active',
      course_id: courseId || '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: Competency) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      status: item.status,
      course_id: item.course_id || '',
    });
    setShowForm(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Competencies</h1>
            <p className="text-gray-500 text-sm">Skills gained after completing courses</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Competency'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Competency' : 'Add New Competency'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="e.g., Python Basics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Course</label>
                  <select
                    value={formData.course_id}
                    onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : competencies.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No competencies found. Click "Add Competency" to create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {competencies.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    {item.course && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {item.course.name}
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {item.status}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-2">{item.description}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => editItem(item)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}