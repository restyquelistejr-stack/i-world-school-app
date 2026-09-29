'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  name: string;
  description: string;
  age_group: string;
  course_type: string;
  duration_hours: number;
  delivery_mode: string;
  pricing_mode: string;
  link_url: string;
  is_active: boolean;
  created_at: string;
}

interface Module {
  id: string;
  title: string;
  level: string;
  description: string;
  total_sessions: number;
  module_order: number;
  session_count?: number;
}

interface Package {
  id: string;
  name: string;
  sessions: number;
  amount: number;
  is_active: boolean;
}

export default function CourseDetailsClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);

  useEffect(() => {
    loadCourseDetails();
  }, [courseId]);

  async function loadCourseDetails() {
    if (!courseId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError || !courseData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCourse(courseData);

      // 2. Fetch modules with session counts
      const { data: modulesData, error: modulesError } = await supabase
        .from('course_modules')
        .select('*')
        .eq('course_id', courseId)
        .order('module_order');

      if (!modulesError && modulesData) {
        const modulesWithCounts = await Promise.all(
          modulesData.map(async (module) => {
            const { count } = await supabase
              .from('module_sessions')
              .select('*', { count: 'exact', head: true })
              .eq('module_id', module.id);

            return {
              ...module,
              session_count: count || 0,
            };
          })
        );
        setModules(modulesWithCounts);
      }

      // 3. Fetch packages
      const { data: packageData, error: packageError } = await supabase
        .from('course_packages')
        .select('*')
        .eq('course_id', courseId)
        .order('amount');

      if (!packageError && packageData) {
        setPackages(packageData);
      }

    } catch (err) {
      console.error('Error loading course details:', err);
      setNotFound(true);
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!course) return;
    if (!confirm(`Delete "${course.name}" and all associated data? This cannot be undone.`)) return;

    try {
      for (const module of modules) {
        await supabase.from('module_sessions').delete().eq('module_id', module.id);
      }
      await supabase.from('course_modules').delete().eq('course_id', course.id);
      await supabase.from('course_packages').delete().eq('course_id', course.id);

      const { error } = await supabase.from('courses').delete().eq('id', course.id);
      if (error) throw error;

      router.push('/dashboard/academics/courses');
    } catch (err: any) {
      alert('Error deleting course: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notFound || !course) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/academics/courses">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Courses</button>
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          <h2 className="text-xl font-bold mb-2">Course Not Found</h2>
          <p>The course you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/dashboard/academics/courses" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
            ← Back to Courses
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
        </div>
        <div className="flex gap-3">
          <Link href={`/dashboard/academics/courses/modules?courseId=${course.id}`}>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              📚 Manage Modules
            </button>
          </Link>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      {/* Course Info */}
      <div className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Status:</span> <span className="font-medium">{course.is_active ? 'Active' : 'Inactive'}</span></div>
          <div><span className="text-gray-500">Course Type:</span> <span className="font-medium">{course.course_type || 'N/A'}</span></div>
          <div><span className="text-gray-500">Age Group:</span> <span className="font-medium">{course.age_group || 'N/A'}</span></div>
          <div><span className="text-gray-500">Duration:</span> <span className="font-medium">{course.duration_hours || 'N/A'} hours</span></div>
          <div><span className="text-gray-500">Delivery Mode:</span> <span className="font-medium">{course.delivery_mode || 'N/A'}</span></div>
          <div><span className="text-gray-500">Pricing:</span> <span className="font-medium">{course.pricing_mode || 'N/A'}</span></div>
        </div>

        {course.description && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📝 Description</h3>
            <p className="text-sm text-gray-600">{course.description}</p>
          </div>
        )}

        {course.link_url && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">🔗 Link</h3>
            <a href={course.link_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
              {course.link_url}
            </a>
          </div>
        )}
      </div>

      {/* Packages */}
      {packages.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
          <h3 className="font-bold text-gray-800 mb-4">💰 Pricing Packages ({packages.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="font-medium text-gray-800">{pkg.name}</div>
                <div className="text-sm text-gray-600">${pkg.amount} - {pkg.sessions} sessions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modules - Level displayed prominently */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-800">📚 Modules ({modules.length})</h3>
          <Link href={`/dashboard/academics/courses/modules/create?courseId=${course.id}`}>
            <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition">
              + Add Module
            </button>
          </Link>
        </div>

        {modules.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No modules created yet. Click "Add Module" to get started.</p>
        ) : (
          <div className="space-y-3">
            {modules.map((module) => (
              <Link key={module.id} href={`/dashboard/academics/courses/modules/view?moduleId=${module.id}`}>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow transition cursor-pointer">
                  <div>
                    {/* Level displayed prominently */}
                    <div className="text-sm font-medium text-blue-600 mb-1">
                      {module.level ? `Level: ${module.level}` : 'No level set'}
                    </div>
                    <div className="font-medium text-gray-800">
                      Module {module.module_order}: {module.title}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1">
                      <span>Sessions: {module.total_sessions || 0}</span>
                      <span className="text-green-600">✓ {module.session_count || 0} classes created</span>
                    </div>
                  </div>
                  <div className="text-blue-600">→</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}