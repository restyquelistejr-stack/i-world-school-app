'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
// ✅ IMPORT from shared types
import type { Inquiry, Course, Module } from '../types';

interface StudentContextProps {
  inquiry: Inquiry;
  onContinue: () => void;
  onBack: () => void;
  onUpdateCourse?: (courseId: string, moduleId: string) => void;
}

export default function StudentContext({ 
  inquiry, 
  onContinue, 
  onBack, 
  onUpdateCourse 
}: StudentContextProps) {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [filteredModules, setFilteredModules] = useState<Module[]>([]);
  
  const [selectedCourseId, setSelectedCourseId] = useState<string>(inquiry.course_id || '');
  const [selectedModuleId, setSelectedModuleId] = useState<string>(inquiry.module_id || '');
  const [isEditing, setIsEditing] = useState(!inquiry.course_id);

  useEffect(() => {
    loadCourses();
    loadModules();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      // ✅ FIXED: Use a type-safe filter with explicit type annotation
      const filtered = modules.filter((module: Module) => module.course_id === selectedCourseId);
      setFilteredModules(filtered);
      if (selectedModuleId && !filtered.some((m: Module) => m.id === selectedModuleId)) {
        setSelectedModuleId('');
      }
    } else {
      setFilteredModules([]);
      setSelectedModuleId('');
    }
  }, [selectedCourseId, modules]);

  async function loadCourses() {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  }

  async function loadModules() {
    try {
      const { data, error } = await supabase
        .from('course_modules')
        .select('id, title, level, course_id')
        .order('title');

      if (error) throw error;
      setModules(data || []);
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }

  const handleContinue = () => {
    if (onUpdateCourse) {
      onUpdateCourse(selectedCourseId, selectedModuleId);
    }
    onContinue();
  };

  const getLevelLabel = (level: string) => {
    if (!level) return '';
    return level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ');
  };

  const hasCourseInfo = inquiry.course_id && inquiry.module_id;

  return (
    <div className="space-y-6">
      {/* Student Info */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl font-bold">
            {inquiry.student?.full_name?.charAt(0) || '?'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {inquiry.student?.full_name || 'Unknown Student'}
            </h3>
            <p className="text-sm text-gray-500">{inquiry.student?.email}</p>
            {inquiry.student?.phone && (
              <p className="text-sm text-gray-500">{inquiry.student?.phone}</p>
            )}
          </div>
        </div>
      </div>

      {/* Course Selection */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700">Course Details</h4>
          {hasCourseInfo && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
          )}
        </div>

        {!isEditing && hasCourseInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Course</p>
              <p className="font-medium text-gray-900">{inquiry.course?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Level</p>
              <p className="font-medium text-gray-900">
                {inquiry.module?.level || 'N/A'}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-gray-400">Module</p>
              <p className="font-medium text-gray-900">
                {inquiry.module?.title || 'N/A'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Course *
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Module / Level *
              </label>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={!selectedCourseId || filteredModules.length === 0}
              >
                <option value="">
                  {!selectedCourseId ? 'Select a course first...' : 'Select a module...'}
                </option>
                {filteredModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title} {module.level ? `(${getLevelLabel(module.level)})` : ''}
                  </option>
                ))}
              </select>
              {selectedCourseId && filteredModules.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  No modules found for this course. Please add modules first.
                </p>
              )}
            </div>

            {hasCourseInfo && (
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedCourseId(inquiry.course_id);
                  setSelectedModuleId(inquiry.module_id);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!selectedCourseId || !selectedModuleId}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}