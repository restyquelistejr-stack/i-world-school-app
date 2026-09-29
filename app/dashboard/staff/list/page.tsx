'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
  employee_id?: string;
  // Teacher-specific
  specialization?: string;
  teacher_type?: string;
  profile_headline?: string;
  hourly_rate?: number;
  years_experience?: number;
  availability_count?: number;
}

export default function StaffListPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    try {
      // 1. Get all users with staff roles
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'staff', 'teacher', 'facilities'])
        .order('full_name');

      if (usersError) throw new Error(usersError.message);

      // 2. Get teacher-specific data
      const teacherIds = usersData.filter(u => u.role === 'teacher').map(u => u.id);
      let teacherMap: Record<string, any> = {};

      if (teacherIds.length > 0) {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('*')
          .in('id', teacherIds);

        if (teacherData) {
          teacherData.forEach(t => { teacherMap[t.id] = t; });
        }

        // Get availability counts
        for (const teacherId of teacherIds) {
          const { count } = await supabase
            .from('teacher_availability')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('is_active', true);
          
          if (teacherMap[teacherId]) {
            teacherMap[teacherId].availability_count = count || 0;
          }
        }
      }

      // 3. Merge data
      const mergedStaff = usersData.map((user: any) => {
        const teacher = teacherMap[user.id] || {};
        return {
          ...user,
          specialization: teacher.specialization || null,
          teacher_type: teacher.teacher_type || null,
          profile_headline: teacher.profile_headline || null,
          hourly_rate: teacher.hourly_rate || null,
          years_experience: teacher.years_experience || null,
          availability_count: teacher.availability_count || 0,
        };
      });

      setStaff(mergedStaff);

    } catch (error: any) {
      console.error('Error loading staff:', error);
      alert('Failed to load staff: ' + error.message);
    }
    setLoading(false);
  }

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      staff: 'bg-gray-100 text-gray-800',
      teacher: 'bg-blue-100 text-blue-800',
      facilities: 'bg-yellow-100 text-yellow-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, string> = {
      admin: '👑',
      staff: '👤',
      teacher: '👨‍🏫',
      facilities: '🔧',
    };
    return icons[role] || '👤';
  };

  const filteredStaff = staff.filter(member => {
    const matchesSearch =
      member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member.specialization && member.specialization.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = roleFilter === 'all' || member.role === roleFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && member.is_active) ||
      (statusFilter === 'inactive' && !member.is_active);

    return matchesSearch && matchesRole && matchesStatus;
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
          <h1 className="text-2xl font-bold text-gray-900">👥 Staff Directory</h1>
          <p className="text-sm text-gray-500">Manage all staff members including teachers</p>
        </div>
        <Link href="/dashboard/staff/edit">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            + Add Staff
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
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="teacher">Teacher</option>
          <option value="facilities">Facilities</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={loadStaff} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
          🔄 Refresh
        </button>
      </div>

      {/* Staff Grid */}
      {filteredStaff.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center border border-gray-200">
          <p className="text-gray-500">No staff members found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((member) => (
            <div key={member.id} className="bg-white rounded-lg shadow border border-gray-100 hover:shadow-lg transition">
              <Link href={`/dashboard/staff/view?id=${member.id}`}>
                <div className="p-5 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getRoleIcon(member.role)}</span>
                        <h3 className="font-bold text-gray-900">{member.full_name}</h3>
                      </div>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleBadgeColor(member.role)}`}>
                      {member.role}
                    </span>
                    {member.teacher_type && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${member.teacher_type === 'full-time' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {member.teacher_type}
                      </span>
                    )}
                  </div>

                  {member.role === 'teacher' && (
                    <>
                      {member.specialization && (
                        <div className="mt-2 text-sm text-blue-600">📚 {member.specialization}</div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        {member.hourly_rate && member.hourly_rate > 0 && (
                          <span>💰 ${member.hourly_rate}/hr</span>
                        )}
                        {member.years_experience && member.years_experience > 0 && (
                          <span>📅 {member.years_experience} years</span>
                        )}
                        <span>📋 {member.availability_count || 0} slots</span>
                      </div>
                    </>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}