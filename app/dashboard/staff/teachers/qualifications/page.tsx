// app/dashboard/staff/teachers/qualifications/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  name: string;
  modules: Module[];
  selectedModules: string[];
  isAllSelected: boolean;
}

interface Module {
  id: string;
  title: string;
  level: string;
}

export default function TeacherQualificationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (teacherId) {
      loadData();
    } else {
      router.push('/dashboard/staff/teachers');
    }
  }, [teacherId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      // 1. Get teacher name
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', teacherId)
        .single();

      if (userData) setTeacherName(userData.full_name);

      // 2. Get all courses with their modules
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      const coursesWithModules: Course[] = [];

      for (const course of coursesData || []) {
        const { data: modulesData } = await supabase
          .from('course_modules')
          .select('id, title, level')
          .eq('course_id', course.id)
          .order('module_order');

        coursesWithModules.push({
          id: course.id,
          name: course.name,
          modules: modulesData || [],
          selectedModules: [],
          isAllSelected: false,
        });
      }

      // 3. Load existing qualifications
      await loadExistingQualifications(coursesWithModules);

      // 4. Expand first course by default
      if (coursesWithModules.length > 0) {
        setExpandedCourses({ [coursesWithModules[0].id]: true });
      }

    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message || 'Failed to load data');
    }

    setLoading(false);
  }

  async function loadExistingQualifications(coursesList: Course[]) {
    try {
      // 1. Get course-level qualifications (staff_courses)
      let courseLevelCourseIds: string[] = [];
      try {
        const { data: staffCourses, error: scError } = await supabase
          .from('staff_courses')
          .select('course_id')
          .eq('staff_id', teacherId);

        if (scError) {
          console.error('Error loading staff_courses:', scError);
        } else if (staffCourses) {
          courseLevelCourseIds = staffCourses.map(sc => sc.course_id);
          console.log('Course-level qualifications found:', courseLevelCourseIds);
        }
      } catch (err) {
        console.error('Exception loading staff_courses:', err);
        courseLevelCourseIds = [];
      }

      // 2. Get module-level qualifications (teacher_modules)
      let moduleLevelModuleIds: string[] = [];
      try {
        const { data: teacherModules, error: tmError } = await supabase
          .from('teacher_modules')
          .select('module_id')
          .eq('teacher_id', teacherId)
          .eq('is_active', true);

        if (tmError) {
          console.error('Error loading teacher_modules:', tmError);
        } else if (teacherModules) {
          moduleLevelModuleIds = teacherModules.map(tm => tm.module_id);
          console.log('Module-level qualifications found:', moduleLevelModuleIds);
        }
      } catch (err) {
        console.error('Exception loading teacher_modules:', err);
        moduleLevelModuleIds = [];
      }

      // 3. Update courses with existing selections
      const updatedCourses = coursesList.map(course => {
        // Check if this course has a course-level qualification
        const hasCourseLevel = courseLevelCourseIds.includes(course.id);

        // Find which modules are selected for this course
        const selectedModuleIds: string[] = [];
        for (const moduleId of moduleLevelModuleIds) {
          const moduleBelongsToCourse = course.modules.some(m => m.id === moduleId);
          if (moduleBelongsToCourse) {
            selectedModuleIds.push(moduleId);
          }
        }

        // Check if all modules are selected (either via course-level or individual)
        const allModulesSelected = course.modules.length > 0 && 
          selectedModuleIds.length === course.modules.length;

        // If course-level qualification exists, mark as all selected
        const isAllSelected = hasCourseLevel || allModulesSelected;

        return {
          ...course,
          selectedModules: selectedModuleIds,
          isAllSelected: isAllSelected,
        };
      });

      setCourses(updatedCourses);

    } catch (error) {
      console.error('Error loading qualifications:', error);
    }
  }

  const toggleCourseExpand = (courseId: string) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  };

  const toggleAllModules = (courseId: string) => {
    setCourses(prevCourses =>
      prevCourses.map(c => {
        if (c.id === courseId) {
          const newIsAllSelected = !c.isAllSelected;
          return {
            ...c,
            isAllSelected: newIsAllSelected,
            selectedModules: newIsAllSelected ? c.modules.map(m => m.id) : [],
          };
        }
        return c;
      })
    );
  };

  const toggleModule = (courseId: string, moduleId: string) => {
    setCourses(prevCourses =>
      prevCourses.map(c => {
        if (c.id === courseId) {
          if (c.isAllSelected) return c;

          const isSelected = c.selectedModules.includes(moduleId);
          const newSelectedModules = isSelected
            ? c.selectedModules.filter(id => id !== moduleId)
            : [...c.selectedModules, moduleId];
          
          const allModulesSelected = newSelectedModules.length === c.modules.length;
          
          return {
            ...c,
            selectedModules: newSelectedModules,
            isAllSelected: allModulesSelected,
          };
        }
        return c;
      })
    );
  };

  // ✅ FIXED: Save both course-level AND module-level qualifications
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // 1. Collect all selections from the current state
      const courseLevelSelections: string[] = [];
      const moduleLevelSelections: string[] = [];

      for (const course of courses) {
        if (course.isAllSelected) {
          // If "Select All" is checked, save at course level AND all modules
          courseLevelSelections.push(course.id);
          // ✅ Also save all modules for this course to teacher_modules
          const allModuleIds = course.modules.map(m => m.id);
          moduleLevelSelections.push(...allModuleIds);
        } else if (course.selectedModules.length > 0) {
          // Otherwise save individual modules only
          moduleLevelSelections.push(...course.selectedModules);
        }
      }

      console.log('=== SAVING QUALIFICATIONS ===');
      console.log('Course-level selections:', courseLevelSelections);
      console.log('Module-level selections:', moduleLevelSelections);

      // 2. Delete ALL existing qualifications for this teacher
      // Delete from staff_courses
      try {
        const { error: deleteCourseError } = await supabase
          .from('staff_courses')
          .delete()
          .eq('staff_id', teacherId);

        if (deleteCourseError) {
          console.error('Error deleting staff_courses:', deleteCourseError);
          throw new Error('Failed to delete existing course qualifications: ' + deleteCourseError.message);
        }
      } catch (err: any) {
        console.error('Exception deleting staff_courses:', err);
        throw new Error('Failed to delete existing course qualifications: ' + err.message);
      }

      // Delete from teacher_modules
      try {
        const { error: deleteModuleError } = await supabase
          .from('teacher_modules')
          .delete()
          .eq('teacher_id', teacherId);

        if (deleteModuleError) {
          console.error('Error deleting teacher_modules:', deleteModuleError);
          throw new Error('Failed to delete existing module qualifications: ' + deleteModuleError.message);
        }
      } catch (err: any) {
        console.error('Exception deleting teacher_modules:', err);
        throw new Error('Failed to delete existing module qualifications: ' + err.message);
      }

      // 3. Insert new course-level qualifications (staff_courses)
      if (courseLevelSelections.length > 0) {
        try {
          const courseInserts = courseLevelSelections.map(courseId => ({
            staff_id: teacherId,
            course_id: courseId,
          }));
          const { error: courseError } = await supabase.from('staff_courses').insert(courseInserts);
          if (courseError) {
            console.error('Course insert error:', courseError);
            throw new Error('Failed to save course qualifications: ' + courseError.message);
          }
          console.log(`✅ Saved ${courseInserts.length} course-level qualifications`);
        } catch (err: any) {
          console.error('Exception inserting staff_courses:', err);
          throw new Error('Failed to save course qualifications: ' + err.message);
        }
      }

      // 4. Insert new module-level qualifications (teacher_modules)
      if (moduleLevelSelections.length > 0) {
        try {
          const moduleInserts = moduleLevelSelections.map(moduleId => ({
            teacher_id: teacherId,
            module_id: moduleId,
            is_active: true,
          }));
          const { error: moduleError } = await supabase.from('teacher_modules').insert(moduleInserts);
          if (moduleError) {
            console.error('Module insert error:', moduleError);
            throw new Error('Failed to save module qualifications: ' + moduleError.message);
          }
          console.log(`✅ Saved ${moduleInserts.length} module-level qualifications`);
        } catch (err: any) {
          console.error('Exception inserting teacher_modules:', err);
          throw new Error('Failed to save module qualifications: ' + err.message);
        }
      }

      alert('✅ Qualifications saved successfully!');
      
      // 5. Reload data to reflect changes
      await loadData();

    } catch (error: any) {
      console.error('Error saving qualifications:', error);
      setError(error.message || 'Failed to save qualifications');
      alert('❌ Error: ' + error.message);
    }

    setSaving(false);
  };

  const getLevelLabel = (level: string) => {
    if (!level) return '';
    return level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/dashboard/staff/teachers/view?id=${teacherId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Profile</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          🎓 {teacherName}'s Qualifications
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-800">Course & Module Qualifications</h3>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠️ Error: {error}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-6">
          Select which courses and modules this teacher is qualified to teach.
          <br />
          <span className="text-xs text-blue-600">💡 Tip: Check "Select All" to qualify for the entire course.</span>
        </p>

        {courses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No courses found. Please create courses first.</p>
        ) : (
          <div className="space-y-4">
            {courses.map((course) => {
              const isExpanded = expandedCourses[course.id] || false;
              const hasModules = course.modules.length > 0;
              const allModulesSelected = course.isAllSelected;

              return (
                <div key={course.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Course Header */}
                  <div 
                    className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                    onClick={() => toggleCourseExpand(course.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                      <span className="font-semibold text-gray-800">{course.name}</span>
                      <span className="text-xs text-gray-400">
                        ({course.modules.length} module{course.modules.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        allModulesSelected 
                          ? 'bg-green-100 text-green-700'
                          : course.selectedModules.length > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-500'
                      }`}>
                        {allModulesSelected 
                          ? '✅ All Modules'
                          : course.selectedModules.length > 0
                            ? `${course.selectedModules.length}/${course.modules.length} Modules`
                            : 'None Selected'}
                      </span>
                    </div>
                  </div>

                  {/* Modules List - Expandable */}
                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-gray-100">
                      {!hasModules ? (
                        <p className="text-sm text-gray-400">No modules found for this course.</p>
                      ) : (
                        <div className="space-y-3">
                          {/* Select All Option */}
                          <div 
                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition ${
                              allModulesSelected
                                ? 'bg-green-50 border-green-300'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            }`}
                            onClick={() => toggleAllModules(course.id)}
                          >
                            <input
                              type="checkbox"
                              checked={allModulesSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className={`font-medium text-sm ${
                              allModulesSelected ? 'text-green-700' : 'text-blue-700'
                            }`}>
                              {allModulesSelected ? '✅ All Modules Selected' : '☐ Select All Modules'}
                            </span>
                            <span className="text-xs text-gray-500">
                              (Qualifies for the entire course)
                            </span>
                          </div>

                          {/* Individual Modules */}
                          <div className="ml-6 space-y-2">
                            {course.modules.map((module) => {
                              const isSelected = course.selectedModules.includes(module.id);
                              const isDisabled = allModulesSelected;
                              
                              return (
                                <div 
                                  key={module.id}
                                  className={`flex items-center gap-3 p-2 rounded-lg transition ${
                                    isSelected || isDisabled
                                      ? 'bg-green-50 border border-green-200'
                                      : 'hover:bg-gray-50'
                                  } ${isDisabled ? 'opacity-75' : 'cursor-pointer'}`}
                                  onClick={() => !isDisabled && toggleModule(course.id, module.id)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected || isDisabled}
                                    onChange={() => {}}
                                    className="w-4 h-4 text-blue-600 rounded"
                                    disabled={isDisabled}
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-800">
                                      Level: {getLevelLabel(module.level) || 'N/A'}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                      → {module.title}
                                    </span>
                                  </div>
                                  {isDisabled && (
                                    <span className="text-xs text-gray-400 ml-2">(Included via "Select All")</span>
                                  )}
                                  {!isDisabled && isSelected && (
                                    <span className="text-xs text-green-600 ml-2">✓ Selected</span>
                                  )}
                                  {!isDisabled && !isSelected && (
                                    <span className="text-xs text-gray-400 ml-2">Click to select</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}