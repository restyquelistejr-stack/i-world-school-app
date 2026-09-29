'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  name: string;
  duration_hours: number;
}

interface Module {
  id: string;
  title: string;
  level: string;
  total_sessions: number;
}

interface Package {
  id: string;
  name: string;
  sessions: number;
  amount: number;
  course_id: string | null;
}

export default function InquireClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  
  const [maxStudents, setMaxStudents] = useState(1);
  const [requestedStartDate, setRequestedStartDate] = useState('');
  const [requestedDuration, setRequestedDuration] = useState(30);
  
  const [hoursPerSession, setHoursPerSession] = useState(2);
  const [totalSessions, setTotalSessions] = useState(20);
  const [isFlexibleMode, setIsFlexibleMode] = useState(false);
  
  // Teacher selection: can select one or more
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([]);
  const [showTeacherSelection, setShowTeacherSelection] = useState(false);

  const [availabilities, setAvailabilities] = useState([
    { day_of_week: 1, start_time: '09:00', end_time: '17:00' }
  ]);

  const daysOfWeek = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
  ];

  useEffect(() => { 
    loadData(); 
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: coursesData } = await supabase
      .from('courses')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setCourses(coursesData || []);
    setLoading(false);
  }

  // When course changes: Load modules and packages
  useEffect(() => {
    if (!selectedCourseId) {
      setModules([]);
      setPackages([]);
      setSelectedModuleId('');
      setSelectedPackageId('');
      return;
    }
    loadModulesAndPackages();
    updateSessionConfigFromCourse();
  }, [selectedCourseId]);

  async function loadModulesAndPackages() {
    // Fetch Modules
    const { data: modulesData } = await supabase
      .from('course_modules')
      .select('id, title, level, total_sessions')
      .eq('course_id', selectedCourseId)
      .order('module_order', { ascending: true });
    setModules(modulesData || []);

    // Fetch Packages
    const { data: packagesData } = await supabase
      .from('course_packages')
      .select('*')
      .eq('is_active', true)
      .or(`course_id.eq.${selectedCourseId},course_id.is.null`)
      .order('sessions');
    setPackages(packagesData || []);
  }

  async function updateSessionConfigFromCourse() {
    if (!selectedCourseId) return;
    
    const { data: course } = await supabase
      .from('courses')
      .select('duration_hours')
      .eq('id', selectedCourseId)
      .single();
    
    if (course) {
      const defaultHoursPerSession = 2;
      const defaultSessions = Math.ceil(course.duration_hours / defaultHoursPerSession);
      setHoursPerSession(defaultHoursPerSession);
      setTotalSessions(defaultSessions);
    }
  }

  // When module changes: Update sessions
  useEffect(() => {
    if (selectedModuleId) {
      const module = modules.find(m => m.id === selectedModuleId);
      if (module && module.total_sessions) {
        setTotalSessions(module.total_sessions);
      }
    }
  }, [selectedModuleId, modules]);

  // When package changes: Update sessions
  useEffect(() => {
    if (selectedPackageId) {
      const selectedPkg = packages.find(p => p.id === selectedPackageId);
      if (selectedPkg) {
        setTotalSessions(selectedPkg.sessions);
        setIsFlexibleMode(false);
      }
    } else if (selectedCourseId) {
      updateSessionConfigFromCourse();
    }
  }, [selectedPackageId, packages]);

  // Load teachers when module is selected and teacher selection is enabled
  useEffect(() => {
    if (showTeacherSelection && selectedModuleId) {
      loadAvailableTeachers();
    }
  }, [showTeacherSelection, selectedModuleId]);

  async function loadAvailableTeachers() {
    if (!selectedModuleId) return;

    const { data: teacherModules } = await supabase
      .from('teacher_modules')
      .select('teacher_id')
      .eq('module_id', selectedModuleId)
      .eq('is_active', true);

    if (!teacherModules || teacherModules.length === 0) return;

    const teacherIds = teacherModules.map(t => t.teacher_id);
    const { data: teachers } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .in('id', teacherIds)
      .order('full_name');

    setAvailableTeachers(teachers || []);
  }

  const toggleTeacherSelection = (teacherId: string) => {
    setSelectedTeachers(prev => 
      prev.includes(teacherId) 
        ? prev.filter(id => id !== teacherId) 
        : [...prev, teacherId]
    );
  };

  const addAvailability = () => {
    setAvailabilities([...availabilities, { day_of_week: 1, start_time: '09:00', end_time: '17:00' }]);
  };

  const removeAvailability = (index: number) => {
    const updated = availabilities.filter((_, i) => i !== index);
    setAvailabilities(updated);
  };

  const addBulkDays = (type: 'weekday' | 'weekend') => {
    let newDays = [];
    if (type === 'weekday') {
      newDays = [1, 2, 3, 4, 5].map(day => ({ day_of_week: day, start_time: '09:00', end_time: '17:00' }));
    } else {
      newDays = [6, 0].map(day => ({ day_of_week: day, start_time: '09:00', end_time: '17:00' }));
    }
    setAvailabilities(newDays);
  };

  const validateAvailabilities = () => {
    for (const avail of availabilities) {
      const [startHour] = avail.start_time.split(':').map(Number);
      const [endHour] = avail.end_time.split(':').map(Number);
      
      if (startHour < 9 || endHour > 22) {
        alert('School hours must be between 9:00 AM and 10:00 PM');
        return false;
      }
      
      if (startHour >= endHour) {
        alert('Start time must be before end time');
        return false;
      }
    }
    return true;
  };

  async function handleFindResources() {
    setSubmitting(true);
    
    if (!selectedCourseId) { 
      alert('Please select a course.'); 
      setSubmitting(false); 
      return; 
    }
    if (!selectedModuleId) { 
      alert('Please select a module.'); 
      setSubmitting(false); 
      return; 
    }
    if (!requestedStartDate) { 
      alert('Please select a requested start date.'); 
      setSubmitting(false); 
      return; 
    }
    if (availabilities.length === 0) { 
      alert('Please add at least one availability day.'); 
      setSubmitting(false); 
      return; 
    }
    if (!validateAvailabilities()) {
      setSubmitting(false);
      return;
    }

    const totalHours = totalSessions * hoursPerSession;
    const course = courses.find(c => c.id === selectedCourseId);
    const standardSessions = course ? Math.ceil(course.duration_hours / 2) : 0;

    const params = new URLSearchParams({
      courseId: selectedCourseId,
      moduleId: selectedModuleId,
      packageId: selectedPackageId || '',
      maxStudents: maxStudents.toString(),
      startDate: requestedStartDate,
      duration: requestedDuration.toString(),
      availabilities: JSON.stringify(availabilities),
      hoursPerSession: hoursPerSession.toString(),
      totalSessions: totalSessions.toString(),
      totalHours: totalHours.toString(),
      isFlexibleMode: isFlexibleMode.toString(),
      standardSessions: standardSessions.toString(),
      selectedTeachers: JSON.stringify(selectedTeachers),
      _t: Date.now().toString() 
    });

    router.push(`/dashboard/classes/inquire/results?${params.toString()}`);
    setSubmitting(false);
  }

  const totalCourseHours = totalSessions * hoursPerSession;
  const selectedModule = modules.find(m => m.id === selectedModuleId);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">📝 Register for Class</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Course *</label>
            <select 
              value={selectedCourseId} 
              onChange={(e) => setSelectedCourseId(e.target.value)} 
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              <option value="">Select a course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Module / Level *</label>
            <select 
              value={selectedModuleId} 
              onChange={(e) => setSelectedModuleId(e.target.value)} 
              className="w-full px-3 py-2 border rounded-lg bg-white"
              disabled={!selectedCourseId || modules.length === 0}
            >
              <option value="">Select a module...</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} {m.level ? `(${m.level})` : ''} - {m.total_sessions || 0} sessions
                </option>
              ))}
            </select>
            {selectedModule && (
              <p className="text-xs text-gray-500 mt-1">
                Level: {selectedModule.level || 'N/A'} • Sessions: {selectedModule.total_sessions || 0}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Package</label>
            <select 
              value={selectedPackageId} 
              onChange={(e) => setSelectedPackageId(e.target.value)} 
              className="w-full px-3 py-2 border rounded-lg bg-white"
              disabled={!selectedCourseId}
            >
              <option value="">
                Standard ({totalSessions} sessions × {hoursPerSession}h)
              </option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sessions} sessions - ${p.amount})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Students</label>
            <input 
              type="number" 
              value={maxStudents} 
              onChange={(e) => setMaxStudents(parseInt(e.target.value) || 1)} 
              className="w-full px-3 py-2 border rounded-lg" 
              min="1" 
            />
          </div>
        </div>

        {/* Teacher Selection */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-4 mb-3">
            <input
              type="checkbox"
              id="selectTeachers"
              checked={showTeacherSelection}
              onChange={(e) => {
                setShowTeacherSelection(e.target.checked);
                if (!e.target.checked) setSelectedTeachers([]);
              }}
              className="w-4 h-4"
            />
            <label htmlFor="selectTeachers" className="text-sm font-medium text-gray-700">
              Select specific teacher(s) for this class
            </label>
          </div>

          {showTeacherSelection && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-3">
                Select one or more teachers for this class. If none selected, the system will find the best match.
              </p>
              {availableTeachers.length === 0 ? (
                <p className="text-sm text-gray-500">No teachers available for this module. Please add teacher qualifications first.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTeachers.map((teacher) => (
                    <button
                      key={teacher.id}
                      type="button"
                      onClick={() => toggleTeacherSelection(teacher.id)}
                      className={`px-3 py-1.5 text-sm rounded-full transition ${
                        selectedTeachers.includes(teacher.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {teacher.full_name}
                      {selectedTeachers.includes(teacher.id) && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
              {selectedTeachers.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">Selected: {selectedTeachers.length} teacher(s)</p>
              )}
            </div>
          )}
        </div>

        {/* Session Configuration */}
        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Session Configuration</h2>
            <button
              onClick={() => setIsFlexibleMode(!isFlexibleMode)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              {isFlexibleMode ? 'Use Default Settings' : 'Customize Session'}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Hours per Session</label>
              <select
                value={hoursPerSession}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setHoursPerSession(val);
                  if (selectedCourseId && isFlexibleMode) {
                    const course = courses.find(c => c.id === selectedCourseId);
                    if (course) {
                      const newSessions = Math.ceil(course.duration_hours / val);
                      setTotalSessions(newSessions);
                    }
                  }
                }}
                className="w-full px-3 py-2 border rounded-lg bg-white"
                disabled={!isFlexibleMode}
              >
                <option value={0.5}>0.5 hours (30 min)</option>
                <option value={1}>1 hour</option>
                <option value={1.5}>1.5 hours</option>
                <option value={2}>2 hours</option>
                <option value={2.5}>2.5 hours</option>
                <option value={3}>3 hours</option>
                <option value={4}>4 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Number of Sessions</label>
              <input
                type="number"
                value={totalSessions}
                onChange={(e) => setTotalSessions(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-lg"
                min="1"
                disabled={!isFlexibleMode}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Total Hours</label>
              <div className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-gray-700">
                {totalCourseHours} hours
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Date & Duration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Requested Start Date</label>
              <input 
                type="date" 
                value={requestedStartDate} 
                onChange={(e) => setRequestedStartDate(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg bg-white" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (Days)</label>
              <select 
                value={requestedDuration} 
                onChange={(e) => setRequestedDuration(parseInt(e.target.value))} 
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value={30}>30 Days</option>
                <option value={45}>45 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Schedule Preferences</h2>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => addBulkDays('weekday')} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">+ Add Weekdays</button>
            <button onClick={() => addBulkDays('weekend')} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700">+ Add Weekend</button>
            <button onClick={addAvailability} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">+ Add Custom Day</button>
          </div>

          <div className="space-y-2">
            {availabilities.map((a, index) => (
              <div key={index} className="flex flex-wrap gap-3 items-end p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs text-gray-500 mb-1">Day</label>
                  <select 
                    value={a.day_of_week} 
                    onChange={(e) => {
                      const newAvail = [...availabilities];
                      newAvail[index].day_of_week = parseInt(e.target.value);
                      setAvailabilities(newAvail);
                    }}
                    className="w-full px-2 py-1 border rounded bg-white text-sm"
                  >
                    {daysOfWeek.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-xs text-gray-500 mb-1">Start</label>
                  <input 
                    type="time" 
                    value={a.start_time} 
                    min="09:00" 
                    max="22:00"
                    onChange={(e) => {
                      const newAvail = [...availabilities];
                      newAvail[index].start_time = e.target.value;
                      setAvailabilities(newAvail);
                    }}
                    className="w-full px-2 py-1 border rounded bg-white text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-xs text-gray-500 mb-1">End</label>
                  <input 
                    type="time" 
                    value={a.end_time} 
                    min="09:00" 
                    max="22:00"
                    onChange={(e) => {
                      const newAvail = [...availabilities];
                      newAvail[index].end_time = e.target.value;
                      setAvailabilities(newAvail);
                    }}
                    className="w-full px-2 py-1 border rounded bg-white text-sm"
                  />
                </div>
                <button onClick={() => removeAvailability(index)} className="px-2 py-1 text-red-600 hover:text-red-800 text-sm">Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={handleFindResources}
            disabled={submitting || !selectedCourseId || !selectedModuleId || !requestedStartDate || availabilities.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting ? 'Scanning...' : '🔍 Find Available Resources'}
          </button>
        </div>
      </div>
    </div>
  );
}