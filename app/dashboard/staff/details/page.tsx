'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function StaffFormPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const staffId = searchParams.get('id');
  const isEditMode = !!staffId;

  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

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

  // Profile form (includes role for create mode)
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    address: '',
    employee_id: '',
    join_date: '',
    emergency_contact: '',
    emergency_phone: '',
    role: 'staff', // Added role field
    is_active: true,
  });

  useEffect(() => {
    loadReferenceData();
    if (isEditMode && staffId) {
      loadStaffData();
    } else {
      // New staff mode - just show the form
      setLoading(false);
      // Auto-start editing for new staff
      setEditingProfile(true);
    }
  }, [staffId]);

  async function loadReferenceData() {
    try {
      const [specRes, expRes, eduRes, subRes] = await Promise.all([
        supabase.from('specializations').select('*').eq('is_active', true).order('name'),
        supabase.from('expertise_areas').select('*').eq('is_active', true).order('name'),
        supabase.from('education_levels').select('*').eq('is_active', true).order('name'),
        supabase.from('subjects').select('id, name, category').order('name'),
      ]);

      setAllSpecializations(specRes.data || []);
      setAllExpertise(expRes.data || []);
      setAllEducationLevels(eduRes.data || []);
      setAllSubjects(subRes.data || []);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  }

  async function loadStaffData() {
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
      setProfileForm({
        full_name: staffData.full_name || '',
        email: staffData.email || '',
        phone: staffData.phone || '',
        gender: staffData.gender || '',
        date_of_birth: staffData.date_of_birth || '',
        address: staffData.address || '',
        employee_id: staffData.employee_id || '',
        join_date: staffData.join_date || '',
        emergency_contact: staffData.emergency_contact || '',
        emergency_phone: staffData.emergency_phone || '',
        role: staffData.role || 'staff',
        is_active: staffData.is_active ?? true,
      });

      // Load staff's related data
      await loadStaffRelatedData();
    } catch (error) {
      console.error('Error:', error);
    }
    
    setLoading(false);
  }

  async function loadStaffRelatedData() {
    if (!staffId) return;

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
    if (profileForm.role === 'teacher') {
      const { data: subData } = await supabase
        .from('teacher_subjects')
        .select(`*, subjects(*)`)
        .eq('teacher_id', staffId)
        .eq('is_active', true);
      setTeacherSubjects(subData || []);
    }
  }

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      // First, check if email already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', profileForm.email)
        .single();

      if (existingUser) {
        alert('❌ A user with this email already exists.');
        setSaving(false);
        return;
      }

      // Create the staff user
      const { data: newStaff, error: createError } = await supabase
        .from('users')
        .insert([{
          full_name: profileForm.full_name,
          email: profileForm.email,
          phone: profileForm.phone || null,
          gender: profileForm.gender || null,
          date_of_birth: profileForm.date_of_birth || null,
          address: profileForm.address || null,
          employee_id: profileForm.employee_id || null,
          join_date: profileForm.join_date || null,
          emergency_contact: profileForm.emergency_contact || null,
          emergency_phone: profileForm.emergency_phone || null,
          role: profileForm.role,
          is_active: profileForm.is_active,
        }])
        .select()
        .single();

      if (createError) throw createError;

      alert('✅ Staff member created successfully!');
      
      // Redirect to edit mode with the new ID
      router.push(`/dashboard/staff-form?id=${newStaff.id}`);
      
    } catch (error: any) {
      console.error('Error creating staff:', error);
      alert('Error: ' + error.message);
    }
    setSaving(false);
  }

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: profileForm.full_name,
          phone: profileForm.phone,
          gender: profileForm.gender,
          date_of_birth: profileForm.date_of_birth || null,
          address: profileForm.address,
          employee_id: profileForm.employee_id,
          join_date: profileForm.join_date || null,
          emergency_contact: profileForm.emergency_contact,
          emergency_phone: profileForm.emergency_phone,
          role: profileForm.role, // Allow role updates
          is_active: profileForm.is_active,
        })
        .eq('id', staffId);

      if (error) throw error;

      alert('✅ Profile updated successfully!');
      setEditingProfile(false);
      await loadStaffData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSavingProfile(false);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const tableName = getTableName(activeTab);
      
      let submitData = { ...formData };
      
      if (activeTab === 'subjects') {
        submitData = {
          subject_id: formData.subject_id,
          rate: formData.rate,
          teacher_id: staffId,
        };
      } else {
        submitData = { ...formData, staff_id: staffId };
      }

      let result;
      if (editingItem) {
        result = await supabase.from(tableName).update(submitData).eq('id', editingItem.id);
      } else {
        result = await supabase.from(tableName).insert([submitData]);
      }

      if (result.error) throw result.error;

      alert('✅ Added successfully!');
      resetForm();
      await loadStaffRelatedData();
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string, tableName: string) {
    if (!confirm('Are you sure you want to delete this?')) return;

    try {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      
      alert('✅ Deleted successfully!');
      await loadStaffRelatedData();
    } catch (error: any) {
      console.error('Error deleting:', error);
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

  function renderProfileForm() {
    return (
      <form onSubmit={isEditMode ? handleProfileUpdate : handleCreateStaff} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              type="text"
              value={profileForm.full_name}
              onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {isEditMode ? 'Email (Read Only)' : 'Email *'}
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              required
              disabled={isEditMode}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role *</label>
            <select
              value={profileForm.role}
              onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="hr">HR</option>
              <option value="accounting">Accounting</option>
              <option value="facilities">Facilities</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="text"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1234567890"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gender</label>
            <select
              value={profileForm.gender}
              onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date of Birth</label>
            <input
              type="date"
              value={profileForm.date_of_birth}
              onChange={(e) => setProfileForm({ ...profileForm, date_of_birth: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Address</label>
            <input
              type="text"
              value={profileForm.address}
              onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Employee ID</label>
            <input
              type="text"
              value={profileForm.employee_id}
              onChange={(e) => setProfileForm({ ...profileForm, employee_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Join Date</label>
            <input
              type="date"
              value={profileForm.join_date}
              onChange={(e) => setProfileForm({ ...profileForm, join_date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Emergency Contact</label>
            <input
              type="text"
              value={profileForm.emergency_contact}
              onChange={(e) => setProfileForm({ ...profileForm, emergency_contact: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Emergency Phone</label>
            <input
              type="text"
              value={profileForm.emergency_phone}
              onChange={(e) => setProfileForm({ ...profileForm, emergency_phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {isEditMode && (
            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={profileForm.is_active}
                  onChange={(e) => setProfileForm({ ...profileForm, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || savingProfile}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving || savingProfile ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Staff')}
          </button>
          {isEditMode && (
            <button
              type="button"
              onClick={() => {
                setEditingProfile(false);
                loadStaffData();
              }}
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  function renderForm() {
    if (!isEditMode) return null; // Only show add forms in edit mode

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
      if (profileForm.role !== 'teacher') {
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
      return renderProfileForm();
    }

    if (!isEditMode) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>Please create the staff profile first to add {activeTab}.</p>
          <p className="text-sm mt-2">Fill in the profile details and click "Create Staff".</p>
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
      if (profileForm.role !== 'teacher') {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/staff">
            <button className="text-gray-600 hover:text-gray-900 flex items-center gap-2">← Back to Staff</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Staff Profile' : 'Create New Staff'}
          </h1>
        </div>

        {/* Profile Header - Only show in edit mode */}
        {isEditMode && staff && (
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
        )}

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
                if (tab === 'profile' && isEditMode) {
                  setEditingProfile(false);
                }
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