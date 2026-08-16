'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function ViewCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);

  const unwrappedParams = use(params);
  const courseId = unwrappedParams.id;

  useEffect(() => {
    if (!courseId) return;
    async function loadCourse() {
      try {
        const { data: courseData } = await supabase
          .from('courses')
          .select(`*, packages:course_packages (*)`)
          .eq('id', courseId)
          .single();
        setCourse(courseData);

        const { data: modulesData } = await supabase
          .from('course_modules')
          .select(`*, delivery_units:course_delivery_units (*)`)
          .eq('course_id', courseId)
          .order('module_order', { ascending: true });
        setModules(modulesData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  // Group modules by level
  const groupedModules = modules.reduce((groups: any, module: any) => {
    const level = module.level || 'General Course Content';
    if (!groups[level]) groups[level] = [];
    groups[level].push(module);
    return groups;
  }, {});

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (!course) return <div className="p-10 text-center text-red-500">Course not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      
      {/* Header with Dynamic Hyperlink */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <div>
          <Link href="/dashboard/academics/courses" className="text-blue-600 hover:underline text-sm mb-2 inline-block">← Back to Courses</Link>
          <h1 className="text-3xl font-bold text-gray-900">{course.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* ✅ Dynamic Link */}
          {course.link_url && (
            <a 
              href={course.link_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              🔗 View Public Page
            </a>
          )}
          <Link href={`/dashboard/academics/courses/${courseId}/edit`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">✏️ Edit Course</button>
          </Link>
        </div>
      </div>

      {/* 1. Course Details */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-4">Course Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-sm mb-6">
          <div><span className="font-medium text-gray-500">Age Group:</span> <span className="text-gray-900">{course.age_group}</span></div>
          <div><span className="font-medium text-gray-500">Type:</span> <span className="text-gray-900 capitalize">{course.course_type.replace('_', ' ')}</span></div>
          <div><span className="font-medium text-gray-500">Duration:</span> <span className="text-gray-900">{course.duration_hours} hours</span></div>
          <div><span className="font-medium text-gray-500">Delivery:</span> <span className="text-gray-900">{course.delivery_mode}</span></div>
        </div>
        {course.description && (
          <div className="pt-4 border-t border-gray-100 text-gray-700 text-sm whitespace-pre-wrap">{course.description}</div>
        )}
      </div>

      {/* 2. Unified PRICING Card */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-4 flex items-center gap-2"><span>💰 Pricing</span></h2>
        
        <div className="space-y-4">
          {/* Hourly Section */}
          {course.pricing_mode === 'hourly' && (
            <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="font-medium text-gray-700 mb-2">Hourly Rates</div>
              <div className="flex justify-between border-b border-gray-200 pb-1"><span className="font-medium">On-Site (per hour)</span><span className="font-bold text-gray-900">${course.price_per_hour_on_site}</span></div>
              <div className="flex justify-between border-b border-gray-200 pb-1"><span className="font-medium">Online (per hour)</span><span className="font-bold text-gray-900">${course.price_per_hour_online}</span></div>
              <div className="flex justify-between text-gray-500 text-xs pt-1"><span>20+ hrs On-Site</span><span>${course.price_20plus_on_site}/hr</span></div>
              <div className="flex justify-between text-gray-500 text-xs"><span>20+ hrs Online</span><span>${course.price_20plus_online}/hr</span></div>
              <div className="flex justify-between text-gray-500 text-xs"><span>50+ hrs On-Site</span><span>${course.price_50plus_on_site}/hr</span></div>
              <div className="flex justify-between text-gray-500 text-xs"><span>50+ hrs Online</span><span>${course.price_50plus_online}/hr</span></div>
            </div>
          )}

          {/* Separator if both exist */}
          {course.pricing_mode === 'hourly' && course.packages?.filter((p: any) => p.is_active).length > 0 && (
            <div className="border-t border-gray-200 my-2"></div>
          )}

          {/* Package Section */}
          {course.packages?.filter((p: any) => p.is_active).length > 0 && (
            <div className="space-y-3">
              {course.packages.filter((p: any) => p.is_active).map((pkg: any, index: number) => (
                <div key={pkg.id} className={`bg-white p-4 rounded-lg border ${index !== 0 ? 'border-t-0' : ''} border-gray-200 first:rounded-t-lg last:rounded-b-lg shadow-sm`}>
                  <div className="flex justify-between items-center">
                    <div><div className="font-medium text-gray-800">{pkg.name}</div><div className="text-xs text-gray-500">{pkg.sessions} sessions</div></div>
                    <div className="text-right"><div className="font-bold text-xl text-blue-600">${pkg.amount}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fallback if empty */}
          {course.pricing_mode !== 'hourly' && (!course.packages || course.packages.filter((p: any) => p.is_active).length === 0) && (
            <p className="text-gray-500 italic">No active pricing set.</p>
          )}
        </div>
      </div>

      {/* 3. Course Modules (Full Width, below Pricing) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-6">📚 Course Modules</h2>
        {modules.length === 0 ? (
          <p className="text-gray-500 text-center py-6">No modules defined.</p>
        ) : (
          <div className="space-y-8">
            {Object.keys(groupedModules).map((levelName) => (
              <div key={levelName} className="border-l-4 border-blue-500 pl-4">
                
                {/* ✅ Upper Case & Cleaned Level */}
                <h3 className="text-xl font-bold text-gray-900 mb-1 uppercase">
                  LEVEL: {levelName.replace(/_/g, ' ')}
                </h3>
                
                {groupedModules[levelName][0]?.description && (
                  <p className="text-sm text-gray-600 mb-4 italic">
                    {groupedModules[levelName][0].description}
                  </p>
                )}
                <div className="space-y-3 pl-2">
                  {groupedModules[levelName].map((mod: any, index: number) => (
                    <div key={mod.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      
                      {/* ✅ Module Name Label */}
                      <h4 className="font-semibold text-gray-800 mb-2">
                        <span className="text-blue-600 mr-2">Module Name {index + 1}:</span> {mod.title}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {mod.delivery_units?.sort((a: any, b: any) => a.unit_order - b.unit_order).map((unit: any) => (
                          <div key={unit.id} className="bg-white p-3 rounded border border-gray-100 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                              <span className="capitalize text-xs text-white bg-blue-500 px-2 py-0.5 rounded-full">{unit.unit_type}</span>
                              <span className="font-medium text-gray-700">{unit.title}</span>
                            </div>
                            <span className="text-gray-500 text-xs">{unit.duration_minutes} mins</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}