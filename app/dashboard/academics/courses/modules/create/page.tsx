'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const LEVELS = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'pre_intermediate', label: 'Pre-intermediate' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'upper_intermediate', label: 'Upper-intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

interface Course {
  id: string;
  name: string;
}

export default function CreateModulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') as string;

  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [moduleCount, setModuleCount] = useState(0);
  const [existingLevels, setExistingLevels] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    level: '',
    description: '',
    total_sessions: 24,
  });

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadExistingLevels();
    }
  }, [courseId]);

  async function loadCourse() {
    const { data } = await supabase
      .from('courses')
      .select('id, name')
      .eq('id', courseId)
      .single();
    
    if (data) setCourse(data);

    // Get module count for order
    const { count } = await supabase
      .from('course_modules')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);
    
    setModuleCount(count || 0);
  }

  async function loadExistingLevels() {
    const { data } = await supabase
      .from('course_modules')
      .select('level')
      .eq('course_id', courseId)
      .not('level', 'is', null);
    
    if (data) {
      const levels = data.map(m => m.level).filter(Boolean);
      setExistingLevels(levels);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if level already exists for this course
      if (existingLevels.includes(formData.level)) {
        if (!confirm(`Level "${formData.level}" already exists for this course. Do you want to create another module with the same level?`)) {
          setLoading(false);
          return;
        }
      }

      // 1. Create module (without lesson_type)
      const { data: module, error: moduleError } = await supabase
        .from('course_modules')
        .insert({
          course_id: courseId,
          title: formData.title,
          level: formData.level,
          description: formData.description,
          total_sessions: formData.total_sessions,
          module_order: moduleCount + 1,
        })
        .select()
        .single();

      if (moduleError) throw moduleError;

      // 2. Auto-generate sessions/classes with default hours = 2
      const sessions = [];
      for (let i = 1; i <= formData.total_sessions; i++) {
        sessions.push({
          module_id: module.id,
          session_number: i,
          session_name: `Class ${i}`,
          lesson_type: 'Lecture',
          hours: 2,
          description: `Session ${i} of ${formData.title}`,
        });
      }

      const { error: sessionsError } = await supabase
        .from('module_sessions')
        .insert(sessions);

      if (sessionsError) throw sessionsError;

      alert(`✅ Module created with ${formData.total_sessions} classes!`);
      router.push(`/dashboard/academics/courses/modules/view?moduleId=${module.id}`);

    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
    setLoading(false);
  }

  if (!courseId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <p className="text-yellow-700">No course selected.</p>
          <Link href="/dashboard/academics/courses">
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Back to Courses
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/dashboard/academics/courses/modules?courseId=${courseId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Modules</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Add Module to {course.name}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">
        {/* Level - Prominently displayed first */}
        <div>
          <label className="block text-sm font-medium mb-1">Level *</label>
          <select
            value={formData.level}
            onChange={(e) => setFormData({ ...formData, level: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select Level</option>
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label} {existingLevels.includes(level.value) ? '⚠️ (Already exists)' : ''}
              </option>
            ))}
          </select>
          {formData.level && existingLevels.includes(formData.level) && (
            <p className="text-xs text-yellow-600 mt-1">⚠️ This level already exists for this course.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Module Name *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            required
            placeholder="e.g., Business English - Pre-intermediate"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Total Sessions *</label>
          <input
            type="number"
            value={formData.total_sessions}
            onChange={(e) => setFormData({ ...formData, total_sessions: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            min={1}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            This will automatically generate Class 1 to Class {formData.total_sessions}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Describe the module content..."
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <strong>📌 Note:</strong> After creating this module, the system will automatically generate 
          <strong> {formData.total_sessions} classes</strong> (Class 1 to Class {formData.total_sessions}). 
          Each class will default to <strong>Lecture</strong> with <strong>2 hours</strong>. 
          You can edit each class name, lesson type, and hours later.
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href={`/dashboard/academics/courses/modules?courseId=${courseId}`}>
            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Module with Classes'}
          </button>
        </div>
      </form>
    </div>
  );
}