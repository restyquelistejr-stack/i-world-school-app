// app/dashboard/staff/teachers/page.tsx
// ⭐ v3.14: Soft delete + status buckets + archive (no more hard delete)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import ArchiveConfirmModal from '@/components/ArchiveConfirmModal';
import StatusFilterPills from '@/components/StatusFilterPills';
import {
  classifyPerson,
  countBuckets,
  filterByBuckets,
  StatusBucket,
} from '@/lib/filters/managementFilters';
import { useStatusFilter } from '@/lib/hooks/useStatusFilter';
import { archiveUser } from '@/lib/archiveService';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  specialization: string;
  teacher_type: 'full-time' | 'part-time';
  is_active: boolean;
  is_deleted?: boolean | null;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

  // ⭐ v3.14: persistent status bucket filter — default: active only
  const { active: activeBuckets, toggle: toggleBucket } = useStatusFilter(
    'teachers.buckets',
    ['active']
  );

  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    setLoading(true);
    try {
      // ⭐ v3.14: fetch users WITH is_deleted so we can classify
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, is_active, is_deleted')
        .eq('role', 'teacher')
        .order('full_name');

      if (usersError) throw usersError;

      // ⭐ v3.14: teacher profile table — don't filter is_active so we can
      // still display archived/inactive teachers; we just won't show them in Active.
      const { data: teachersData, error: teachersError } = await supabase
        .from('teachers')
        .select('*');

      if (teachersError) throw teachersError;

      const merged: Teacher[] = (usersData || []).map((user: any) => {
        const teacher = (teachersData || []).find((t: any) => t.id === user.id);
        return {
          ...user,
          specialization: teacher?.specialization || '',
          teacher_type: teacher?.teacher_type || 'full-time',
        };
      });

      setTeachers(merged);
    } catch (error) {
      console.error('Error loading teachers:', error);
      alert('Failed to load teachers');
    }
    setLoading(false);
  }

  async function handleArchiveConfirm(reason: string) {
    if (!archiveTarget) return;

    const res = await archiveUser(archiveTarget.id, {
      reason,
      actorRole: 'admin',
    });

    if (!res.success) {
      alert('Failed to archive: ' + (res.error || 'Unknown error'));
      return;
    }

    setArchiveTarget(null);
    await loadTeachers();
  }

  // ==========================================
  // DERIVED: bucket classification + filtering
  // ==========================================
  const counts = countBuckets(teachers, classifyPerson);
  const visibleTeachers = filterByBuckets(teachers, classifyPerson, activeBuckets);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👨‍🏫 Teachers</h1>
          <p className="text-sm text-gray-500">
            Manage all teachers in the system — archived and inactive teachers are hidden by default.
          </p>
        </div>
        <Link href="/dashboard/staff/teachers/create">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
            ➕ Add Teacher
          </button>
        </Link>
      </div>

      {/* ⭐ v3.14: Status bucket filter */}
      <div className="mb-4">
        <StatusFilterPills
          counts={counts}
          active={activeBuckets}
          onToggle={toggleBucket}
          visibleBuckets={['active', 'cancelled', 'archived']}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialization</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visibleTeachers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No teachers match the current filter.
                  {counts.active === 0 && counts.archived + counts.cancelled > 0 && (
                    <span className="block mt-1 text-xs">
                      Try enabling <strong>📦 Archived</strong> or <strong>🚫 Inactive</strong>.
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              visibleTeachers.map((teacher) => {
                const bucket = classifyPerson(teacher);
                const isArchived = bucket === 'archived';
                const isInactive = bucket === 'cancelled'; // person classifier maps is_active=false → 'cancelled'

                return (
                  <tr
                    key={teacher.id}
                    className={`transition-colors ${
                      isArchived ? 'bg-amber-50/40 hover:bg-amber-50/80' :
                      isInactive ? 'bg-gray-50/60 opacity-75 hover:bg-gray-100/60' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{teacher.full_name}</span>
                        {isArchived && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded-full">
                            📦 Archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{teacher.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        teacher.teacher_type === 'full-time'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {teacher.teacher_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {teacher.specialization || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isArchived ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">
                          Archived
                        </span>
                      ) : teacher.is_active ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/staff/teachers/view?id=${teacher.id}`}>
                          <button className="text-blue-600 hover:text-blue-800" title="View">
                            👁️
                          </button>
                        </Link>
                        <Link href={`/dashboard/staff/teachers/edit?id=${teacher.id}`}>
                          <button className="text-green-600 hover:text-green-800" title="Edit">
                            ✏️
                          </button>
                        </Link>
                        {!isArchived && (
                          <button
                            onClick={() => setArchiveTarget({ id: teacher.id, name: teacher.full_name })}
                            className="text-amber-600 hover:text-amber-800"
                            title="Archive"
                          >
                            📦
                          </button>
                        )}
                        {isArchived && (
                          <span
                            className="text-[10px] text-gray-400"
                            title="Reactivate from the detail page"
                          >
                            📦 Archived
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ⭐ v3.14: Archive confirmation modal */}
      <ArchiveConfirmModal
        isOpen={!!archiveTarget}
        entityType="teacher"
        entityName={archiveTarget?.name || ''}
        extraNotes={[
          'Any future sessions they teach will need a substitute',
          'Historical attendance and records are preserved',
          'You can reactivate them later from the detail page',
        ]}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}