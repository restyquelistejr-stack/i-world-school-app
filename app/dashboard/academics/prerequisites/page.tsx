'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Course {
  id: string;
  name: string;
  code: string;
}

interface Prerequisite {
  id: string;
  course_id: string;
  required_course_id: string;
  minimum_attendance: number;
  passing_score: number;
  course?: Course;
  required_course?: Course;
  created_at: string;
}

export default function PrerequisitesPage() {
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Prerequisite | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    course_id: '',
    required_course_id: '',
    minimum_attendance: 80,
    passing_score: 75,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name, code')
        .eq('status', 'active')
        .order('name');
      setCourses(coursesData || []);

      const { data, error } = await supabase
        .from('prerequisites')
        .select(`
          *,
          course:course_id (id, name, code),
          required_course:required_course_id (id, name, code)
        `);

      if (error) throw error;
      setPrerequisites(data || []);
    } catch (error) {
      console.error('Error loading prerequisites:', error);
      alert('Failed to load prerequisites');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('prerequisites')
          .update(formData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Prerequisite updated successfully!');
      } else {
        const { error } = await supabase
          .from('prerequisites')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Prerequisite created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this prerequisite?')) return;

    try {
      const { error } = await supabase
        .from('prerequisites')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Prerequisite deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      course_id: '',
      required_course_id: '',
      minimum_attendance: 80,
      passing_score: 75,
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: Prerequisite) {
    setEditingItem(item);
    setFormData({
      course_id: item.course_id || '',
      required_course_id: item.required_course_id || '',
      minimum_attendance: item.minimum_attendance || 80,
      passing_score: item.passing_score || 75,
    });
    setShowForm(true);
  }

  const getAvailableRequiredCourses = () => {
    return courses.filter(c => c.id !== formData.course_id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Prerequisites</h1>
            <p className="text-gray-500 text-sm">Rules before taking a course</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Prerequisite'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Prerequisite' : 'Add New Prerequisite'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Course *</label>
                  <select
                    value={formData.course_id}
                    onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Required Course *</label>
                  <select
                    value={formData.required_course_id}
                    onChange={(e) => setFormData({ ...formData, required_course_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Required Course</option>
                    {getAvailableRequiredCourses().map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum Attendance (%)</label>
                  <input
                    type="number"
                    value={formData.minimum_attendance}
                    onChange={(e) => setFormData({ ...formData, minimum_attendance: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Passing Score (%)</label>
                  <input
                    type="number"
                    value={formData.passing_score}
                    onChange={(e) => setFormData({ ...formData, passing_score: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
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
        ) : prerequisites.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No prerequisites found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {prerequisites.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">
                        {item.course?.name || 'Unknown'} ← {item.required_course?.name || 'Unknown'}
                      </h3>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      <span>📊 Min Attendance: {item.minimum_attendance}%</span>
                      <span>🎯 Passing Score: {item.passing_score}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}