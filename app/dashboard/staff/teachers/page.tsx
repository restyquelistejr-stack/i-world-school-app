'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  specialization: string;
  profile_headline: string;
  hourly_rate: number;
  years_experience: number;
  is_active: boolean;
  availability_count: number;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    setLoading(true);
    try {
      console.log('🔄 Loading teachers...');
      
      // 1. Get all teachers
      const { data: teachersData, error: teachersError } = await supabase
        .from('teachers')
        .select('*')
        .order('specialization');

      if (teachersError) {
        console.error('❌ Teachers error:', teachersError);
        alert('Failed to load teachers: ' + teachersError.message);
        setLoading(false);
        return;
      }

      console.log('✅ Teachers loaded:', teachersData?.length || 0);

      if (!teachersData || teachersData.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      // 2. Get user info for each teacher
      const teacherIds = teachersData.map((t: any) => t.id);
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', teacherIds);

      if (usersError) {
        console.error('❌ Users error:', usersError);
      }

      const userMap: Record<string, any> = {};
      (usersData || []).forEach((u: any) => {
        userMap[u.id] = u;
      });

      // 3. Get availability count for each teacher (ONE BY ONE)
      const availabilityCounts: Record<string, number> = {};
      for (const teacher of teachersData) {
        const { count, error: countError } = await supabase
          .from('teacher_availability')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', teacher.id);

        if (!countError) {
          availabilityCounts[teacher.id] = count || 0;
        } else {
          console.error('Count error for teacher', teacher.id, countError);
          availabilityCounts[teacher.id] = 0;
        }
      }

      // 4. Merge all data
      const mergedTeachers = teachersData.map((teacher: any) => ({
        ...teacher,
        email: userMap[teacher.id]?.email || 'No email',
        full_name: userMap[teacher.id]?.full_name || 'Unknown',
        availability_count: availabilityCounts[teacher.id] || 0,
      }));

      console.log('✅ Merged teachers:', mergedTeachers.length);
      setTeachers(mergedTeachers);
      
    } catch (error: any) {
      console.error('❌ Unexpected error:', error);
      alert('Failed to load teachers: ' + error.message);
    }
    
    setLoading(false);
  }

  async function toggleTeacherStatus(teacherId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ is_active: !currentStatus })
        .eq('id', teacherId);

      if (error) throw error;
      loadTeachers();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function deleteTeacher(teacherId: string) {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
      // Delete availability first
      await supabase
        .from('teacher_availability')
        .delete()
        .eq('teacher_id', teacherId);

      // Delete teacher
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);

      if (error) throw error;
      loadTeachers();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  const filteredTeachers = teachers.filter(teacher => {
    const matchesSearch = 
      teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.specialization && teacher.specialization.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterStatus === 'all' || 
      (filterStatus === 'active' && teacher.is_active) ||
      (filterStatus === 'inactive' && !teacher.is_active);
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👨‍🏫 Teachers</h1>
          <p className="text-sm text-gray-500">Manage all teachers and their availability</p>
        </div>
        <Link href="/dashboard/staff/teachers/create">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            + Add Teacher
          </button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by name, email, or specialization..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Teachers</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={loadTeachers}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Teacher Cards */}
      {filteredTeachers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No teachers found. Add your first teacher!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeachers.map((teacher) => (
            <div key={teacher.id} className="bg-white rounded-lg shadow border border-gray-100 hover:shadow-lg transition">
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">{teacher.full_name}</h3>
                    <p className="text-sm text-gray-500">{teacher.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    teacher.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {teacher.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {teacher.specialization && (
                  <div className="mt-2 text-sm text-gray-600">
                    {teacher.specialization}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                  {teacher.hourly_rate > 0 && (
                    <span>💰 ${teacher.hourly_rate}/hr</span>
                  )}
                  {teacher.years_experience > 0 && (
                    <span>📅 {teacher.years_experience} years</span>
                  )}
                  <span>📅 {teacher.availability_count} slots</span>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <Link href={`/dashboard/staff/teachers/${teacher.id}`}>
                    <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      👤 Profile
                    </button>
                  </Link>
                  <Link href={`/dashboard/staff/teachers/${teacher.id}/availability`}>
                    <button className="text-sm text-green-600 hover:text-green-800 font-medium">
                      📅 Availability
                    </button>
                  </Link>
                  <button
                    onClick={() => toggleTeacherStatus(teacher.id, teacher.is_active)}
                    className={`text-sm font-medium ${
                      teacher.is_active ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800'
                    }`}
                  >
                    {teacher.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deleteTeacher(teacher.id)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}