'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
  code: string;
  icon: string;
}

interface Program {
  id: string;
  code: string;
  name: string;
  description: string;
  duration: string;
  certificate_offered: boolean;
  is_active: boolean;
  category_id: string;
  category?: Category;
  created_at: string;
}

export default function ProgramsPage() {
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('category');

  const [programs, setPrograms] = useState<Program[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Program | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    duration: '',
    certificate_offered: true,
    is_active: true,
    category_id: categoryId || '',
  });

  useEffect(() => {
    loadData();
  }, [categoryId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load all categories for filter and dropdown
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name, code, icon')
        .eq('is_active', true)
        .order('name');
      setCategories(categoriesData || []);

      // If categoryId is provided, find the category
      if (categoryId && categoriesData) {
        const category = categoriesData.find(c => c.id === categoryId);
        setSelectedCategory(category || null);
      }

      // Load programs with category
      let query = supabase
        .from('programs')
        .select(`
          *,
          category:category_id (id, name, code, icon)
        `)
        .order('name');

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPrograms(data || []);
    } catch (error) {
      console.error('Error loading programs:', error);
      alert('Failed to load programs');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('programs')
          .update(formData)
          .eq('id', editingItem.id);

        if (error) throw error;
        alert('✅ Program updated successfully!');
      } else {
        const { error } = await supabase
          .from('programs')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Program created successfully!');
      }

      resetForm();
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Are you sure you want to delete this program?')) return;

    try {
      const { error } = await supabase
        .from('programs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('✅ Program deleted successfully!');
      loadData();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  function resetForm() {
    setFormData({
      code: '',
      name: '',
      description: '',
      duration: '',
      certificate_offered: true,
      is_active: true,
      category_id: categoryId || '',
    });
    setEditingItem(null);
    setShowForm(false);
  }

  function editItem(item: Program) {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      duration: item.duration || '',
      certificate_offered: item.certificate_offered,
      is_active: item.is_active,
      category_id: item.category_id || '',
    });
    setShowForm(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/dashboard/academics/categories" className="hover:text-blue-600">
            Categories
          </Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">
            {selectedCategory ? selectedCategory.name : 'All Programs'}
          </span>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Programs</h1>
            <p className="text-gray-500 text-sm">
              {categoryId && selectedCategory 
                ? `${selectedCategory.icon || '📚'} Programs in ${selectedCategory.name}` 
                : 'All programs across all categories'}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? 'Cancel' : '➕ Add Program'}
          </button>
        </div>

        {/* Category Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700 mr-2">Filter by Category:</span>
            <Link
              href="/dashboard/academics/programs"
              className={`px-3 py-1 text-sm rounded-full transition ${
                !categoryId 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/dashboard/academics/programs?category=${cat.id}`}
                className={`px-3 py-1 text-sm rounded-full transition ${
                  categoryId === cat.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {cat.icon || '📚'} {cat.name}
              </Link>
            ))}
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Program' : 'Add New Program'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="e.g., FSD"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Duration</label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 12 Months"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Certificate</label>
                  <select
                    value={formData.certificate_offered ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, certificate_offered: e.target.value === 'true' })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="true">Offered</option>
                    <option value="false">Not Offered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={formData.is_active ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Programs Grid */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : programs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">
              {categoryId ? 'No programs found in this category.' : 'No programs found. Click "Add Program" to create one.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programs.map((program) => (
              <div
                key={program.id}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{program.name}</h3>
                    <p className="text-sm text-gray-500">{program.code}</p>
                    {program.category && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                        {program.category.icon || '📚'} {program.category.name}
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    program.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {program.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {program.description && (
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{program.description}</p>
                )}
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                  {program.duration && <span>⏱️ {program.duration}</span>}
                  {program.certificate_offered && <span>🏆 Certificate</span>}
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Link href={`/dashboard/academics/courses?program=${program.id}`}>
                    <button className="text-green-600 hover:text-green-800 text-sm font-medium">
                      View Courses
                    </button>
                  </Link>
                  <button
                    onClick={() => editItem(program)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(program.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}