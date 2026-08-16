'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

interface Course {
  id: string;
  name: string;
  code: string;
}

interface AssessmentTemplate {
  id: string;
  name: string;
  assessment_type: string;
  weight: number;
  passing_score: number | null;
  description: string;
  course_id: string;
  course?: Course;
  created_at: string;
}

interface AssessmentFormData {
  name: string;
  assessment_type: string;
  weight: number | string;
  passing_score: string;
  description: string;
  course_id: string;
}

interface AssessmentSubmitData {
  name: string;
  assessment_type: string;
  weight: number;
  passing_score: number | null;
  description: string;
  course_id: string;
}

const ASSESSMENT_TYPES = ['quiz', 'assignment', 'exam', 'project', 'participation'];

export default function AssessmentTemplatesPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<AssessmentTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState<AssessmentFormData>({
    name: '',
    assessment_type: 'quiz',
    weight: 0,
    passing_score: '',
    description: '',
    course_id: courseId || '',
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name, code')
        .eq('status', 'active')
        .order('name');
      setCourses(coursesData || []);

      // Load assessment templates
      let query = supabase
        .from('assessment_templates')
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
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading assessment templates:', error);
      alert('Failed to load assessment templates');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Build submit data with proper types
      const submitData: AssessmentSubmitData = {
        name: formData.name,
        assessment_type: formData.assessment_type,
        weight: typeof formData.weight === 'string' ? parseFloat(formData.weight) || 0 : formData.weight || 0,
        passing_score: formData.passing_score ? parseFloat(formData.passing_score) : null,
        description: formData.description || '',
        course_id: formData.course_id,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('assessment_templates')
          .update(submitData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Assessment template updated successfully!');
      } else {
        const { error } = await supabase
          .from('assessment_templates')
          .insert([submitData]);

        if (error) throw error;
        alert('✅ Assessment template created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this assessment template?')) return;

    try {
      const { error } = await supabase
        .from('assessment_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Assessment template deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      assessment_type: 'quiz',
      weight: 0,
      passing_score: '',
      description: '',
      course_id: courseId || '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: AssessmentTemplate) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      assessment_type: item.assessment_type,
      weight: item.weight || 0,
      passing_score: item.passing_score?.toString() || '',
      description: item.description || '',
      course_id: item.course_id || '',
    });
    setShowForm(true);
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      quiz: 'bg-blue-100 text-blue-800',
      assignment: 'bg-green-100 text-green-800',
      exam: 'bg-red-100 text-red-800',
      project: 'bg-purple-100 text-purple-800',
      participation: 'bg-yellow-100 text-yellow-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Assessment Templates</h1>
            <p className="text-gray-500 text-sm">Define how students are graded</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Assessment Template'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Assessment Template' : 'Add New Assessment Template'}
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
                    placeholder="e.g., Midterm Exam"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type *</label>
                  <select
                    value={formData.assessment_type}
                    onChange={(e) => setFormData({ ...formData, assessment_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {ASSESSMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
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
                  <label className="block text-sm font-medium mb-1">Weight (%)</label>
                  <input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Passing Score (%)</label>
                  <input
                    type="number"
                    value={formData.passing_score}
                    onChange={(e) => setFormData({ ...formData, passing_score: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
                    placeholder="Optional"
                  />
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
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No assessment templates found. Click "Add Assessment Template" to create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${getTypeColor(item.assessment_type)}`}>
                      {item.assessment_type}
                    </span>
                    {item.course && (
                      <span className="inline-block ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {item.course.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                  {item.weight > 0 && <span>📊 Weight: {item.weight}%</span>}
                  {item.passing_score !== null && <span>🎯 Passing: {item.passing_score}%</span>}
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