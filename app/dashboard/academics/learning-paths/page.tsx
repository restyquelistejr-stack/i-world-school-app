'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Program {
  id: string;
  name: string;
}

interface Course {
  id: string;
  name: string;
  code: string;
}

interface LearningPath {
  id: string;
  sequence: number;
  program_id: string;
  current_course_id: string;
  next_course_id: string;
  program?: Program;
  current_course?: Course;
  next_course?: Course;
  created_at: string;
}

export default function LearningPathsPage() {
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LearningPath | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    sequence: 0,
    program_id: '',
    current_course_id: '',
    next_course_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load programs
      const { data: programsData } = await supabase
        .from('programs')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      setPrograms(programsData || []);

      // Load courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name, code')
        .eq('status', 'active')
        .order('name');
      setCourses(coursesData || []);

      // Load learning paths
      const { data, error } = await supabase
        .from('learning_paths')
        .select(`
          *,
          program:program_id (id, name),
          current_course:current_course_id (id, name, code),
          next_course:next_course_id (id, name, code)
        `)
        .order('sequence');

      if (error) throw error;
      setPaths(data || []);
    } catch (error) {
      console.error('Error loading learning paths:', error);
      alert('Failed to load learning paths');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('learning_paths')
          .update(formData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Learning path updated successfully!');
      } else {
        const { error } = await supabase
          .from('learning_paths')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Learning path created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this learning path?')) return;

    try {
      const { error } = await supabase
        .from('learning_paths')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Learning path deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      sequence: 0,
      program_id: '',
      current_course_id: '',
      next_course_id: '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: LearningPath) {
    setEditingItem(item);
    setFormData({
      sequence: item.sequence || 0,
      program_id: item.program_id || '',
      current_course_id: item.current_course_id || '',
      next_course_id: item.next_course_id || '',
    });
    setShowForm(true);
  }

  const getAvailableNextCourses = () => {
    return courses.filter(c => c.id !== formData.current_course_id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Learning Paths</h1>
            <p className="text-gray-500 text-sm">Recommended progression through courses</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Learning Path'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Learning Path' : 'Add New Learning Path'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Program *</label>
                  <select
                    value={formData.program_id}
                    onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Program</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sequence</label>
                  <input
                    type="number"
                    value={formData.sequence}
                    onChange={(e) => setFormData({ ...formData, sequence: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Current Course *</label>
                  <select
                    value={formData.current_course_id}
                    onChange={(e) => setFormData({ ...formData, current_course_id: e.target.value })}
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
                  <label className="block text-sm font-medium mb-1">Next Course *</label>
                  <select
                    value={formData.next_course_id}
                    onChange={(e) => setFormData({ ...formData, next_course_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Next Course</option>
                    {getAvailableNextCourses().map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
        ) : paths.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No learning paths found. Click "Add Learning Path" to create one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paths.map((path) => (
              <div
                key={path.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500">#{path.sequence}</span>
                      <h3 className="font-semibold text-lg">
                        {path.current_course?.name} → {path.next_course?.name}
                      </h3>
                    </div>
                    {path.program && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {path.program.name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editItem(path)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteItem(path.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                  <span>📚 {path.current_course?.code || 'N/A'} → {path.next_course?.code || 'N/A'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}