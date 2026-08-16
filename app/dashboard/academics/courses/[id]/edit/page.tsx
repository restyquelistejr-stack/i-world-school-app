'use client';

import { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const AGE_GROUPS = [
  { value: 'adult', label: '👨‍🎓 Adult' },
  { value: 'young_learner', label: '🧒 Young Learner' },
];

const COURSE_TYPES = [
  { value: 'daily_english', label: 'Daily English' },
  { value: 'business_english', label: 'Business English' },
  { value: 'young_learners', label: 'Young Learners' },
  { value: 'exam_prep', label: 'Exam Preparation' },
  { value: 'private_lesson', label: 'Private Lesson (1-on-1)' },
];

// Levels specifically for module grouping inside the curriculum
const MODULE_LEVELS = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'pre_intermediate', label: 'Pre-Intermediate' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'upper_intermediate', label: 'Upper-Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'topic', label: 'General Topic' },
];

const DELIVERY_MODES = [
  { value: 'on_site', label: '🏫 On-Site' },
  { value: 'online', label: '💻 Online' },
  { value: 'hybrid', label: '🔄 Hybrid' },
];

const EXAM_TYPES = ['IELTS', 'WIDA', 'MAP', 'CAT4'];

interface Package {
  id?: string;
  name: string;
  sessions: number;
  amount: number;
  description: string;
  is_active: boolean;
}

interface DeliveryUnit {
  id?: string;
  title: string;
  unit_type: string;
  duration_minutes: number;
  unit_order: number;
}

interface Module {
  id?: string;
  title: string;
  level?: string | null;
  description?: string | null;
  module_order: number;
  delivery_units: DeliveryUnit[];
}

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('details');

  const unwrappedParams = use(params);
  const courseIdRef = useRef<string | null>(null);
  
  if (unwrappedParams?.id) {
    courseIdRef.current = unwrappedParams.id;
  }

  const [formData, setFormData] = useState({
    name: '',
    age_group: '',
    course_type: '',
    description: '',
    duration_hours: 40,
    delivery_mode: 'on_site',
    includes_exam_prep: false,
    exam_types: [] as string[],
    pricing_mode: 'package',
    price_per_hour_on_site: 30,
    price_per_hour_online: 25,
    price_20plus_on_site: 25,
    price_20plus_online: 20,
    price_50plus_on_site: 22,
    price_50plus_online: 18,
    scheduling_preference: 'same_day',
    link_url: '', // ✅ New URL Field
    modules: [] as Module[]
  });

  const [packages, setPackages] = useState<Package[]>([]);

  // ==========================================================
  // FETCH EXISTING DATA ON LOAD
  // ==========================================================
  useEffect(() => {
    const currentId = courseIdRef.current;
    if (!currentId) return;

    async function loadCourse() {
      setInitialLoading(true);
      setErrorMessage(null);
      try {
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select(`*, packages:course_packages (*)`)
          .eq('id', currentId)
          .single();

        if (courseError) throw new Error(`Course Error: ${courseError.message}`);
        if (!course) throw new Error('Course not found');

        const { data: modulesData, error: modulesError } = await supabase
          .from('course_modules')
          .select(`*, delivery_units:course_delivery_units (*)`)
          .eq('course_id', currentId)
          .order('module_order', { ascending: true });

        if (modulesError) throw new Error(`Modules Error: ${modulesError.message}`);

        setFormData({
          name: course.name || '',
          age_group: course.age_group || '',
          course_type: course.course_type || '',
          description: course.description || '',
          duration_hours: course.duration_hours || 40,
          delivery_mode: course.delivery_mode || 'on_site',
          includes_exam_prep: course.includes_exam_prep || false,
          exam_types: course.exam_types || [],
          pricing_mode: course.pricing_mode || 'package',
          price_per_hour_on_site: course.price_per_hour_on_site || 0,
          price_per_hour_online: course.price_per_hour_online || 0,
          price_20plus_on_site: course.price_20plus_on_site || 0,
          price_20plus_online: course.price_20plus_online || 0,
          price_50plus_on_site: course.price_50plus_on_site || 0,
          price_50plus_online: course.price_50plus_online || 0,
          scheduling_preference: course.scheduling_preference || 'same_day',
          link_url: course.link_url || '', // ✅ Fetch URL
          modules: modulesData || []
        });

        setPackages(course.packages || []);
      } catch (error: any) {
        setErrorMessage(error.message);
      } finally {
        setInitialLoading(false);
      }
    }

    loadCourse();
  }, []);

  // ==========================================================
  // HELPER FUNCTIONS
  // ==========================================================
  const addModule = () => {
    setFormData(prev => ({
      ...prev,
      modules: [
        ...prev.modules,
        { 
          title: '', 
          level: '',
          description: '',
          module_order: prev.modules.length + 1, 
          delivery_units: [{ title: '', unit_type: 'lecture', duration_minutes: 60, unit_order: 1 }] 
        }
      ]
    }));
  };

  const removeModule = (modIndex: number) => {
    if (formData.modules.length <= 1) {
      alert('You need at least one module.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      modules: prev.modules.filter((_, i) => i !== modIndex)
    }));
  };

  const addUnit = (modIndex: number) => {
    const newModules = [...formData.modules];
    if (!newModules[modIndex]) return;
    
    const currentUnits = newModules[modIndex].delivery_units || [];
    newModules[modIndex].delivery_units = [
      ...currentUnits,
      { title: '', unit_type: 'lecture', duration_minutes: 60, unit_order: currentUnits.length + 1 }
    ];
    setFormData({ ...formData, modules: newModules });
  };

  const removeUnit = (modIndex: number, unitIndex: number) => {
    const newModules = [...formData.modules];
    if (!newModules[modIndex]) return;

    const units = newModules[modIndex].delivery_units;
    if (!units || units.length <= 1) {
      if (units && units.length <= 1) alert('A module must have at least one delivery unit.');
      return;
    }
    const updatedUnits = units.filter((_: DeliveryUnit, i: number) => i !== unitIndex);
    if (updatedUnits) {
      newModules[modIndex].delivery_units = updatedUnits;
      setFormData({ ...formData, modules: newModules });
    }
  };

  const updateModule = (modIndex: number, field: string, value: any) => {
    const newModules = [...formData.modules];
    if (!newModules[modIndex]) return;
    newModules[modIndex] = { ...newModules[modIndex], [field]: value };
    setFormData({ ...formData, modules: newModules });
  };

  const updateUnit = (modIndex: number, unitIndex: number, field: string, value: any) => {
    const newModules = [...formData.modules];
    if (!newModules[modIndex] || !newModules[modIndex].delivery_units?.[unitIndex]) return;
    newModules[modIndex].delivery_units[unitIndex] = { 
      ...newModules[modIndex].delivery_units[unitIndex], 
      [field]: value 
    };
    setFormData({ ...formData, modules: newModules });
  };

  const toggleExamType = (exam: string) => {
    setFormData(prev => ({
      ...prev,
      exam_types: prev.exam_types.includes(exam)
        ? prev.exam_types.filter(e => e !== exam)
        : [...prev.exam_types, exam]
    }));
  };

  const addPackage = () => {
    setPackages([
      ...packages,
      { name: `Package ${packages.length + 1}`, sessions: 0, amount: 0, description: '', is_active: true }
    ]);
  };

  const removePackage = (index: number) => {
    if (packages.length <= 1) {
      alert('You need at least one package');
      return;
    }
    setPackages(packages.filter((_, i) => i !== index));
  };

  const updatePackage = (index: number, field: keyof Package, value: any) => {
    const updated = [...packages];
    updated[index] = { ...updated[index], [field]: value };
    setPackages(updated);
  };

  const moveModule = (modIndex: number, direction: 'up' | 'down') => {
    const newModules = [...formData.modules];
    const targetIndex = direction === 'up' ? modIndex - 1 : modIndex + 1;

    if (targetIndex < 0 || targetIndex >= newModules.length) return;

    [newModules[modIndex], newModules[targetIndex]] = [newModules[targetIndex], newModules[modIndex]];

    newModules.forEach((mod, i) => {
      mod.module_order = i + 1;
    });

    setFormData({ ...formData, modules: newModules });
  };

  // ==========================================================
  // HANDLE SUBMIT
  // ==========================================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const currentId = courseIdRef.current;
    if (!currentId || currentId === 'undefined') {
      setLoading(false);
      alert('Error: Course ID is missing.');
      return;
    }

    try {
      const payload = JSON.parse(JSON.stringify({ ...formData, packages }));
      
      const response = await fetch(`/api/courses/${currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      router.push(`/dashboard/academics/courses/${currentId}`);
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  }

  if (initialLoading) return <div className="p-6 flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (errorMessage) return <div className="p-6 max-w-4xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"><h2 className="font-bold mb-2">❌ Error</h2><p className="mb-4">{errorMessage}</p><button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Try Again</button></div></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href={`/dashboard/academics/courses/${courseIdRef.current}`} className="text-blue-600 hover:underline text-sm mb-1 inline-block">← Back to Course</Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit Course</h1>
        </div>
        <button type="submit" form="editForm" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition">{loading ? 'Saving...' : '💾 Save Changes'}</button>
      </div>

      <form id="editForm" onSubmit={handleSubmit}>
        <div className="flex border-b border-gray-200 mb-6">
          <button type="button" onClick={() => setActiveTab('details')} className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📋 Details & Pricing</button>
          <button type="button" onClick={() => setActiveTab('curriculum')} className={`px-6 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'curriculum' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📚 Curriculum ({formData.modules.length} Modules)</button>
        </div>

        {activeTab === 'details' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Course Name *</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" required /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Age Group *</label><select value={formData.age_group} onChange={(e) => setFormData({ ...formData, age_group: e.target.value })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" required><option value="">Select</option>{AGE_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Course Type *</label><select value={formData.course_type} onChange={(e) => setFormData({ ...formData, course_type: e.target.value })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" required><option value="">Select</option>{COURSE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  
                  {/* ✅ New URL Field */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Public Course Link (URL)</label>
                    <input 
                      type="url" 
                      value={formData.link_url || ''} 
                      onChange={(e) => setFormData({ ...formData, link_url: e.target.value })} 
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" 
                      placeholder="https://www.iworldlearning.com/..." 
                    />
                  </div>
                </div>
                <div className="mt-4"><label className="block text-xs font-medium text-gray-500 mb-1">Description</label><textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" /></div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4">💰 Pricing</h3>
                <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg max-w-md">
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, pricing_mode: 'hourly' }))} className={`flex-1 py-2 text-sm rounded-md text-center transition ${formData.pricing_mode === 'hourly' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Hourly</button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, pricing_mode: 'package' }))} className={`flex-1 py-2 text-sm rounded-md text-center transition ${formData.pricing_mode === 'package' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Packages</button>
                </div>

                {formData.pricing_mode === 'hourly' && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">On-Site ($/hr)</label><input type="number" value={formData.price_per_hour_on_site} onChange={(e) => setFormData({ ...formData, price_per_hour_on_site: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Online ($/hr)</label><input type="number" value={formData.price_per_hour_online} onChange={(e) => setFormData({ ...formData, price_per_hour_online: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">20+ hrs On-Site</label><input type="number" value={formData.price_20plus_on_site} onChange={(e) => setFormData({ ...formData, price_20plus_on_site: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">20+ hrs Online</label><input type="number" value={formData.price_20plus_online} onChange={(e) => setFormData({ ...formData, price_20plus_online: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">50+ hrs On-Site</label><input type="number" value={formData.price_50plus_on_site} onChange={(e) => setFormData({ ...formData, price_50plus_on_site: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">50+ hrs Online</label><input type="number" value={formData.price_50plus_online} onChange={(e) => setFormData({ ...formData, price_50plus_online: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500" min="0" step="1" /></div>
                    </div>
                  </div>
                )}

                {formData.pricing_mode === 'package' && (
                  <div className="space-y-3">
                    {packages.map((pkg, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 flex flex-wrap md:flex-nowrap items-center gap-3 shadow-sm hover:shadow transition">
                        <div className="flex-1 min-w-[150px]">
                          <label className="block text-[10px] uppercase text-gray-400 font-semibold tracking-wider mb-1">Package Name</label>
                          <input type="text" value={pkg.name} onChange={(e) => updatePackage(index, 'name', e.target.value)} className="w-full px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-sm font-medium transition" placeholder="e.g. 24 Lessons" />
                        </div>
                        <div className="w-20">
                          <label className="block text-[10px] uppercase text-gray-400 font-semibold tracking-wider mb-1 text-center">Sessions</label>
                          <input type="number" value={pkg.sessions || ''} onChange={(e) => updatePackage(index, 'sessions', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-sm text-center transition" min="1" />
                        </div>
                        <div className="w-24">
                          <label className="block text-[10px] uppercase text-gray-400 font-semibold tracking-wider mb-1 text-center">Amount ($)</label>
                          <input type="number" value={pkg.amount || ''} onChange={(e) => updatePackage(index, 'amount', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-sm text-center transition" min="0" step="1" />
                        </div>
                        <button type="button" onClick={() => removePackage(index)} className="ml-auto p-2 text-gray-300 hover:text-red-500 transition self-center">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={addPackage} className="w-full py-3 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-500 transition">+ Add Package</button>
                  </div>
                )}
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4">⚙️ Scheduling</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Duration (hours)</label><input type="number" value={formData.duration_hours} onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" min={1} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Delivery Mode *</label><select value={formData.delivery_mode} onChange={(e) => setFormData({ ...formData, delivery_mode: e.target.value })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" required>{DELIVERY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                </div>
                <div className="mt-4"><label className="block text-xs font-medium text-gray-500 mb-1">Scheduling Preference</label><select value={formData.scheduling_preference} onChange={(e) => setFormData({ ...formData, scheduling_preference: e.target.value })} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"><option value="same_day">Same Day (Grouped)</option><option value="split_across_days">Split Across Days</option></select></div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={formData.includes_exam_prep} onChange={(e) => setFormData({ ...formData, includes_exam_prep: e.target.checked })} className="w-4 h-4" />
                  <label className="text-sm font-medium">Includes Exam Preparation</label>
                </div>
                {formData.includes_exam_prep && (
                  <div className="flex flex-wrap gap-2">
                    {EXAM_TYPES.map((exam) => (
                      <button key={exam} type="button" onClick={() => toggleExamType(exam)} className={`px-3 py-1.5 text-xs rounded-full transition ${formData.exam_types.includes(exam) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{exam}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'curriculum' && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4 border-b pb-4">
              <h3 className="font-bold text-gray-800">📚 Modules & Units</h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Total Sessions: {formData.modules.reduce((total, mod) => total + (mod.delivery_units?.length || 0), 0)}
                </span>
                <button type="button" onClick={addModule} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">+ New Module</button>
              </div>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {formData.modules.map((mod, modIndex) => (
                <div key={modIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 mr-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      
                      {/* ✅ UPDATED LAYOUT: # -> Level -> Module Name */}
                      <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 text-sm font-bold rounded-full">
                        {modIndex + 1}
                      </span>
                      
                      <select 
                        value={mod.level || ''} 
                        onChange={(e) => updateModule(modIndex, 'level', e.target.value)}
                        className="w-full sm:w-36 px-2 py-2 border rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No Level</option>
                        {MODULE_LEVELS.map((lvl) => (
                          <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                        ))}
                      </select>

                      <input 
                        type="text" 
                        value={mod.title} 
                        onChange={(e) => updateModule(modIndex, 'title', e.target.value)} 
                        className="flex-1 px-3 py-2 border rounded-md font-medium focus:ring-2 focus:ring-blue-500" 
                        placeholder="Module Title" 
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 ml-2">
                      <button type="button" onClick={() => moveModule(modIndex, 'up')} className="text-gray-400 hover:text-blue-600 transition disabled:opacity-30" disabled={modIndex === 0}>↑</button>
                      <button type="button" onClick={() => moveModule(modIndex, 'down')} className="text-gray-400 hover:text-blue-600 transition disabled:opacity-30" disabled={modIndex === formData.modules.length - 1}>↓</button>
                      <button type="button" onClick={() => removeModule(modIndex)} className="text-red-500 hover:text-red-700 text-sm font-medium ml-2">Remove</button>
                    </div>
                  </div>

                  <div className="ml-9 space-y-2">
                    {mod.delivery_units?.map((unit, unitIndex) => (
                      <div key={unitIndex} className="bg-white p-3 rounded border border-gray-200 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400 w-4 text-right font-medium">{unitIndex + 1}.</span>
                        
                        <input type="text" value={unit.title} onChange={(e) => updateUnit(modIndex, unitIndex, 'title', e.target.value)} className="flex-1 min-w-[120px] px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-blue-500" placeholder="Unit Title" />
                        <select value={unit.unit_type} onChange={(e) => updateUnit(modIndex, unitIndex, 'unit_type', e.target.value)} className="px-2 py-1 border rounded text-sm bg-white focus:ring-1 focus:ring-blue-500">
                          <option value="lecture">Lecture</option>
                          <option value="practice">Practice</option>
                          <option value="lab">Lab</option>
                          <option value="assessment">Assessment</option>
                          <option value="roleplay">Roleplay</option>
                        </select>
                        <input type="number" value={unit.duration_minutes} onChange={(e) => updateUnit(modIndex, unitIndex, 'duration_minutes', parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border rounded text-sm text-center focus:ring-1 focus:ring-blue-500" placeholder="Mins" min="1" />
                        <button type="button" onClick={() => removeUnit(modIndex, unitIndex)} className="text-red-500 text-sm ml-2 font-bold">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addUnit(modIndex)} className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-2">+ Add Unit</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}