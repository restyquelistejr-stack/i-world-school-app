'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function StaffProfilePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffId = searchParams.get('id');

  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  // Data
  const [specializations, setSpecializations] = useState<any[]>([]);
  const [expertise, setExpertise] = useState<any[]>([]);
  const [education, setEducation] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // Libraries
  const [allSpecializations, setAllSpecializations] = useState<any[]>([]);
  const [allExpertise, setAllExpertise] = useState<any[]>([]);
  const [allEducationLevels, setAllEducationLevels] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (staffId) {
      loadAll();
    } else {
      router.push('/dashboard/staff');
    }
  }, [staffId]);

  async function loadAll() {
    setLoading(true);
    console.log('Loading staff ID:', staffId);

    try {
      // Get staff
      const { data: staffData } = await supabase
        .from('users')
        .select('*')
        .eq('id', staffId)
        .single();
      setStaff(staffData);

      // Get libraries
      const [specs, exp, edu, subs] = await Promise.all([
        supabase.from('specializations').select('*').eq('is_active', true),
        supabase.from('expertise_areas').select('*').eq('is_active', true),
        supabase.from('education_levels').select('*').eq('is_active', true),
        supabase.from('subjects').select('*').eq('is_active', true),
      ]);

      setAllSpecializations(specs.data || []);
      setAllExpertise(exp.data || []);
      setAllEducationLevels(edu.data || []);
      setAllSubjects(subs.data || []);

      // Get staff's data
      await loadStaffData();

    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  }

  async function loadStaffData() {
    // Specializations
    const { data: s } = await supabase
      .from('staff_specializations')
      .select('*, specializations(*)')
      .eq('staff_id', staffId);
    setSpecializations(s || []);

    // Expertise
    const { data: e } = await supabase
      .from('staff_expertise')
      .select('*, expertise_areas(*)')
      .eq('staff_id', staffId);
    setExpertise(e || []);

    // Education
    const { data: ed } = await supabase
      .from('staff_education')
      .select('*, education_levels(*)')
      .eq('staff_id', staffId);
    setEducation(ed || []);

    // Subjects (if teacher)
    if (staff?.role === 'teacher') {
      const { data: sub } = await supabase
        .from('teacher_subjects')
        .select('*, subjects(*)')
        .eq('teacher_id', staffId);
      setSubjects(sub || []);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const tableMap: Record<string, string> = {
        specializations: 'staff_specializations',
        expertise: 'staff_expertise',
        education: 'staff_education',
        subjects: 'teacher_subjects',
      };

      const tableName = tableMap[activeTab];
      const data = { ...formData, staff_id: staffId };

      const { error } = await supabase.from(tableName).insert([data]);
      if (error) throw error;

      alert('✅ Added successfully!');
      setShowForm(false);
      setFormData({});
      loadStaffData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSaving(false);
  }

  async function deleteRecord(id: string, tableName: string) {
    if (!confirm('Delete this?')) return;
    await supabase.from(tableName).delete().eq('id', id);
    loadStaffData();
  }

  function getRoleLabel(role: string) {
    const labels: Record<string, string> = {
      admin: 'Admin',
      hr: 'HR',
      accounting: 'Accounting',
      teacher: 'Teacher',
      facilities: 'Facilities',
      staff: 'Staff',
      administrator: 'Administrator',
    };
    return labels[role] || role;
  }

  function getRoleBadge(role: string) {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      hr: 'bg-pink-100 text-pink-800',
      accounting: 'bg-blue-100 text-blue-800',
      teacher: 'bg-green-100 text-green-800',
      facilities: 'bg-yellow-100 text-yellow-800',
      staff: 'bg-gray-100 text-gray-800',
      administrator: 'bg-indigo-100 text-indigo-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  }

  function renderForm() {
    if (activeTab === 'specializations') {
      return (
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Specialization *</label>
            <select
              value={formData.specialization_id || ''}
              onChange={(e) => setFormData({ ...formData, specialization_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select...</option>
              {allSpecializations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Years of Experience</label>
            <input
              type="number"
              value={formData.years_of_experience || ''}
              onChange={(e) => setFormData({ ...formData, years_of_experience: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              min="0"
            />
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_primary || false}
                onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
              />
              Primary Specialization
            </label>
          </div>
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            {saving ? 'Saving...' : 'Add Specialization'}
          </button>
        </form>
      );
    }

    if (activeTab === 'expertise') {
      return (
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Area of Expertise *</label>
            <select
              value={formData.expertise_id || ''}
              onChange={(e) => setFormData({ ...formData, expertise_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select...</option>
              {allExpertise.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Years of Experience</label>
            <input
              type="number"
              value={formData.years_of_experience || ''}
              onChange={(e) => setFormData({ ...formData, years_of_experience: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              min="0"
            />
          </div>
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            {saving ? 'Saving...' : 'Add Expertise'}
          </button>
        </form>
      );
    }

    if (activeTab === 'education') {
      return (
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Education Level *</label>
            <select
              value={formData.education_level_id || ''}
              onChange={(e) => setFormData({ ...formData, education_level_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select...</option>
              {allEducationLevels.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Degree</label>
            <input
              type="text"
              value={formData.degree || ''}
              onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g., BSc Computer Science"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">School *</label>
            <input
              type="text"
              value={formData.school || ''}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Year From</label>
              <input
                type="number"
                value={formData.year_from || ''}
                onChange={(e) => setFormData({ ...formData, year_from: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Year To</label>
              <input
                type="number"
                value={formData.year_to || ''}
                onChange={(e) => setFormData({ ...formData, year_to: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Field of Study</label>
            <input
              type="text"
              value={formData.field_of_study || ''}
              onChange={(e) => setFormData({ ...formData, field_of_study: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            {saving ? 'Saving...' : 'Add Education'}
          </button>
        </form>
      );
    }

    if (activeTab === 'subjects') {
      if (staff?.role !== 'teacher') {
        return <p className="text-gray-500">Not a teacher.</p>;
      }
      return (
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject *</label>
            <select
              value={formData.subject_id || ''}
              onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select...</option>
              {allSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rate ($/hr) *</label>
            <input
              type="number"
              value={formData.rate || ''}
              onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg"
              required
              min="0"
              step="0.01"
            />
          </div>
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            {saving ? 'Saving...' : 'Add Subject'}
          </button>
        </form>
      );
    }

    return null;
  }

  function renderContent() {
    if (activeTab === 'profile') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-sm text-gray-500">Full Name</p><p className="font-medium">{staff?.full_name}</p></div>
          <div><p className="text-sm text-gray-500">Email</p><p className="font-medium">{staff?.email}</p></div>
          <div><p className="text-sm text-gray-500">Phone</p><p className="font-medium">{staff?.phone || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Gender</p><p className="font-medium">{staff?.gender || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Role</p><p className="font-medium">{getRoleLabel(staff?.role || '')}</p></div>
          <div><p className="text-sm text-gray-500">Employee ID</p><p className="font-medium">{staff?.employee_id || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-1 text-xs rounded-full ${staff?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {staff?.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      );
    }

    if (activeTab === 'specializations') {
      return (
        <div>
          <div className="mb-4">
            {specializations.length === 0 ? <p className="text-gray-500">No specializations yet.</p> :
              specializations.map((s) => (
                <div key={s.id} className="flex justify-between p-2 bg-gray-50 rounded mb-1">
                  <span>{s.specializations?.name} {s.is_primary && '⭐'} {s.years_of_experience > 0 && `(${s.years_of_experience}yrs)`}</span>
                  <button onClick={() => deleteRecord(s.id, 'staff_specializations')} className="text-red-600 text-sm">Remove</button>
                </div>
              ))
            }
          </div>
          <button onClick={() => setShowForm(!showForm)} className="text-blue-600 text-sm">
            {showForm ? 'Cancel' : '+ Add Specialization'}
          </button>
          {showForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'expertise') {
      return (
        <div>
          <div className="mb-4">
            {expertise.length === 0 ? <p className="text-gray-500">No expertise yet.</p> :
              expertise.map((e) => (
                <div key={e.id} className="flex justify-between p-2 bg-gray-50 rounded mb-1">
                  <span>{e.expertise_areas?.name} {e.years_of_experience > 0 && `(${e.years_of_experience}yrs)`}</span>
                  <button onClick={() => deleteRecord(e.id, 'staff_expertise')} className="text-red-600 text-sm">Remove</button>
                </div>
              ))
            }
          </div>
          <button onClick={() => setShowForm(!showForm)} className="text-blue-600 text-sm">
            {showForm ? 'Cancel' : '+ Add Expertise'}
          </button>
          {showForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'education') {
      return (
        <div>
          <div className="mb-4">
            {education.length === 0 ? <p className="text-gray-500">No education yet.</p> :
              education.map((e) => (
                <div key={e.id} className="p-2 bg-gray-50 rounded mb-1">
                  <div className="flex justify-between">
                    <div>
                      <span className="font-medium">{e.education_levels?.name}</span>
                      {e.degree && <span className="ml-2 text-sm">{e.degree}</span>}
                      <p className="text-sm">{e.school}</p>
                      {e.year_from && e.year_to && <p className="text-sm text-gray-500">{e.year_from}-{e.year_to}</p>}
                    </div>
                    <button onClick={() => deleteRecord(e.id, 'staff_education')} className="text-red-600 text-sm">Remove</button>
                  </div>
                </div>
              ))
            }
          </div>
          <button onClick={() => setShowForm(!showForm)} className="text-blue-600 text-sm">
            {showForm ? 'Cancel' : '+ Add Education'}
          </button>
          {showForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'subjects') {
      if (staff?.role !== 'teacher') {
        return <p className="text-gray-500">Not a teacher.</p>;
      }
      return (
        <div>
          <div className="mb-4">
            {subjects.length === 0 ? <p className="text-gray-500">No subjects assigned.</p> :
              subjects.map((s) => (
                <div key={s.id} className="flex justify-between p-2 bg-gray-50 rounded mb-1">
                  <span>{s.subjects?.name} - ${s.rate}/hr</span>
                  <button onClick={() => deleteRecord(s.id, 'teacher_subjects')} className="text-red-600 text-sm">Remove</button>
                </div>
              ))
            }
          </div>
          <button onClick={() => setShowForm(!showForm)} className="text-blue-600 text-sm">
            {showForm ? 'Cancel' : '+ Add Subject'}
          </button>
          {showForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    return null;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!staff) {
    return <div className="min-h-screen flex items-center justify-center">Staff not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/staff">
            <button className="text-gray-600 hover:text-gray-900">← Back</button>
          </Link>
          <h1 className="text-3xl font-bold">Staff Profile</h1>
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl">
              {staff.full_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{staff.full_name}</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadge(staff.role)}`}>
                  {getRoleLabel(staff.role)}
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {staff.is_active ? 'Active' : 'Inactive'}
                </span>
                {staff.employee_id && <span className="text-sm text-gray-500">ID: {staff.employee_id}</span>}
              </div>
              <p className="text-gray-600 text-sm">{staff.email}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['profile', 'specializations', 'expertise', 'education', 'subjects'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setShowForm(false);
                setFormData({});
              }}
              className={`px-4 py-2 rounded-lg transition ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}