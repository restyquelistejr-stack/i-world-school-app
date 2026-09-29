'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

interface Module {
  id: string;
  title: string;
  level: string;
  description: string;
  total_sessions: number;
  module_order: number;
  session_count: number;
}

export default function ModulesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') as string;

  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Module[]>([]);
  const [courseName, setCourseName] = useState('');

  useEffect(() => {
    if (courseId) {
      loadModules();
    } else {
      setLoading(false);
    }
  }, [courseId]);

  async function loadModules() {
    setLoading(true);

    try {
      // Get course name
      const { data: courseData } = await supabase
        .from('courses')
        .select('name')
        .eq('id', courseId)
        .single();

      if (courseData) setCourseName(courseData.name);

      // Get modules with session counts
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

    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  }

  async function deleteModule(moduleId: string) {
    if (!confirm('Delete this module and all its classes? This cannot be undone.')) return;

    const { error } = await supabase
      .from('course_modules')
      .delete()
      .eq('id', moduleId);

    if (error) {
      alert('Error deleting module: ' + error.message);
    } else {
      loadModules();
    }
  }

  if (!courseId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href={`/dashboard/academics/courses/details?id=${courseId}`}>
            <button className="text-gray-600 hover:text-gray-900 text-sm mb-2 inline-block">← Back to Course</button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Modules for {courseName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {modules.length} module{modules.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Link href={`/dashboard/academics/courses/modules/create?courseId=${courseId}`}>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            + Add Module
          </button>
        </Link>
      </div>

      {modules.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <p className="text-gray-500">No modules created yet.</p>
          <Link href={`/dashboard/academics/courses/modules/create?courseId=${courseId}`}>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Create First Module
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((module) => {
            const hasSessions = module.total_sessions > 0;
            const isComplete = module.session_count === module.total_sessions && hasSessions;
            
            return (
              <div key={module.id} className="bg-white rounded-lg shadow border border-gray-200 p-5 hover:border-blue-300 hover:shadow transition">
                <Link href={`/dashboard/academics/courses/modules/view?moduleId=${module.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {/* Level displayed prominently on top */}
                      <div className="mb-1">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Level</span>
                        <div className="text-lg font-bold text-blue-600">{module.level || 'Not Set'}</div>
                      </div>
                      <h3 className="font-bold text-gray-900">
                        Module {module.module_order}: {module.title}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">
                          {hasSessions ? `${module.total_sessions} sessions` : 'No sessions defined'}
                        </span>
                        {hasSessions ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            isComplete
                              ? 'bg-green-100 text-green-700'
                              : module.session_count > 0 
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {module.session_count}/{module.total_sessions} classes
                            {isComplete && ' ✅'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                            No classes created
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteModule(module.id);
                      }}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                  {module.description && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{module.description}</p>
                  )}
                  {!hasSessions && (
                    <div className="mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                      ⚠️ This module has no sessions defined. Click to edit and set the number of sessions.
                    </div>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}