'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

// Helper to assign nice colors to courses
const getCourseColor = (type: string) => {
  const colors: Record<string, string> = {
    daily_english: 'bg-blue-50 border-blue-200 hover:border-blue-400 text-blue-700',
    business_english: 'bg-indigo-50 border-indigo-200 hover:border-indigo-400 text-indigo-700',
    young_learners: 'bg-green-50 border-green-200 hover:border-green-400 text-green-700',
    exam_prep: 'bg-purple-50 border-purple-200 hover:border-purple-400 text-purple-700',
    private_lesson: 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-700',
  };
  return colors[type] || 'bg-gray-50 border-gray-200 hover:border-gray-400 text-gray-700';
};

interface Package {
  id: string;
  name: string;
  sessions: number;
  amount: number;
  is_active: boolean;
}

interface Course {
  id: string;
  name: string;
  age_group: string;
  course_type: string;
  level: string;
  description: string;
  duration_hours: number;
  delivery_mode: string;
  is_active: boolean;
  packages?: Package[];
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select(`*, packages:course_packages (*)`)
        .order('course_type')
        .order('name');
      if (error) throw error;
      setCourses(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const getLowestPrice = (course: Course) => {
    const activePrices = course.packages?.filter(p => p.is_active).map(p => p.amount) || [];
    if (activePrices.length === 0) return null;
    return Math.min(...activePrices);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Loading courses...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Explore Courses</h1>
          <p className="text-sm text-gray-500 mt-1">Discover the perfect program for your learning goals.</p>
        </div>
        <Link href="/dashboard/academics/courses/create">
          <button className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium flex items-center gap-2">
            <span>+</span> Create New Course
          </button>
        </Link>
      </div>

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div 
            key={course.id} 
            className={`group relative flex flex-col rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md ${getCourseColor(course.course_type)}`}
          >
            {/* Card Content */}
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {course.name}
                </h3>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/50 backdrop-blur-sm border ${course.is_active ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'}`}>
                  {course.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {course.description || 'No description provided.'}
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[10px] font-medium bg-white/60 px-2 py-1 rounded-full border border-gray-200 text-gray-600">
                  {course.age_group === 'adult' ? '👨‍🎓 Adult' : '🧒 Young Learner'}
                </span>
                <span className="text-[10px] font-medium bg-white/60 px-2 py-1 rounded-full border border-gray-200 text-gray-600">
                  {course.duration_hours}h
                </span>
                <span className="text-[10px] font-medium bg-white/60 px-2 py-1 rounded-full border border-gray-200 text-gray-600 capitalize">
                  {course.delivery_mode.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-auto pt-4 border-t border-gray-200/50 flex items-center justify-between">
                <div>
                  {getLowestPrice(course) !== null ? (
                    <>
                      <p className="text-sm text-gray-500">Starting from</p>
                      <p className="text-xl font-bold text-gray-900">${getLowestPrice(course)}+</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Price not set</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* ✅ FIXED: Updated View link */}
                  <Link href={`/dashboard/academics/courses/details?id=${course.id}`}>
                    <button className="px-3 py-1.5 text-xs font-medium bg-white rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                      View
                    </button>
                  </Link>
                  {/* ✅ FIXED: Updated Edit link */}
                  <Link href={`/dashboard/academics/courses/edit?id=${course.id}`}>
                    <button className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                      Edit
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">No courses found. Click "Create New Course" to get started!</p>
        </div>
      )}
    </div>
  );
}