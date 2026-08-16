'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Tab = 'specializations' | 'subjects' | 'expertise_areas' | 'education_levels' | 'countries' | 'cities' | 'buildings' | 'floors' | 'rooms' | 'facilities';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('specializations');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>({});

  // Reference data for dropdowns
  const [countries, setCountries] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [roomFacilities, setRoomFacilities] = useState<any[]>([]);
  
  // For subjects - get all subjects for prerequisites dropdown
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [allSpecializations, setAllSpecializations] = useState<any[]>([]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadReferenceData() {
    try {
      const [countriesRes, citiesRes, buildingsRes, floorsRes, facilitiesRes, subjectsRes, specializationsRes] = await Promise.all([
        supabase.from('countries').select('*').eq('is_active', true).order('name'),
        supabase.from('cities').select('*').eq('is_active', true).order('name'),
        supabase.from('buildings').select('*').eq('is_active', true).order('name'),
        supabase.from('floors').select('*').eq('is_active', true).order('floor_number'),
        supabase.from('facilities').select('*').eq('is_active', true).order('name'),
        supabase.from('subjects').select('id, name, category').eq('is_active', true).order('name'),
        supabase.from('specializations').select('id, name').eq('is_active', true).order('name'),
      ]);

      setCountries(countriesRes.data || []);
      setCities(citiesRes.data || []);
      setBuildings(buildingsRes.data || []);
      setFloors(floorsRes.data || []);
      setFacilities(facilitiesRes.data || []);
      setAllSubjects(subjectsRes.data || []);
      setAllSpecializations(specializationsRes.data || []);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      let query = supabase.from(activeTab).select('*');
      
      if (activeTab === 'floors') {
        query = query.order('floor_number', { ascending: true });
      } else if (activeTab === 'rooms') {
        query = query.order('room_number', { ascending: true });
      } else {
        query = query.order('name', { ascending: true });
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data: ' + error.message);
      } else {
        setData(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to load data');
    }
    setLoading(false);
  }

  async function loadRoomFacilities(roomId: string) {
    try {
      const { data, error } = await supabase
        .from('room_facilities')
        .select(`
          *,
          facilities (*)
        `)
        .eq('room_id', roomId);

      if (error) throw error;
      setRoomFacilities(data || []);
    } catch (error) {
      console.error('Error loading room facilities:', error);
    }
  }

  function resetForm() {
    setFormData({});
    setEditingItem(null);
    setShowForm(false);
    setRoomFacilities([]);
  }

  function openCreateForm() {
    setFormData({});
    setEditingItem(null);
    setShowForm(true);
    if (activeTab === 'rooms') {
      setRoomFacilities([]);
    }
  }

  function openEditForm(item: any) {
    setEditingItem(item);
    setFormData({ ...item });
    setShowForm(true);
    if (activeTab === 'rooms') {
      loadRoomFacilities(item.id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { id, created_at, ...submitData } = formData;

      if (editingItem) {
        const { error } = await supabase
          .from(activeTab)
          .update(submitData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Updated successfully!');
      } else {
        const { error } = await supabase
          .from(activeTab)
          .insert([submitData]);

        if (error) throw error;
        alert('✅ Created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from(activeTab)
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function addFacilityToRoom(roomId: string, facilityId: string, quantity: number = 1) {
    try {
      const { error } = await supabase
        .from('room_facilities')
        .insert({
          room_id: roomId,
          facility_id: facilityId,
          quantity: quantity,
        });

      if (error) throw error;
      alert('✅ Facility added to room!');
      loadRoomFacilities(roomId);
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function removeFacilityFromRoom(roomFacilityId: string) {
    if (!confirm('Remove this facility from the room?')) return;

    try {
      const { error } = await supabase
        .from('room_facilities')
        .delete()
        .eq('id', roomFacilityId);

      if (error) throw error;
      alert('✅ Facility removed from room!');
      loadRoomFacilities(formData.id);
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function getTabLabel(tab: Tab): string {
    const labels: Record<Tab, string> = {
      specializations: 'Specializations',
      subjects: 'Subjects',
      expertise_areas: 'Expertise Areas',
      education_levels: 'Education Levels',
      countries: 'Countries',
      cities: 'Cities',
      buildings: 'Buildings',
      floors: 'Floors',
      rooms: 'Rooms',
      facilities: 'Facilities',
    };
    return labels[tab] || tab.charAt(0).toUpperCase() + tab.slice(1);
  }

  function getParentName(parentId: string, parentList: any[], parentKey: string = 'name'): string {
    const item = parentList.find(p => p.id === parentId);
    return item ? item[parentKey] : '—';
  }

  function renderForm() {
    switch (activeTab) {
      case 'specializations':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Category</option>
                <option value="Technology & Digital">Technology & Digital</option>
                <option value="Business & Management">Business & Management</option>
                <option value="Science & Engineering">Science & Engineering</option>
                <option value="Healthcare & Social">Healthcare & Social</option>
                <option value="Humanities & Communication">Humanities & Communication</option>
                <option value="Industry-Specific & Trades">Industry-Specific & Trades</option>
                <option value="Professional & Soft Skills">Professional & Soft Skills</option>
                <option value="Education Institutions">Education Institutions</option>
                <option value="Tuition & Enrichment">Tuition & Enrichment</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Specialization Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Specialization
            </button>
          </form>
        );

      case 'subjects':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category - Dropdown */}
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Category</option>
                <option value="Technology & Digital">Technology & Digital</option>
                <option value="Business & Management">Business & Management</option>
                <option value="Science & Engineering">Science & Engineering</option>
                <option value="Healthcare & Social">Healthcare & Social</option>
                <option value="Languages">Languages</option>
                <option value="Humanities & Communication">Humanities & Communication</option>
                <option value="Education & Training">Education & Training</option>
                <option value="Arts & Design">Arts & Design</option>
                <option value="Sports & Fitness">Sports & Fitness</option>
                <option value="Professional & Soft Skills">Professional & Soft Skills</option>
                <option value="General">General</option>
              </select>
            </div>

            {/* Subject Name - Free text */}
            <div>
              <label className="block text-sm font-medium mb-1">Subject Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="e.g., Python Programming, Data Science Fundamentals"
              />
            </div>

            {/* Description - Free text */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Describe what this subject covers..."
              />
            </div>

            {/* Student Capacity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Min Students Allowed</label>
                <input
                  type="number"
                  value={formData.min_students || ''}
                  onChange={(e) => setFormData({ ...formData, min_students: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Students Allowed</label>
                <input
                  type="number"
                  value={formData.max_students || ''}
                  onChange={(e) => setFormData({ ...formData, max_students: parseInt(e.target.value) || 20 })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Total Hours</label>
                <input
                  type="number"
                  value={formData.total_hours || ''}
                  onChange={(e) => setFormData({ ...formData, total_hours: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Min Hours/Session</label>
                <input
                  type="number"
                  value={formData.min_hours_per_session || ''}
                  onChange={(e) => setFormData({ ...formData, min_hours_per_session: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0.5"
                  step="0.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Hours/Session</label>
                <input
                  type="number"
                  value={formData.max_hours_per_session || ''}
                  onChange={(e) => setFormData({ ...formData, max_hours_per_session: parseInt(e.target.value) || 3 })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0.5"
                  step="0.5"
                />
              </div>
            </div>

            {/* Prerequisites */}
            <div>
              <label className="block text-sm font-medium mb-1">Prerequisites</label>
              <select
                multiple
                value={formData.prerequisites || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setFormData({ ...formData, prerequisites: selected });
                }}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                size={4}
              >
                {allSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} {subject.category ? `(${subject.category})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Hold Ctrl/Cmd to select multiple prerequisites</p>
            </div>

            {/* Recommended Understanding */}
            <div>
              <label className="block text-sm font-medium mb-1">Recommended Prior Knowledge</label>
              <textarea
                value={formData.recommended_understanding || ''}
                onChange={(e) => setFormData({ ...formData, recommended_understanding: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="e.g., Basic understanding of algebra, Familiarity with programming concepts"
              />
            </div>

            {/* Learning Objectives */}
            <div>
              <label className="block text-sm font-medium mb-1">Learning Objectives</label>
              <textarea
                value={formData.learning_objectives || ''}
                onChange={(e) => setFormData({ ...formData, learning_objectives: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="What will students learn? List key outcomes..."
              />
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-sm font-medium mb-1">Target Audience</label>
              <input
                type="text"
                value={formData.target_audience || ''}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Beginners, Intermediate professionals, Students aged 15-18"
              />
            </div>

            {/* Materials Needed */}
            <div>
              <label className="block text-sm font-medium mb-1">Materials Needed</label>
              <input
                type="text"
                value={formData.materials_needed || ''}
                onChange={(e) => setFormData({ ...formData, materials_needed: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Laptop with Python installed, Textbook"
              />
            </div>

            {/* Certificate Offered */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.certificate_offered || false}
                  onChange={(e) => setFormData({ ...formData, certificate_offered: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Certificate Offered</span>
              </label>
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Subject
            </button>
          </form>
        );

      case 'expertise_areas':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                <option value="Technology">Technology</option>
                <option value="Business">Business</option>
                <option value="Education">Education</option>
                <option value="Languages">Languages</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Engineering">Engineering</option>
                <option value="Arts">Arts</option>
                <option value="Sports">Sports</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Expertise Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="e.g., Python Programming, Project Management"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Expertise Area
            </button>
          </form>
        );

      case 'education_levels':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Education Level *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="e.g., Bachelor's Degree, Master's Degree"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Undergraduate degree, Postgraduate degree"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Education Level
            </button>
          </form>
        );

      case 'countries':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Country Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Country Code</label>
              <input
                type="text"
                value={formData.code || ''}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., US, PH, UK"
                maxLength={3}
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Country
            </button>
          </form>
        );

      case 'cities':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Country *</label>
              <select
                value={formData.country_id || ''}
                onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Country</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">City Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} City
            </button>
          </form>
        );

      case 'buildings':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">City *</label>
              <select
                value={formData.city_id || ''}
                onChange={(e) => setFormData({ ...formData, city_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select City</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getParentName(c.country_id, countries)} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Building Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Building
            </button>
          </form>
        );

      case 'floors':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Building *</label>
              <select
                value={formData.building_id || ''}
                onChange={(e) => setFormData({ ...formData, building_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Building</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {getParentName(b.city_id, cities)} - {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Floor Number *</label>
              <input
                type="number"
                value={formData.floor_number || ''}
                onChange={(e) => setFormData({ ...formData, floor_number: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                min="0"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Floor Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Ground Floor, Mezzanine"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Floor
            </button>
          </form>
        );

      case 'rooms':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Floor *</label>
              <select
                value={formData.floor_id || ''}
                onChange={(e) => setFormData({ ...formData, floor_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Floor</option>
                {floors.map((f) => {
                  const building = buildings.find(b => b.id === f.building_id);
                  const city = building ? cities.find(c => c.id === building.city_id) : null;
                  return (
                    <option key={f.id} value={f.id}>
                      {city?.name || ''} - {building?.name || ''} - {f.name || `Floor ${f.floor_number}`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Room Number *</label>
              <input
                type="text"
                value={formData.room_number || ''}
                onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="e.g., 101, A-201"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Room Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Computer Lab, Conference Room"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Capacity</label>
              <input
                type="number"
                value={formData.capacity || ''}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Room
            </button>
          </form>
        );

      case 'facilities':
        return (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Facility Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Icon (emoji)</label>
              <input
                type="text"
                value={formData.icon || ''}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 🖥️, 📹, 🎯"
                maxLength={5}
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')} Facility
            </button>
          </form>
        );

      default:
        return null;
    }
  }

  function renderTable() {
    switch (activeTab) {
      case 'specializations':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {item.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4">{item.description || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'subjects':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prerequisites</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {item.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.prerequisites && item.prerequisites.length > 0 
                          ? `${item.prerequisites.length} prerequisite(s)` 
                          : 'None'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{item.total_hours || 0}h</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.min_students || 1} - {item.max_students || 20}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'expertise_areas':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expertise</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          {item.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'education_levels':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Education Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4">{item.description || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'countries':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.code || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'cities':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{getParentName(item.country_id, countries)}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'buildings':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Building</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{getParentName(item.city_id, cities)}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4">{item.address || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'floors':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Building</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Floor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{getParentName(item.building_id, buildings)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.floor_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.name || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'rooms':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Room #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => {
                    const floor = floors.find(f => f.id === item.floor_id);
                    const building = floor ? buildings.find(b => b.id === floor.building_id) : null;
                    const city = building ? cities.find(c => c.id === building.city_id) : null;
                    const location = [city?.name, building?.name, floor?.name || `Floor ${floor?.floor_number}`].filter(Boolean).join(' - ');
                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{location || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{item.room_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{item.name || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{item.capacity || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {item.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap space-x-2">
                          <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                          <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'facilities':
        return (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facility</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Icon</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-2xl">{item.icon || '📦'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap space-x-2">
                        <button onClick={() => openEditForm(item)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  // Room Facilities Management (shows when editing a room)
  function renderRoomFacilities() {
    if (activeTab !== 'rooms' || !editingItem) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
        <h3 className="text-lg font-semibold mb-4">Room Facilities - {editingItem.room_number}</h3>
        
        <div className="flex gap-4 mb-4">
          <select
            id="facility-select"
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Facility</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon || '📦'} {f.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            id="facility-quantity"
            placeholder="Qty"
            defaultValue={1}
            min="1"
            className="w-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => {
              const select = document.getElementById('facility-select') as HTMLSelectElement;
              const quantity = document.getElementById('facility-quantity') as HTMLInputElement;
              if (select.value) {
                addFacilityToRoom(editingItem.id, select.value, parseInt(quantity.value) || 1);
                select.value = '';
                quantity.value = '1';
              } else {
                alert('Please select a facility');
              }
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            Add Facility
          </button>
        </div>

        {roomFacilities.length === 0 ? (
          <p className="text-gray-500 text-sm">No facilities added to this room yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facility</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roomFacilities.map((rf: any) => (
                  <tr key={rf.id}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {rf.facilities?.icon || '📦'} {rf.facilities?.name || 'Unknown'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{rf.quantity}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button
                        onClick={() => removeFacilityFromRoom(rf.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
          <button
            onClick={openCreateForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            ➕ Add {getTabLabel(activeTab).slice(0, -1)}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(['specializations', 'subjects', 'expertise_areas', 'education_levels', 'countries', 'cities', 'buildings', 'floors', 'rooms', 'facilities'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit' : 'Add'} {getTabLabel(activeTab).slice(0, -1)}
            </h2>
            {renderForm()}
            <button
              type="button"
              onClick={resetForm}
              className="mt-4 bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Room Facilities Management */}
        {renderRoomFacilities()}

        {/* Table */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No items found. Click "Add" to create one.</p>
          </div>
        ) : (
          renderTable()
        )}
      </div>
    </div>
  );
}