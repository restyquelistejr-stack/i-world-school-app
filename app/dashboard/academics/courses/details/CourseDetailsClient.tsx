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
  scheduling_preference: string;
  pricing_mode: string;
  link_url: string;
  status: string;
  created_at: string;
}

interface Module {
  id: string;
  title: string;
  level: string;
  description: string;
  module_order: number;
}

interface DeliveryUnit {
  id: string;
  title: string;
  unit_type: string;
  duration_minutes: number;
}

interface Package {
  id: string;
  name: string;
  price: number;
  sessions: number;
  description: string;
}

export default function CourseDetailsClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [deliveryUnits, setDeliveryUnits] = useState<Record<string, DeliveryUnit[]>>({});
  const [packages, setPackages] = useState<Package[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const loadCourseDetails = async () => {
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

      // 2. Fetch modules
      const { data: modulesData, error: modulesError } = await supabase
        .from('course_modules')
        .select('*')
        .eq('course_id', courseId)
        .order('module_order');

      if (!modulesError && modulesData) {
        setModules(modulesData);

        // 3. Fetch delivery units for each module
        const unitPromises = modulesData.map(module =>
          supabase
            .from('course_delivery_units')
            .select('*')
            .eq('module_id', module.id)
            .order('id')
        );

        const unitResults = await Promise.all(unitPromises);
        const unitMap: Record<string, DeliveryUnit[]> = {};
        modulesData.forEach((module, index) => {
          if (!unitResults[index].error && unitResults[index].data) {
            unitMap[module.id] = unitResults[index].data;
          }
        });
        setDeliveryUnits(unitMap);
      }

      // 4. Fetch packages
      const { data: packageData, error: packageError } = await supabase
        .from('course_packages')
        .select('*')
        .eq('course_id', courseId)
        .order('price');

      if (!packageError && packageData) {
        setPackages(packageData);
      }

      // 5. Fetch teachers assigned to this course
      const { data: teacherData, error: teacherError } = await supabase
        .from('staff_courses')
        .select(`
          teacher:teacher_id (
            id,
            full_name,
            email
          )
        `)
        .eq('course_id', courseId);

      if (!teacherError && teacherData) {
        setTeachers(teacherData.map((t: any) => t.teacher).filter(Boolean));
      }

    } catch (err) {
      console.error('Error loading course details:', err);
      setNotFound(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (courseId) loadCourseDetails();
  }, [courseId]);

  const handleDelete = async () => {
    if (!course) return;
    if (!confirm(`Delete "${course.name}" and all associated data? This cannot be undone.`)) return;

    try {
      // Delete in order: delivery units → modules → packages → staff_courses → course
      for (const module of modules) {
        await supabase
          .from('course_delivery_units')
          .delete()
          .eq('module_id', module.id);
      }

      await supabase.from('course_modules').delete().eq('course_id', course.id);
      await supabase.from('course_packages').delete().eq('course_id', course.id);
      await supabase.from('staff_courses').delete().eq('course_id', course.id);

      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', course.id);

      if (error) throw error;

      router.push('/dashboard/academics/courses');
    } catch (err: any) {
      alert('Error deleting course: ' + err.message);
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      draft: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

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
          <Link href={`/dashboard/academics/courses/edit?id=${course.id}`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              ✏️ Edit Course
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

      <div className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        {/* Course Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Status:</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(course.status)}`}>
              {course.status?.toUpperCase() || 'DRAFT'}
            </span>
          </div>
          <div><span className="text-gray-500">Course Type:</span> <span className="font-medium">{course.course_type || 'N/A'}</span></div>
          <div><span className="text-gray-500">Age Group:</span> <span className="font-medium">{course.age_group || 'N/A'}</span></div>
          <div><span className="text-gray-500">Duration:</span> <span className="font-medium">{course.duration_hours || 'N/A'} hours</span></div>
          <div><span className="text-gray-500">Scheduling:</span> <span className="font-medium">{course.scheduling_preference || 'N/A'}</span></div>
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

      {/* Teachers Section */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
        <h3 className="font-bold text-gray-800 mb-4">👨‍🏫 Assigned Teachers ({teachers.length})</h3>
        {teachers.length === 0 ? (
          <p className="text-gray-500 text-sm">No teachers assigned to this course yet.</p>
        ) : (
          <div className="space-y-2">
            {teachers.map((teacher) => (
              <div key={teacher.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <span className="font-medium text-gray-800">{teacher.full_name}</span>
                  <span className="ml-4 text-sm text-gray-500">{teacher.email}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Packages Section */}
      {packages.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
          <h3 className="font-bold text-gray-800 mb-4">💰 Pricing Packages ({packages.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="font-medium text-gray-800">{pkg.name}</div>
                <div className="text-sm text-gray-600">${pkg.price} - {pkg.sessions} sessions</div>
                {pkg.description && <div className="text-xs text-gray-500 mt-1">{pkg.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modules Section */}
      {modules.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-6">
          <h3 className="font-bold text-gray-800 mb-4">📚 Curriculum Modules ({modules.length})</h3>
          <div className="space-y-4">
            {modules.map((module) => (
              <div key={module.id} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-3 border-b">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-gray-800">Module {module.module_order}</span>
                      <span className="ml-3 font-bold">{module.title}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {module.level || 'N/A'}
                    </span>
                  </div>
                  {module.description && (
                    <p className="text-sm text-gray-600 mt-1">{module.description}</p>
                  )}
                </div>
                {deliveryUnits[module.id]?.length > 0 && (
                  <div className="p-3 bg-white">
                    <div className="text-xs font-medium text-gray-500 mb-2">Delivery Units:</div>
                    <div className="space-y-1">
                      {deliveryUnits[module.id].map((unit) => (
                        <div key={unit.id} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                          <span className="font-medium">{unit.title}</span>
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span>{unit.unit_type}</span>
                            <span>{unit.duration_minutes} min</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}