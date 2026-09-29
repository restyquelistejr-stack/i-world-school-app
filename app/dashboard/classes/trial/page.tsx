// app/dashboard/classes/trial/page.tsx - COMPLETE REWRITE
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function TrialClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    module_id: '',
    session_type: 'private' as 'private' | 'group',
    hours: 2,
    start_date: '',
    preferred_days: [] as number[],
    start_time: '09:00',
    end_time: '17:00',
  });

  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [filteredModules, setFilteredModules] = useState<any[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');

  const DAYS = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('courses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setCourses(data || []);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  }, []);

  const loadModules = useCallback(async (courseId: string) => {
    try {
      const { data } = await supabase
        .from('course_modules')
        .select('id, title, level')
        .eq('course_id', courseId)
        .order('title');
      setFilteredModules(data || []);
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }, []);

  useEffect(() => {
    if (formData.course_id) {
      loadModules(formData.course_id);
    } else {
      setFilteredModules([]);
    }
  }, [formData.course_id, loadModules]);

  const searchStudents = useCallback(async () => {
    if (studentSearchTerm.length < 2) return;
    setSearchingStudent(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'student')
        .eq('is_active', true)
        .ilike('full_name', `%${studentSearchTerm}%`)
        .limit(10);
      setStudents(data || []);
    } catch (error) {
      console.error('Error searching students:', error);
    }
    setSearchingStudent(false);
  }, [studentSearchTerm]);

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      preferred_days: prev.preferred_days.includes(day)
        ? prev.preferred_days.filter(d => d !== day)
        : [...prev.preferred_days, day]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.student_id) {
      alert('Please select a student.');
      return;
    }
    if (!formData.course_id) {
      alert('Please select a course.');
      return;
    }
    if (!formData.module_id) {
      alert('Please select a module.');
      return;
    }
    if (formData.preferred_days.length === 0) {
      alert('Please select at least one preferred day.');
      return;
    }
    if (!formData.start_date) {
      alert('Please select a start date.');
      return;
    }

    setLoading(true);
    
    const params = new URLSearchParams({
      student_id: formData.student_id,
      course_id: formData.course_id,
      module_id: formData.module_id,
      session_type: formData.session_type,
      hours: formData.hours.toString(),
      start_date: formData.start_date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      preferred_days: JSON.stringify(formData.preferred_days),
    });
    
    router.push(`/dashboard/classes/trial/results?${params.toString()}`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">🎯 Trial Class Booking</h1>
        <span className="text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
          Single Session
        </span>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-700">
          💡 This is a <strong>trial class</strong> - only <strong>one session</strong> will be scheduled.
          Set your availability and we'll find qualified teachers with their earliest available slots.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 border border-gray-200 space-y-6">
        {/* Student Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={studentSearchTerm}
              onChange={(e) => {
                setStudentSearchTerm(e.target.value);
                if (e.target.value.length >= 2) searchStudents();
              }}
              placeholder="Search by student name..."
              className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {students.length > 0 && (
            <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
              {students.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, student_id: student.id });
                    setStudents([]);
                    setStudentSearchTerm(student.full_name);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 flex justify-between items-center"
                >
                  <span className="font-medium">{student.full_name}</span>
                  <span className="text-sm text-gray-500">{student.email}</span>
                </button>
              ))}
            </div>
          )}
          {formData.student_id && (
            <p className="text-sm text-green-600 mt-1">✅ Student selected</p>
          )}
        </div>

        {/* Course Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
            <select
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value, module_id: '' })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a course...</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Module / Level *</label>
            <select
              value={formData.module_id}
              onChange={(e) => setFormData({ ...formData, module_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              disabled={!formData.course_id}
            >
              <option value="">
                {!formData.course_id ? 'Select a course first...' : 'Select a module...'}
              </option>
              {filteredModules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title} ({module.level || 'N/A'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Session Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Session Type *</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, session_type: 'private' })}
              className={`px-6 py-2 rounded-lg border-2 transition ${
                formData.session_type === 'private'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              👤 Private Trial
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, session_type: 'group' })}
              className={`px-6 py-2 rounded-lg border-2 transition ${
                formData.session_type === 'group'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              👥 Group Trial
            </button>
          </div>
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Start Date *</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min={new Date().toISOString().split('T')[0]}
              required
            />
            <p className="text-xs text-gray-400 mt-1">When the student can start the trial</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Session</label>
            <select
              value={formData.hours}
              onChange={(e) => setFormData({ ...formData, hours: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 hour</option>
              <option value={1.5}>1.5 hours</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours</option>
            </select>
          </div>
        </div>

        {/* Availability */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Student Availability *</label>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Available Days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition ${
                      formData.preferred_days.includes(day.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {day.label.slice(0, 3)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Selected: {formData.preferred_days.map(d => DAYS.find(day => day.value === d)?.label).join(', ') || 'None'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Available From</label>
                <input
                  type="time"
                  step="900"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Available Until</label>
                <input
                  type="time"
                  step="900"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Searching...
              </>
            ) : (
              '🔍 Find Available Teachers'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}