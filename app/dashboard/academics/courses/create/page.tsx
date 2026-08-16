'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'kids', label: 'Kids' },
  { value: 'middle_school', label: 'Middle School' },
  { value: 'high_school', label: 'High School' },
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
  title: string;
  unit_type: string;
  duration_minutes: number;
  unit_order: number;
}

export default function CreateCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    age_group: '',
    course_type: '',
    level: '',
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
    link_url: '',
    modules: [
      {
        title: '',
        module_order: 1,
        delivery_units: [{ title: '', unit_type: 'lecture', duration_minutes: 60, unit_order: 1 }]
      }
    ] as any[]
  });

  const [packages, setPackages] = useState<Package[]>([
    { name: '24 Lessons (2-3 Months)', sessions: 24, amount: 1858, description: 'Perfect for beginners', is_active: true },
    { name: '48 Lessons (4-6 Months)', sessions: 48, amount: 3173, description: 'Best value for serious learners', is_active: true },
  ]);

  // --- HELPERS ---
  const addModule = () => {
    setFormData(prev => ({
      ...prev,
      modules: [
        ...prev.modules,
        { 
          title: '', 
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
      if (units && units.length <= 1) {
        alert('A module must have at least one delivery unit.');
      }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // ✅ FIX: Send both formData AND the packages array explicitly
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, packages }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create course');
      }

      alert('✅ Course created successfully!');
      router.push('/dashboard/academics/courses');
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/academics/courses">
          <button className="text-gray-600 hover:text-gray-900">← Back to Courses</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Course</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
        
        {/* LEFT COLUMN: Metadata & Pricing */}
        <div className="lg:w-1/3 space-y-6">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4 border-b pb-2">📋 Course Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Course Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="e.g., Daily English"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Age Group *</label>
                  <select
                    value={formData.age_group}
                    onChange={(e) => setFormData({ ...formData, age_group: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select</option>
                    {AGE_GROUPS.map((group) => (
                      <option key={group.value} value={group.value}>{group.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Level</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    {LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Course Type *</label>
                <select
                  value={formData.course_type}
                  onChange={(e) => setFormData({ ...formData, course_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select</option>
                  {COURSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the course..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Public Course Link (URL)</label>
                <input
                  type="url"
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://www.iworldlearning.com/..."
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4 border-b pb-2">⚙️ Settings</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Hours</label>
                  <input
                    type="number"
                    value={formData.duration_hours}
                    onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Delivery Mode</label>
                  <select
                    value={formData.delivery_mode}
                    onChange={(e) => setFormData({ ...formData, delivery_mode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {DELIVERY_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Scheduling Preference</label>
                <select
                  value={formData.scheduling_preference}
                  onChange={(e) => setFormData({ ...formData, scheduling_preference: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="same_day">Same Day (Grouped)</option>
                  <option value="split_across_days">Split Across Days</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4 border-b pb-2">💰 Pricing</h2>
            <div className="flex gap-3 mb-4">
              <button type="button" onClick={() => setFormData(prev => ({ ...prev, pricing_mode: 'hourly' }))} className={`flex-1 py-2 text-sm rounded-lg transition ${formData.pricing_mode === 'hourly' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Hourly</button>
              <button type="button" onClick={() => setFormData(prev => ({ ...prev, pricing_mode: 'package' }))} className={`flex-1 py-2 text-sm rounded-lg transition ${formData.pricing_mode === 'package' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Package</button>
            </div>

            {formData.pricing_mode === 'package' && (
              <div className="space-y-3">
                {packages.map((pkg, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex gap-2">
                      <input type="text" value={pkg.name} onChange={(e) => updatePackage(index, 'name', e.target.value)} className="flex-1 text-sm px-2 py-1 border rounded" placeholder="Name" />
                      <input type="number" value={pkg.sessions || ''} onChange={(e) => updatePackage(index, 'sessions', parseInt(e.target.value) || 0)} className="w-16 text-sm px-2 py-1 border rounded text-center" placeholder="Sess" />
                      <input type="number" value={pkg.amount || ''} onChange={(e) => updatePackage(index, 'amount', parseFloat(e.target.value) || 0)} className="w-20 text-sm px-2 py-1 border rounded text-center" placeholder="$" />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <label className="text-xs flex items-center gap-1 text-gray-500"><input type="checkbox" checked={pkg.is_active} onChange={(e) => updatePackage(index, 'is_active', e.target.checked)} /> Active</label>
                      <button type="button" onClick={() => removePackage(index)} className="text-xs text-red-500">Remove</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addPackage} className="w-full py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-500 transition">+ Add Package</button>
              </div>
            )}
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
             <div className="flex items-center gap-2">
              <input type="checkbox" checked={formData.includes_exam_prep} onChange={(e) => setFormData({ ...formData, includes_exam_prep: e.target.checked })} className="w-4 h-4" />
              <label className="text-sm font-medium">Includes Exam Prep</label>
            </div>
            {formData.includes_exam_prep && (
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAM_TYPES.map(exam => (
                  <button type="button" key={exam} onClick={() => toggleExamType(exam)} className={`px-3 py-1 text-xs rounded-full ${formData.exam_types.includes(exam) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{exam}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Curriculum Builder */}
        <div className="lg:w-2/3">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100 sticky top-6">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h2 className="font-bold text-gray-800">📚 Curriculum (Modules & Units)</h2>
              <button type="button" onClick={addModule} className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Module</button>
            </div>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {formData.modules.map((mod, modIndex) => (
                <div key={modIndex} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 mr-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Module {modIndex + 1} Title</label>
                      <input type="text" value={mod.title} onChange={(e) => updateModule(modIndex, 'title', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g., Business Email Etiquette" />
                    </div>
                    <button type="button" onClick={() => removeModule(modIndex)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                  </div>

                  <div className="ml-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Delivery Units</span>
                      <button type="button" onClick={() => addUnit(modIndex)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Unit</button>
                    </div>

                    {mod.delivery_units && mod.delivery_units.map((unit: DeliveryUnit, unitIndex: number) => (
                      <div key={unitIndex} className="flex flex-wrap items-center gap-2 bg-white p-2 rounded border border-gray-200">
                        <input type="text" placeholder="Title" value={unit.title} onChange={(e) => updateUnit(modIndex, unitIndex, 'title', e.target.value)} className="flex-1 min-w-[150px] px-2 py-1 border rounded text-sm" />
                        <select value={unit.unit_type} onChange={(e) => updateUnit(modIndex, unitIndex, 'unit_type', e.target.value)} className="px-2 py-1 border rounded text-sm bg-white">
                          <option value="lecture">Lecture</option>
                          <option value="practice">Practice</option>
                          <option value="lab">Lab</option>
                          <option value="assessment">Assessment</option>
                          <option value="roleplay">Roleplay</option>
                        </select>
                        <input type="number" placeholder="Mins" value={unit.duration_minutes} onChange={(e) => updateUnit(modIndex, unitIndex, 'duration_minutes', parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border rounded text-sm text-center" min="1" />
                        <button type="button" onClick={() => removeUnit(modIndex, unitIndex)} className="text-red-500 hover:text-red-700 text-sm ml-2 font-bold">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
              <Link href="/dashboard/academics/courses">
                <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">Cancel</button>
              </Link>
              <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}