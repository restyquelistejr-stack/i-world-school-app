'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  name: string;
  code: string;
  program_id?: string;
}

interface Subject {
  id: string;
  name: string;
  description: string;
  level: string;
  duration_hours: number;
  category: string;
  course_id: string;
  course?: Course;
  created_at: string;
}

export default function SubjectsPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Subject | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    level: 'beginner',
    duration_hours: 4,
    category: '',
    course_id: courseId || '',
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load courses for filter and dropdown
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name, code, program_id')
        .eq('is_active', true)
        .order('name');
      setCourses(coursesData || []);

      // If courseId is provided, find the course
      if (courseId && coursesData) {
        const course = coursesData.find(c => c.id === courseId);
        setSelectedCourse(course || null);
      }

      // Load subjects with course
      let query = supabase
        .from('subjects')
        .select(`
          *,
          course:course_id (id, name, code, program_id)
        `)
        .order('name');

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
      alert('Failed to load subjects');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('subjects')
          .update(formData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Subject updated successfully!');
      } else {
        const { error } = await supabase
          .from('subjects')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Subject created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this subject?')) return;

    try {
      const { error } = await supabase
        .from('subjects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Subject deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      description: '',
      level: 'beginner',
      duration_hours: 4,
      category: '',
      course_id: courseId || '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: Subject) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      level: item.level || 'beginner',
      duration_hours: item.duration_hours || 4,
      category: item.category || '',
      course_id: item.course_id || '',
    });
    setShowForm(true);
  }

  const levelColors: Record<string, string> = {
    beginner: 'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced: 'bg-orange-100 text-orange-800',
  };

  const getCoursesLink = () => {
    if (courseId && selectedCourse?.program_id) {
      return `/dashboard/academics/courses?program=${selectedCourse.program_id}`;
    }
    return '/dashboard/academics/courses';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/dashboard/academics/categories" className="hover:text-blue-600">
            Categories
          </Link>
          <span>›</span>
          <Link href={getCoursesLink()} className="hover:text-blue-600">
            Courses
          </Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">
            {selectedCourse ? selectedCourse.name : 'All Subjects'}
          </span>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Subjects</h1>
            <p className="text-gray-500 text-sm">
              {courseId && selectedCourse 
                ? `📖 Subjects in ${selectedCourse.name}` 
                : 'All subjects across all courses'}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Subject'}
          </button>
        </div>

        {/* Course Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700 mr-2">Filter by Course:</span>
            <Link
              href="/dashboard/academics/subjects"
              className={`px-3 py-1 text-sm rounded-full transition ${
                !courseId 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </Link>
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/academics/subjects?course=${c.id}`}
                className={`px-3 py-1 text-sm rounded-full transition ${
                  courseId === c.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Subject' : 'Add New Subject'}
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
                  <label className="block text-sm font-medium mb-1">Level</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    value={formData.duration_hours}
                    onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Category (Subject Tag)</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Programming, Language, Data Science"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    This is a subject-level tag, different from the curriculum category that organizes programs.
                  </p>
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

        {/* Subjects Grid */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : subjects.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">
              {courseId ? 'No subjects found in this course.' : 'No subjects found. Click "Add Subject" to create one.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <div
                key={subject.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{subject.name}</h3>
                    {subject.course && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {subject.course.name}
                      </span>
                    )}
                    {subject.category && (
                      <span className="inline-block ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                        #{subject.category}
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${levelColors[subject.level] || 'bg-gray-100 text-gray-800'}`}>
                    {subject.level}
                  </span>
                </div>
                {subject.description && (
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{subject.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
                  {subject.duration_hours > 0 && <span>⏱️ {subject.duration_hours}h</span>}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => editItem(subject)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(subject.id)}
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