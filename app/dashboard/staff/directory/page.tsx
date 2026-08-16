'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
  // Teacher-specific fields
  specialization?: string | null;
  profile_headline?: string | null;
  hourly_rate?: number | null;
  years_experience?: number | null;
  teaching_style?: string | null;
  max_classes_per_day?: number | null;
  bio?: string | null;
  about?: string | null;
  education?: string | null;
  certifications?: string[] | null;
  // Counts
  availability_count?: number;
  active_classes?: number;
}

export default function StaffDirectoryPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 [Directory] Loading staff...');

      // 1. Get all users with staff/teacher roles
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('role', ['admin', 'staff', 'teacher'])
        .order('full_name');

      console.log('🔍 [Directory] Users query result:', { 
        data: usersData, 
        error: usersError,
        count: usersData?.length || 0 
      });

      if (usersError) {
        console.error('❌ [Directory] Users query error:', usersError);
        setError('Failed to load users: ' + usersError.message);
        setLoading(false);
        return;
      }

      if (!usersData || usersData.length === 0) {
        console.log('⚠️ [Directory] No users found');
        setStaff([]);
        setLoading(false);
        return;
      }

      console.log(`📊 [Directory] Found ${usersData.length} users:`, 
        usersData.map(u => ({ name: u.full_name, role: u.role, email: u.email }))
      );

      // 2. Get teacher-specific data for those with teacher role
      const teacherIds = usersData
        .filter((u: any) => u.role === 'teacher')
        .map((u: any) => u.id);

      console.log(`👨‍🏫 [Directory] Teachers found: ${teacherIds.length}`);

      let teacherData: any[] = [];
      if (teacherIds.length > 0) {
        const { data: tData, error: tError } = await supabase
          .from('teachers')
          .select('*')
          .in('id', teacherIds);

        console.log('🔍 [Directory] Teachers table query:', { 
          data: tData, 
          error: tError,
          count: tData?.length || 0 
        });

        if (!tError) {
          teacherData = tData || [];
        }
      }

      // 3. Get availability counts for teachers
      const availabilityCounts: Record<string, number> = {};
      for (const teacherId of teacherIds) {
        const { count, error } = await supabase
          .from('teacher_availability')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', teacherId)
          .eq('is_active', true);

        if (!error) {
          availabilityCounts[teacherId] = count || 0;
        }
      }

      // 4. Get active class counts for teachers
      const classCounts: Record<string, number> = {};
      for (const teacherId of teacherIds) {
        const { count, error } = await supabase
          .from('class_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', teacherId)
          .in('status', ['scheduled', 'in_progress']);

        if (!error) {
          classCounts[teacherId] = count || 0;
        }
      }

      // 5. Merge data
      const teacherMap: Record<string, any> = {};
      teacherData.forEach((t: any) => {
        teacherMap[t.id] = t;
      });

      const mergedStaff = usersData.map((user: any) => {
        const teacher = teacherMap[user.id] || {};
        return {
          ...user,
          ...teacher,
          availability_count: availabilityCounts[user.id] || 0,
          active_classes: classCounts[user.id] || 0,
        };
      });

      console.log(`✅ [Directory] Merged staff: ${mergedStaff.length}`);
      setStaff(mergedStaff);

    } catch (error: any) {
      console.error('❌ [Directory] Error loading staff:', error);
      setError('Error: ' + error.message);
    }
    setLoading(false);
  }

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      staff: 'bg-gray-100 text-gray-800',
      teacher: 'bg-blue-100 text-blue-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, string> = {
      admin: '👑',
      staff: '👤',
      teacher: '👨‍🏫',
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

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <h3 className="font-semibold">Error Loading Staff</h3>
          <p className="text-sm">{error}</p>
          <button 
            onClick={loadStaff}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
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
        <Link href="/dashboard/staff/form">
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
        <button
          onClick={loadStaff}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Staff Grid */}
      {filteredStaff.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No staff members found. Add your first staff member!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((member) => (
            <div 
              key={member.id} 
              className="bg-white rounded-lg shadow border border-gray-100 hover:shadow-lg transition cursor-pointer"
              onClick={() => router.push(`/dashboard/staff/form?id=${member.id}`)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getRoleIcon(member.role)}</span>
                      <h3 className="font-bold text-gray-900">{member.full_name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleBadgeColor(member.role)}`}>
                        {member.role}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {member.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Teacher-specific info */}
                {member.role === 'teacher' && (
                  <>
                    {member.specialization && (
                      <div className="mt-2 text-sm text-blue-600">
                        📚 {member.specialization}
                      </div>
                    )}
                    {member.profile_headline && (
                      <div className="text-xs text-gray-500">{member.profile_headline}</div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                      {member.hourly_rate != null && member.hourly_rate > 0 && (
                        <span>💰 ${member.hourly_rate}/hr</span>
                      )}
                      {member.years_experience != null && member.years_experience > 0 && (
                        <span>📅 {member.years_experience} years</span>
                      )}
                      <span>📋 {member.availability_count || 0} slots</span>
                      <span>📚 {member.active_classes || 0} classes</span>
                    </div>
                  </>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Click to view/edit profile</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}