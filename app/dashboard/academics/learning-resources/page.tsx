'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

interface Course {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface LearningResource {
  id: string;
  title: string;
  resource_type: string;
  file_url: string;
  description: string;
  course_id: string;
  subject_id: string | null;
  course?: Course;
  subject?: Subject;
  created_at: string;
}

const RESOURCE_TYPES = ['pdf', 'video', 'url', 'slide', 'other'];

export default function LearningResourcesPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [resources, setResources] = useState<LearningResource[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LearningResource | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    resource_type: 'pdf',
    file_url: '',
    description: '',
    course_id: courseId || '',
    subject_id: '',
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load courses - only select columns that exist
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (coursesError) {
        console.error('Courses error:', coursesError);
        setCourses([]);
      } else {
        setCourses(coursesData || []);
      }

      // Load subjects - only select columns that exist
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');
      
      if (subjectsError) {
        console.error('Subjects error:', subjectsError);
        setSubjects([]);
      } else {
        setSubjects(subjectsData || []);
      }

      // Load learning resources - simplified query
      const { data, error } = await supabase
        .from('learning_resources')
        .select('*')
        .order('title');

      if (error) {
        console.error('Learning resources error:', error);
        setResources([]);
        return;
      }

      // Map resources with course and subject names
      const resourcesWithNames = await Promise.all((data || []).map(async (resource: any) => {
        let courseName = '';
        let subjectName = '';

        // Get course name
        if (resource.course_id) {
          const { data: courseData } = await supabase
            .from('courses')
            .select('name')
            .eq('id', resource.course_id)
            .single();
          if (courseData) {
            courseName = courseData.name;
          }
        }

        // Get subject name
        if (resource.subject_id) {
          const { data: subjectData } = await supabase
            .from('subjects')
            .select('name')
            .eq('id', resource.subject_id)
            .single();
          if (subjectData) {
            subjectName = subjectData.name;
          }
        }

        return {
          ...resource,
          course: courseName ? { id: resource.course_id, name: courseName } : undefined,
          subject: subjectName ? { id: resource.subject_id, name: subjectName } : undefined,
        };
      }));

      setResources(resourcesWithNames);

    } catch (error: any) {
      console.error('Error loading learning resources:', error);
      // Don't show alert for missing columns, just show empty state
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const submitData = {
        title: formData.title,
        resource_type: formData.resource_type,
        file_url: formData.file_url || null,
        description: formData.description || null,
        course_id: formData.course_id || null,
        subject_id: formData.subject_id || null,
      };

      let result;
      if (editingItem) {
        result = await supabase
          .from('learning_resources')
          .update(submitData)
          .eq('id', editingItem.id);
      } else {
        result = await supabase
          .from('learning_resources')
          .insert([submitData]);
      }

      if (result.error) throw result.error;

      alert('✅ Learning resource saved successfully!');
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this learning resource?')) return;

    try {
      const { error } = await supabase
        .from('learning_resources')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Learning resource deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      resource_type: 'pdf',
      file_url: '',
      description: '',
      course_id: courseId || '',
      subject_id: '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: LearningResource) {
    setEditingItem(item);
    setFormData({
      title: item.title,
      resource_type: item.resource_type,
      file_url: item.file_url || '',
      description: item.description || '',
      course_id: item.course_id || '',
      subject_id: item.subject_id || '',
    });
    setShowForm(true);
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      pdf: 'bg-red-100 text-red-800',
      video: 'bg-blue-100 text-blue-800',
      url: 'bg-green-100 text-green-800',
      slide: 'bg-purple-100 text-purple-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      pdf: '📄',
      video: '🎬',
      url: '🔗',
      slide: '📊',
      other: '📎',
    };
    return icons[type] || '📎';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Learning Resources</h1>
            <p className="text-gray-500 text-sm">Materials used in courses</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Resource'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Learning Resource' : 'Add New Learning Resource'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type *</label>
                  <select
                    value={formData.resource_type}
                    onChange={(e) => setFormData({ ...formData, resource_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {RESOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>{type.toUpperCase()}</option>
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
                  <label className="block text-sm font-medium mb-1">Subject</label>
                  <select
                    value={formData.subject_id}
                    onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">File URL</label>
                  <input
                    type="text"
                    value={formData.file_url}
                    onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/resource.pdf"
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
        ) : resources.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No learning resources found. Click "Add Resource" to create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getTypeIcon(item.resource_type)}</span>
                      <h3 className="font-semibold text-lg">{item.title}</h3>
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${getTypeColor(item.resource_type)}`}>
                      {item.resource_type.toUpperCase()}
                    </span>
                    {item.course && (
                      <span className="inline-block ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {item.course.name}
                      </span>
                    )}
                  </div>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-2">{item.description}</p>
                )}
                {item.file_url && (
                  <a 
                    href={item.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                  >
                    🔗 View Resource
                  </a>
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