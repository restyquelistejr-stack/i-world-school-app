'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function StaffDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffId = searchParams.get('id');

  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  // Data states
  const [specializations, setSpecializations] = useState<any[]>([]);
  const [expertise, setExpertise] = useState<any[]>([]);
  const [education, setEducation] = useState<any[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);

  // Reference data
  const [allSpecializations, setAllSpecializations] = useState<any[]>([]);
  const [allExpertise, setAllExpertise] = useState<any[]>([]);
  const [allEducationLevels, setAllEducationLevels] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (staffId) {
      loadData();
    } else {
      router.push('/dashboard/staff');
    }
  }, [staffId]);

  async function loadData() {
    setLoading(true);
    
    try {
      // Load staff
      const { data: staffData, error: staffError } = await supabase
        .from('users')
        .select('*')
        .eq('id', staffId)
        .single();

      if (staffError) {
        console.error('Error loading staff:', staffError);
        router.push('/dashboard/staff');
        return;
      }

      setStaff(staffData);

      // Load all reference data
      const [specRes, expRes, eduRes, subRes] = await Promise.all([
        supabase.from('specializations').select('*').eq('is_active', true).order('name'),
        supabase.from('expertise_areas').select('*').eq('is_active', true).order('name'),
        supabase.from('education_levels').select('*').eq('is_active', true).order('name'),
        supabase.from('subjects').select('*').eq('is_active', true).order('name'),
      ]);

      setAllSpecializations(specRes.data || []);
      setAllExpertise(expRes.data || []);
      setAllEducationLevels(eduRes.data || []);
      setAllSubjects(subRes.data || []);

      // Load staff's data
      await loadStaffData();
    } catch (error) {
      console.error('Error:', error);
    }
    
    setLoading(false);
  }

  async function loadStaffData() {
    // Load specializations
    const { data: specData } = await supabase
      .from('staff_specializations')
      .select(`*, specializations(*)`)
      .eq('staff_id', staffId)
      .eq('is_active', true);
    setSpecializations(specData || []);

    // Load expertise
    const { data: expData } = await supabase
      .from('staff_expertise')
      .select(`*, expertise_areas(*)`)
      .eq('staff_id', staffId)
      .eq('is_active', true);
    setExpertise(expData || []);

    // Load education
    const { data: eduData } = await supabase
      .from('staff_education')
      .select(`*, education_levels(*)`)
      .eq('staff_id', staffId)
      .eq('is_active', true)
      .order('year_to', { ascending: false });
    setEducation(eduData || []);

    // Load teacher subjects
    if (staff?.role === 'teacher') {
      const { data: subData } = await supabase
        .from('teacher_subjects')
        .select(`*, subjects(*)`)
        .eq('teacher_id', staffId)
        .eq('is_active', true);
      setTeacherSubjects(subData || []);
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const tableName = getTableName(activeTab);
      const submitData = { ...formData, staff_id: staffId };

      if (editingItem) {
        await supabase.from(tableName).update(submitData).eq('id', editingItem.id);
        alert('✅ Updated successfully!');
      } else {
        await supabase.from(tableName).insert([submitData]);
        alert('✅ Added successfully!');
      }

      resetForm();
      loadStaffData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string, tableName: string) {
    if (!confirm('Are you sure you want to delete this?')) return;

    try {
      await supabase.from(tableName).delete().eq('id', id);
      alert('✅ Deleted successfully!');
      loadStaffData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({});
    setEditingItem(null);
    setShowAddForm(false);
  }

  function getTableName(tab: string): string {
    const map: Record<string, string> = {
      specializations: 'staff_specializations',
      expertise: 'staff_expertise',
      education: 'staff_education',
      subjects: 'teacher_subjects',
    };
    return map[tab] || '';
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

  function renderForm() {
    if (activeTab === 'specializations') {
      return (
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Specialization *</label>
              <select
                value={formData.specialization_id || ''}
                onChange={(e) => setFormData({ ...formData, specialization_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Specialization</option>
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
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_primary || false}
                onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Primary Specialization</span>
            </label>
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Add')}
          </button>
        </form>
      );
    }

    if (activeTab === 'expertise') {
      return (
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Area of Expertise *</label>
              <select
                value={formData.expertise_id || ''}
                onChange={(e) => setFormData({ ...formData, expertise_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Expertise</option>
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
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Add')}
          </button>
        </form>
      );
    }

    if (activeTab === 'education') {
      return (
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Education Level *</label>
              <select
                value={formData.education_level_id || ''}
                onChange={(e) => setFormData({ ...formData, education_level_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Level</option>
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
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., BSc Computer Science"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">School *</label>
              <input
                type="text"
                value={formData.school || ''}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Year From</label>
              <input
                type="number"
                value={formData.year_from || ''}
                onChange={(e) => setFormData({ ...formData, year_from: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Year To</label>
              <input
                type="number"
                value={formData.year_to || ''}
                onChange={(e) => setFormData({ ...formData, year_to: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Field of Study</label>
              <input
                type="text"
                value={formData.field_of_study || ''}
                onChange={(e) => setFormData({ ...formData, field_of_study: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Add')}
          </button>
        </form>
      );
    }

    if (activeTab === 'subjects') {
      if (staff?.role !== 'teacher') {
        return <p className="text-gray-500">This staff member is not a teacher.</p>;
      }
      return (
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Subject *</label>
              <select
                value={formData.subject_id || ''}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Subject</option>
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
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Add')}
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
          <div><p className="text-sm text-gray-500">Date of Birth</p><p className="font-medium">{staff?.date_of_birth || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Address</p><p className="font-medium">{staff?.address || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Role</p><p className="font-medium">{getRoleLabel(staff?.role || '')}</p></div>
          <div><p className="text-sm text-gray-500">Employee ID</p><p className="font-medium">{staff?.employee_id || '—'}</p></div>
          <div><p className="text-sm text-gray-500">Join Date</p><p className="font-medium">{staff?.join_date || '—'}</p></div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-1 text-xs rounded-full ${staff?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {staff?.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="col-span-2"><p className="text-sm text-gray-500">Emergency Contact</p><p className="font-medium">{staff?.emergency_contact || '—'}</p></div>
          <div className="col-span-2"><p className="text-sm text-gray-500">Emergency Phone</p><p className="font-medium">{staff?.emergency_phone || '—'}</p></div>
        </div>
      );
    }

    if (activeTab === 'specializations') {
      return (
        <div>
          <div className="mb-4">
            {specializations.length === 0 ? (
              <p className="text-gray-500">No specializations added yet.</p>
            ) : (
              specializations.map((s) => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg mb-2">
                  <div>
                    <span className="font-medium">{s.specializations?.name}</span>
                    {s.is_primary && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800">Primary</span>}
                    {s.years_of_experience > 0 && <span className="ml-2 text-sm text-gray-500">{s.years_of_experience} years</span>}
                  </div>
                  <button onClick={() => deleteItem(s.id, 'staff_specializations')} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            {showAddForm ? 'Cancel' : '+ Add Specialization'}
          </button>
          {showAddForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'expertise') {
      return (
        <div>
          <div className="mb-4">
            {expertise.length === 0 ? (
              <p className="text-gray-500">No expertise areas added yet.</p>
            ) : (
              expertise.map((e) => (
                <div key={e.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg mb-2">
                  <div>
                    <span className="font-medium">{e.expertise_areas?.name}</span>
                    <span className="ml-2 text-sm text-gray-500">{e.expertise_areas?.category || ''}</span>
                    {e.years_of_experience > 0 && <span className="ml-2 text-sm text-gray-500">{e.years_of_experience} years</span>}
                  </div>
                  <button onClick={() => deleteItem(e.id, 'staff_expertise')} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            {showAddForm ? 'Cancel' : '+ Add Expertise'}
          </button>
          {showAddForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'education') {
      return (
        <div>
          <div className="mb-4">
            {education.length === 0 ? (
              <p className="text-gray-500">No education records added yet.</p>
            ) : (
              education.map((e) => (
                <div key={e.id} className="p-3 bg-gray-50 rounded-lg mb-2">
                  <div className="flex justify-between">
                    <div>
                      <span className="font-medium">{e.education_levels?.name}</span>
                      {e.degree && <span className="ml-2 text-sm">{e.degree}</span>}
                      <p className="text-sm text-gray-600">{e.school}</p>
                      {e.field_of_study && <p className="text-sm text-gray-500">{e.field_of_study}</p>}
                      {(e.year_from || e.year_to) && <p className="text-sm text-gray-500">{e.year_from} - {e.year_to}</p>}
                    </div>
                    <button onClick={() => deleteItem(e.id, 'staff_education')} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                  </div>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            {showAddForm ? 'Cancel' : '+ Add Education'}
          </button>
          {showAddForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    if (activeTab === 'subjects') {
      if (staff?.role !== 'teacher') {
        return <p className="text-gray-500">This staff member is not a teacher.</p>;
      }
      return (
        <div>
          <div className="mb-4">
            {teacherSubjects.length === 0 ? (
              <p className="text-gray-500">No subjects assigned to this teacher yet.</p>
            ) : (
              teacherSubjects.map((ts) => (
                <div key={ts.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg mb-2">
                  <div>
                    <span className="font-medium">{ts.subjects?.name}</span>
                    {ts.rate > 0 && <span className="ml-2 text-sm text-gray-500">${ts.rate}/hr</span>}
                  </div>
                  <button onClick={() => deleteItem(ts.id, 'teacher_subjects')} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            {showAddForm ? 'Cancel' : '+ Add Subject'}
          </button>
          {showAddForm && <div className="mt-4">{renderForm()}</div>}
        </div>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Staff member not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/staff">
            <button className="text-gray-600 hover:text-gray-900 flex items-center gap-2">← Back to Staff</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Staff Profile</h1>
        </div>

        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-3xl">
              {staff.full_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{staff.full_name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadge(staff.role)}`}>
                  {getRoleLabel(staff.role)}
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {staff.is_active ? 'Active' : 'Inactive'}
                </span>
                {staff.employee_id && <span className="text-sm text-gray-500">ID: {staff.employee_id}</span>}
              </div>
              <p className="text-gray-600 text-sm mt-1">{staff.email}</p>
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
                setShowAddForm(false);
                setEditingItem(null);
                setFormData({});
              }}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
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