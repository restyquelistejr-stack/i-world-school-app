'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, isWithinInterval, parseISO, addHours, differenceInDays } from 'date-fns';

interface Course {
  id: string;
  name: string;
  course_type: string;
  level: string;
  duration_hours: number;
}

interface Package {
  id: string;
  name: string;
  sessions: number;
  amount: number;
}

interface TeacherOption {
  teacher_id: string;
  teacher_name: string;
  start_date: string;
  end_date: string;
  completion_score: number; // Lower is better (faster)
  slots: { start_time: string; end_time: string; room_name: string }[];
}

export default function AddClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [maxStudents, setMaxStudents] = useState(1);
  const [numberOfSessions, setNumberOfSessions] = useState(0);

  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [preferredStartTime, setPreferredStartTime] = useState('09:00');
  const [preferredEndTime, setPreferredEndTime] = useState('17:00');
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [searchWindowDays, setSearchWindowDays] = useState(60);
  const [isSearching, setIsSearching] = useState(false);

  const [foundOptions, setFoundOptions] = useState<TeacherOption[]>([]);
  const [generatedClassId, setGeneratedClassId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('draft');

  const weekDays = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
  ];

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [coursesRes] = await Promise.all([
      supabase.from('courses').select('*').eq('is_active', true).order('name'),
    ]);
    setCourses(coursesRes.data || []);
    setLoading(false);
  }

  // ==========================================
  // LOAD PACKAGES DYNAMICALLY (Only when a course is selected)
  // ==========================================
  async function loadPackagesForCourse() {
    if (!selectedCourseId) return;
    
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    // Calculate the required sessions based on the course duration and package type
    const requiredSessions = Math.ceil((course.duration_hours || 0) / 2);

    // Fetch only packages that have enough sessions for this course
    const { data: packagesData } = await supabase
      .from('course_packages')
      .select('*')
      .eq('is_active', true)
      .gte('sessions', requiredSessions)
      .order('sessions');

    setPackages(packagesData || []);
    setNumberOfSessions(requiredSessions);
    
    // Reset package selection if the new course doesn't match the old package
    if (selectedPackageId && packagesData) {
      const stillValid = packagesData.some(p => p.id === selectedPackageId);
      if (!stillValid) setSelectedPackageId('');
    }
  }

  // Trigger package load when course changes
  useEffect(() => {
    loadPackagesForCourse();
  }, [selectedCourseId]);

  // ==========================================
  // THE FASTEST-PATH SCHEDULER
  // ==========================================
  async function performSearch() {
    setIsSearching(true);
    setFoundOptions([]);
    setGeneratedClassId(null); // Reset for fresh search

    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) return;

    // Calculate total sessions (using either the package or the calculated duration)
    const totalSessions = selectedPackageId 
      ? packages.find(p => p.id === selectedPackageId)?.sessions || 0
      : numberOfSessions;

    // 1. Create a placeholder class draft
    let newClassId: string | null = null;
    try {
      const { data: newClass, error: classError } = await supabase
        .from('classes')
        .insert({
          course_id: selectedCourseId,
          package_id: selectedPackageId || null,
          max_students: maxStudents,
          total_sessions: totalSessions,
          session_duration: 2,
          status: 'draft',
        })
        .select()
        .single();

      if (classError || !newClass) {
        alert('Failed to create draft class: ' + (classError?.message || 'Unknown error'));
        setIsSearching(false);
        return;
      }

      newClassId = newClass.id;
      setGeneratedClassId(newClassId);
      setCurrentStatus('draft');
      console.log("✅ Draft Class ID saved:", newClassId);

    } catch (err: any) {
      alert('Error creating class: ' + err.message);
      setIsSearching(false);
      return;
    }

    const startDateObj = new Date(startDate);
    const endDateObj = addDays(startDateObj, searchWindowDays);
    const daysToCheck = preferredDays.length > 0 ? preferredDays : [1, 2, 3, 4, 5];

    // 2. Get eligible teachers
    const { data: staffCourses } = await supabase.from('staff_courses').select('staff_id').eq('course_id', selectedCourseId);
    if (!staffCourses || staffCourses.length === 0) {
      alert('No teachers assigned to this course.');
      await supabase.from('classes').delete().eq('id', newClassId);
      setIsSearching(false);
      return;
    }

    const eligibleTeacherIds = staffCourses.map(sc => sc.staff_id);
    const { data: teachers } = await supabase.from('users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).in('id', eligibleTeacherIds);
    const { data: roomsData } = await supabase.from('rooms').select('*').eq('is_active', true).gte('capacity', maxStudents).order('capacity');

    if (!teachers || teachers.length === 0) {
      alert('No active teachers found.');
      await supabase.from('classes').delete().eq('id', newClassId);
      setIsSearching(false);
      return;
    }

    // 3. Fetch Global Constraints
    const [existingBookings, leaves] = await Promise.all([
      supabase.from('bookings').select('*').gte('start_time', startDateObj.toISOString()).lte('start_time', endDateObj.toISOString()),
      supabase.from('staff_leaves').select('*').eq('is_active', true),
    ]);

    let teacherOptions: TeacherOption[] = [];

    // 4. Calculate Schedules
    for (const teacher of teachers) {
      const teacherBookings = (existingBookings.data || []).filter(b => b.teacher_id === teacher.id);
      const teacherLeaves = (leaves.data || []).filter(l => l.staff_id === teacher.id);
      const { data: availability } = await supabase.from('teacher_availability').select('*').eq('teacher_id', teacher.id).eq('is_active', true);

      if (!availability || availability.length === 0) continue;

      let foundSlots: { start: Date; end: Date; room_name: string; room_id: string }[] = [];

      for (let dayOffset = 0; dayOffset < searchWindowDays; dayOffset++) {
        const currentDate = addDays(startDateObj, dayOffset);
        const dayOfWeek = currentDate.getDay();
        if (!daysToCheck.includes(dayOfWeek)) continue;

        const onLeave = teacherLeaves.some(l => currentDate >= new Date(l.start_date) && currentDate <= new Date(l.end_date));
        if (onLeave) continue;

        const dayAvailability = availability.filter(a => a.day_of_week === dayOfWeek);
        if (dayAvailability.length === 0) continue;

        for (const avail of dayAvailability) {
          let slotStart = new Date(currentDate);
          slotStart.setHours(parseInt(avail.start_time.split(':')[0]), parseInt(avail.start_time.split(':')[1]), 0, 0);
          const slotEnd = new Date(currentDate);
          slotEnd.setHours(parseInt(avail.end_time.split(':')[0]), parseInt(avail.end_time.split(':')[1]), 0, 0);

          while (addHours(slotStart, 2) <= slotEnd) {
            const slotEndLocal = addHours(slotStart, 2);

            if (slotStart.getHours() < parseInt(preferredStartTime.split(':')[0]) || slotEndLocal.getHours() > parseInt(preferredEndTime.split(':')[0])) {
              slotStart.setHours(slotStart.getHours() + 1);
              continue;
            }

            const isBusy = teacherBookings.some(b => isWithinInterval(slotStart, { start: new Date(b.start_time), end: new Date(b.end_time) }));
            if (isBusy) {
              slotStart.setHours(slotStart.getHours() + 1);
              continue;
            }

            let foundRoom = null;
            for (const room of roomsData || []) {
              const isRoomBusy = (existingBookings.data || []).filter(b => b.room_id === room.id).some(b => isWithinInterval(slotStart, { start: new Date(b.start_time), end: new Date(b.end_time) }));
              if (!isRoomBusy) {
                foundRoom = room;
                break;
              }
            }

            if (foundRoom) {
              foundSlots.push({ 
                start: new Date(slotStart), 
                end: new Date(slotEndLocal), 
                room_id: foundRoom.id, 
                room_name: foundRoom.name 
              });
              slotStart.setHours(slotStart.getHours() + 1);
              break;
            }
            slotStart.setHours(slotStart.getHours() + 1);
          }
        }
      }

      if (foundSlots.length >= totalSessions) {
        foundSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
        const firstSlot = foundSlots[0];
        const lastSlot = foundSlots[totalSessions - 1];
        const completionScore = differenceInDays(lastSlot.end, firstSlot.start);

        teacherOptions.push({
          teacher_id: teacher.id,
          teacher_name: teacher.full_name,
          start_date: format(firstSlot.start, 'MMM d, yyyy'),
          end_date: format(lastSlot.end, 'MMM d, yyyy'),
          completion_score: completionScore,
          slots: foundSlots.slice(0, totalSessions).map(s => ({
            start_time: s.start.toISOString(),
            end_time: s.end.toISOString(),
            room_name: s.room_name,
          })),
        });
      }
    }

    if (teacherOptions.length === 0) {
      alert('No teachers available for these preferences.');
      await supabase.from('classes').delete().eq('id', newClassId);
      setIsSearching(false);
      return;
    }

    teacherOptions.sort((a, b) => a.completion_score - b.completion_score);
    setFoundOptions(teacherOptions);
    setCurrentStatus('pending_admin');
    setStep(2);
    setIsSearching(false);
  }

  // ==========================================
  // ADMIN SELECTION
  // ==========================================
  async function handleAdminSelect(teacherId: string) {
    setSubmitting(true);

    const { data: selectedOptions, error: fetchError } = await supabase
      .from('class_options')
      .select('*')
      .eq('class_id', generatedClassId)
      .eq('teacher_id', teacherId)
      .order('session_index');

    if (fetchError || !selectedOptions || selectedOptions.length === 0) {
      alert('Failed to load options: ' + (fetchError?.message || 'No options found'));
      console.error("Draft Class ID was:", generatedClassId);
      setSubmitting(false);
      return;
    }

    // Update Class Status to Pending Student
    await supabase.from('classes').update({ status: 'pending_student' }).eq('id', generatedClassId);

    // Create Class Sessions
    const sessionInserts = selectedOptions.map((opt, idx) => ({
      class_id: generatedClassId,
      session_number: idx + 1,
      start_time: opt.start_time,
      end_time: opt.end_time,
      room_id: opt.room_id,
      teacher_id: opt.teacher_id,
    }));

    const { data: insertedSessions, error: sesError } = await supabase.from('class_sessions').insert(sessionInserts).select();
    if (sesError) {
      await supabase.from('classes').delete().eq('id', generatedClassId);
      alert('Failed to lock sessions: ' + sesError.message);
      setSubmitting(false);
      return;
    }

    // Lock the Bookings
    const bookingInserts = insertedSessions.map((s) => ({
      class_session_id: s.id,
      room_id: s.room_id,
      teacher_id: s.teacher_id,
      course_id: selectedCourseId,
      start_time: s.start_time,
      end_time: s.end_time,
    }));

    const { error: bookError } = await supabase.from('bookings').insert(bookingInserts);
    if (bookError) {
      await supabase.from('class_sessions').delete().eq('class_id', generatedClassId);
      await supabase.from('classes').delete().eq('id', generatedClassId);
      alert('Failed to confirm booking: ' + bookError.message);
      setSubmitting(false);
      return;
    }

    router.push('/dashboard/classes/management');
    setSubmitting(false);
  }

  function goBackToStep1() {
    setStep(1);
    setFoundOptions([]);
    setGeneratedClassId(null);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  // ==========================================
  // RENDER: PHASE 1 (Input)
  // ==========================================
  if (step === 1) {
    const activeCourse = courses.find(c => c.id === selectedCourseId);
    const sessionCount = selectedPackageId 
      ? packages.find(p => p.id === selectedPackageId)?.sessions || 0
      : Math.ceil((activeCourse?.duration_hours || 0) / 2);

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/classes/management"><button className="text-gray-600 hover:text-gray-900">← Back</button></Link>
          <h1 className="text-2xl font-bold text-gray-900">Add New Class</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Course *</label>
              <select 
                value={selectedCourseId} 
                onChange={(e) => setSelectedCourseId(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select a course...</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Package (Optional)</label>
              <select 
                value={selectedPackageId} 
                onChange={(e) => setSelectedPackageId(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg"
                disabled={!selectedCourseId || packages.length === 0}
              >
                <option value="">Standard ({sessionCount} sessions)</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sessions} sessions - ${p.amount})</option>
                ))}
              </select>
              {selectedCourseId && packages.length === 0 && (
                <p className="text-xs text-red-500 mt-1">No packages available for this course.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Students</label>
              <input type="number" value={maxStudents} onChange={(e) => setMaxStudents(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg" min="1" />
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Schedule Preferences</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Search Window</label>
                <select value={searchWindowDays} onChange={(e) => setSearchWindowDays(parseInt(e.target.value))} className="w-full px-3 py-2 border rounded-lg">
                  {[30, 45, 60, 90].map(v => <option key={v} value={v}>{v} days</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Preferred Start</label>
                <input type="time" value={preferredStartTime} onChange={(e) => setPreferredStartTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Preferred End</label>
                <input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Preferred Days</label>
              <div className="flex flex-wrap gap-2">
                {weekDays.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      if (preferredDays.includes(day.value)) setPreferredDays(preferredDays.filter(d => d !== day.value));
                      else setPreferredDays([...preferredDays, day.value]);
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition ${preferredDays.includes(day.value) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={performSearch}
              disabled={isSearching || !selectedCourseId}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSearching ? 'Searching...' : 'Find Fastest Teachers'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: PHASE 2 (Admin Selection)
  // ==========================================
  if (step === 2) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">📋 Available Teachers (Sorted by Speed)</h1>
          <button 
            onClick={goBackToStep1}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            ← Back to Search
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          The system has scanned {foundOptions.length} teachers. Select a teacher to proceed with the booking.
        </p>

        <div className="space-y-4">
          {foundOptions.map((teacher, index) => (
            <button
              key={teacher.teacher_id}
              onClick={() => handleAdminSelect(teacher.teacher_id)}
              className="w-full text-left p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-lg">{teacher.teacher_name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    🚀 Starts: {teacher.start_date} · Finishes: {teacher.end_date} · Duration: {teacher.completion_score} days
                  </div>
                </div>
                <div className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  Rank #{index + 1}
                </div>
              </div>
              
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {teacher.slots.map((slot, idx) => (
                  <div key={idx} className="text-xs text-gray-600 p-2 bg-gray-50 rounded border border-gray-100">
                    <span className="font-medium">Session {idx + 1}:</span> {format(parseISO(slot.start_time), 'MMM d, h:mm a')} 
                    <span className="text-gray-400 ml-1">(Room: {slot.room_name})</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-2 text-xs text-green-600 font-medium">✅ Pre-verified: No conflicts detected</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}