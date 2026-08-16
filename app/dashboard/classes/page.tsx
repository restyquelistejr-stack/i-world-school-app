'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

interface Class {
  id: string;
  student_id: string;
  course_id: string;
  package_id: string;
  total_sessions: number;
  session_duration: number;
  status: string;
  created_at: string;
  student: {
    full_name: string;
    email: string;
  };
  course: {
    name: string;
    level: string;
  };
  package: {
    name: string;
  };
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select(`
          *,
          student:student_id(id, full_name, email),
          course:course_id(id, name, level),
          package:package_id(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
    setLoading(false);
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: '📅 Scheduled',
      in_progress: '🔄 In Progress',
      completed: '✅ Completed',
      cancelled: '❌ Cancelled',
      archived: '📦 Archived',
    };
    return labels[status] || status;
  };

  const filteredClasses = filter === 'all' 
    ? classes 
    : classes.filter(c => c.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📚 Classes</h1>
          <p className="text-sm text-gray-500">Manage all classes and schedules</p>
        </div>
        <Link href="/dashboard/classes/add">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
            <span>+</span> Add Class
          </button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('scheduled')}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            filter === 'scheduled' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          📅 Scheduled
        </button>
        <button
          onClick={() => setFilter('in_progress')}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            filter === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          🔄 In Progress
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            filter === 'completed' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          ✅ Completed
        </button>
        <button
          onClick={() => setFilter('cancelled')}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            filter === 'cancelled' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          ❌ Cancelled
        </button>
      </div>

      {/* Classes Grid */}
      {filteredClasses.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📚</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No classes found</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first class</p>
          <Link href="/dashboard/classes/add">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              + Add Class
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClasses.map((cls) => (
            <Link key={cls.id} href={`/dashboard/classes/${cls.id}`}>
              <div className="bg-white rounded-lg shadow border border-gray-100 hover:shadow-lg transition cursor-pointer p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">{cls.course?.name || 'Unknown Course'}</h3>
                    <p className="text-sm text-gray-500">
                      {cls.course?.level || ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(cls.status)}`}>
                    {getStatusLabel(cls.status)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {cls.student && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span>👤</span>
                      <span>{cls.student.full_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-600">
                    <span>📖</span>
                    <span>{cls.total_sessions} sessions × {cls.session_duration}h</span>
                  </div>
                  {cls.package && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span>📦</span>
                      <span>{cls.package.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <span>🕐</span>
                    <span>{format(parseISO(cls.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}