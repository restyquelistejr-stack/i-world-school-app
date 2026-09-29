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
}

interface Session {
  id: string;
  session_number: number;
  session_name: string;
  lesson_type: string;
  description: string;
  hours: number;
  is_active: boolean;
}

const LESSON_TYPES = ['Lecture', 'Practice', 'Lab', 'Exam'];

export default function ModuleViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleId = searchParams.get('moduleId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [module, setModule] = useState<Module | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [courseName, setCourseName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [isEditingModule, setIsEditingModule] = useState(false);
  const [editModuleData, setEditModuleData] = useState({
    title: '',
    level: '',
    description: '',
    total_sessions: 0,
  });

  useEffect(() => {
    if (moduleId) {
      loadModuleDetails();
    } else {
      setLoading(false);
    }
  }, [moduleId]);

  async function loadModuleDetails() {
    setLoading(true);

    try {
      // Get module
      const { data: moduleData, error: moduleError } = await supabase
        .from('course_modules')
        .select('*')
        .eq('id', moduleId)
        .single();

      if (moduleError || !moduleData) {
        alert('Module not found');
        router.push('/dashboard/academics/courses');
        return;
      }

      setModule(moduleData);
      setCourseId(moduleData.course_id);
      setEditModuleData({
        title: moduleData.title || '',
        level: moduleData.level || '',
        description: moduleData.description || '',
        total_sessions: moduleData.total_sessions || 0,
      });

      // Get course name
      const { data: courseData } = await supabase
        .from('courses')
        .select('name')
        .eq('id', moduleData.course_id)
        .single();

      if (courseData) setCourseName(courseData.name);

      // Get sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('module_sessions')
        .select('*')
        .eq('module_id', moduleId)
        .order('session_number');

      if (!sessionsError && sessionsData) {
        setSessions(sessionsData);
      }

    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  }

  async function updateSession(sessionId: string, updates: Partial<Session>) {
    const { error } = await supabase
      .from('module_sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      alert('Error updating session: ' + error.message);
    } else {
      loadModuleDetails();
    }
  }

  async function saveAllChanges() {
    setSaving(true);
    try {
      // Save module changes if edited
      if (isEditingModule && module) {
        const { error } = await supabase
          .from('course_modules')
          .update({
            title: editModuleData.title,
            level: editModuleData.level,
            description: editModuleData.description,
            total_sessions: editModuleData.total_sessions,
          })
          .eq('id', module.id);

        if (error) throw error;
        setModule({ ...module, ...editModuleData });
        setIsEditingModule(false);
      }

      // Save all sessions
      for (const session of sessions) {
        const { error } = await supabase
          .from('module_sessions')
          .update({
            session_name: session.session_name,
            lesson_type: session.lesson_type,
            hours: session.hours,
            description: session.description,
          })
          .eq('id', session.id);

        if (error) throw error;
      }

      alert('✅ All changes saved successfully!');
      loadModuleDetails();
    } catch (error: any) {
      alert('Error saving: ' + error.message);
    }
    setSaving(false);
  }

  async function regenerateSessions() {
    if (!module) return;
    if (!confirm(`This will delete all existing classes and regenerate Class 1 to Class ${module.total_sessions}. Continue?`)) return;

    try {
      // Delete existing sessions
      await supabase
        .from('module_sessions')
        .delete()
        .eq('module_id', moduleId);

      // Generate new sessions with default hours = 2
      const newSessions = [];
      for (let i = 1; i <= module.total_sessions; i++) {
        newSessions.push({
          module_id: moduleId,
          session_number: i,
          session_name: `Class ${i}`,
          lesson_type: 'Lecture',
          hours: 2,
          description: `Session ${i} of ${module.title}`,
        });
      }

      const { error } = await supabase
        .from('module_sessions')
        .insert(newSessions);

      if (error) throw error;

      alert(`✅ Regenerated ${module.total_sessions} classes!`);
      loadModuleDetails();

    } catch (error: any) {
      alert('Error regenerating sessions: ' + error.message);
    }
  }

  async function updateModule() {
    setIsEditingModule(true);
  }

  async function cancelModuleEdit() {
    setIsEditingModule(false);
    if (module) {
      setEditModuleData({
        title: module.title || '',
        level: module.level || '',
        description: module.description || '',
        total_sessions: module.total_sessions || 0,
      });
    }
  }

  const getLessonTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      Lecture: 'bg-blue-100 text-blue-700',
      Practice: 'bg-green-100 text-green-700',
      Lab: 'bg-orange-100 text-orange-700',
      Exam: 'bg-red-100 text-red-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  if (!moduleId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <p className="text-yellow-700">No module selected.</p>
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

  if (!module) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/dashboard/academics/courses/modules?courseId=${courseId}`}>
          <button className="text-gray-600 hover:text-gray-900">← Back to Modules</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {module.title}
        </h1>
        <span className="text-sm text-gray-500">(Course: {courseName})</span>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">
        {/* Module Details with Level prominently displayed */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2">
            <span className="text-gray-500">Level:</span>
            <span className="ml-2 font-bold text-lg text-blue-600">{module.level || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Course:</span>
            <span className="ml-1 font-medium">{courseName}</span>
          </div>
          <div>
            <span className="text-gray-500">Total Sessions:</span>
            <span className="ml-1 font-medium">{module.total_sessions || 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Created Classes:</span>
            <span className="ml-1 font-medium">{sessions.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Module Order:</span>
            <span className="ml-1 font-medium">#{module.module_order}</span>
          </div>
        </div>

        {/* Module Description and Edit */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-700 mb-1">Description</h3>
              {isEditingModule ? (
                <div className="space-y-3">
                  <textarea
                    value={editModuleData.description}
                    onChange={(e) => setEditModuleData({ ...editModuleData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Total Sessions</label>
                    <input
                      type="number"
                      value={editModuleData.total_sessions}
                      onChange={(e) => setEditModuleData({ ...editModuleData, total_sessions: parseInt(e.target.value) || 0 })}
                      className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      min={0}
                    />
                    <p className="text-xs text-gray-500 mt-1">Change this and click "Regenerate Classes" to update</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{module.description || 'No description.'}</p>
              )}
            </div>
            <button
              onClick={isEditingModule ? cancelModuleEdit : updateModule}
              className="ml-4 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              {isEditingModule ? 'Cancel' : 'Edit Module'}
            </button>
          </div>
        </div>

        {/* Sessions/Classes */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800">
              📋 Classes ({sessions.length} of {module.total_sessions || 0})
              {module.total_sessions > 0 && sessions.length === module.total_sessions && ' ✅ Complete'}
            </h3>
            <div className="flex gap-2">
              {module.total_sessions > 0 && (
                <button
                  onClick={regenerateSessions}
                  className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
                >
                  🔄 Regenerate Classes
                </button>
              )}
              <button
                onClick={saveAllChanges}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
            </div>
          </div>

          {module.total_sessions === 0 ? (
            <div className="p-8 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-700 font-medium">⚠️ No sessions defined for this module.</p>
              <p className="text-sm text-yellow-600 mt-1">Click "Edit Module" above to set the total number of sessions, then click "Regenerate Classes".</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 font-medium">📌 No classes generated yet.</p>
              <p className="text-sm text-blue-600 mt-1">Click "Regenerate Classes" to create {module.total_sessions} classes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Class Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lesson Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-700">
                        {session.session_number}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={session.session_name}
                          onChange={(e) => {
                            const updated = sessions.map(s => 
                              s.id === session.id ? { ...s, session_name: e.target.value } : s
                            );
                            setSessions(updated);
                          }}
                          className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={session.lesson_type}
                          onChange={(e) => {
                            const updated = sessions.map(s => 
                              s.id === session.id ? { ...s, lesson_type: e.target.value } : s
                            );
                            setSessions(updated);
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium border ${getLessonTypeColor(session.lesson_type)}`}
                        >
                          {LESSON_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={session.hours || 2}
                          onChange={(e) => {
                            const updated = sessions.map(s => 
                              s.id === session.id ? { ...s, hours: parseFloat(e.target.value) || 2 } : s
                            );
                            setSessions(updated);
                          }}
                          className="w-16 px-2 py-1 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500"
                          min={0.5}
                          step={0.5}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={session.description || ''}
                          onChange={(e) => {
                            const updated = sessions.map(s => 
                              s.id === session.id ? { ...s, description: e.target.value } : s
                            );
                            setSessions(updated);
                          }}
                          className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="Optional description"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sessions.length > 0 && sessions.length < module.total_sessions && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              ⚠️ Only {sessions.length} of {module.total_sessions} classes created. Click "Regenerate Classes" to create all classes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}