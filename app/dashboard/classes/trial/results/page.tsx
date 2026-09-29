// app/dashboard/classes/trial/results/page.tsx - COMPLETE REWRITE
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, addDays, isWithinInterval } from 'date-fns';

interface AvailableSlot {
  teacher_id: string;
  teacher_name: string;
  date: string;
  start_time: string;
  end_time: string;
  room_id: string;
  room_name: string;
  teacher_profile?: {
    specialization?: string;
    years_experience?: number;
    profile_headline?: string;
    hourly_rate?: number;
  };
}

interface TeacherWithSlots {
  teacher_id: string;
  teacher_name: string;
  teacher_profile?: any;
  slots: AvailableSlot[];
}

export default function TrialResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Safely get params with fallbacks
  const studentId = searchParams?.get('student_id') || '';
  const courseId = searchParams?.get('course_id') || '';
  const moduleId = searchParams?.get('module_id') || '';
  const sessionType = searchParams?.get('session_type') || 'private';
  const hours = parseInt(searchParams?.get('hours') || '2');
  const startDateParam = searchParams?.get('start_date') || '';
  const startTime = searchParams?.get('start_time') || '09:00';
  const endTime = searchParams?.get('end_time') || '17:00';
  
  // Safely parse preferred days
  let preferredDays: number[] = [];
  try {
    const daysParam = searchParams?.get('preferred_days');
    if (daysParam) {
      preferredDays = JSON.parse(daysParam);
    }
  } catch {
    preferredDays = [];
  }

  const [loading, setLoading] = useState(true);
  const [teachersWithSlots, setTeachersWithSlots] = useState<TeacherWithSlots[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [studentName, setStudentName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Load results on mount
  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = useCallback(async () => {
    setLoading(true);
    setDebugInfo('Loading qualified teachers...');
    try {
      // 1. Get student name
      if (studentId) {
        const { data } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', studentId)
          .single();
        if (data) setStudentName(data.full_name);
      }

      // 2. Get course name
      if (courseId) {
        const { data } = await supabase
          .from('courses')
          .select('name')
          .eq('id', courseId)
          .single();
        if (data) setCourseName(data.name);
      }

      // 3. Get module name
      if (moduleId) {
        const { data } = await supabase
          .from('course_modules')
          .select('title')
          .eq('id', moduleId)
          .single();
        if (data) setModuleName(data.title);
      }

      // 4. Get qualified teachers
      let qualifiedTeacherIds: string[] = [];
      
      // Check teacher_modules for module-level qualification
      if (moduleId) {
        const { data: moduleTeachers } = await supabase
          .from('teacher_modules')
          .select('teacher_id')
          .eq('module_id', moduleId)
          .eq('is_active', true);
        if (moduleTeachers && moduleTeachers.length > 0) {
          qualifiedTeacherIds = moduleTeachers.map(t => t.teacher_id);
        }
      }
      
      // If no module-level teachers, check course-level
      if (qualifiedTeacherIds.length === 0 && courseId) {
        const { data: courseTeachers } = await supabase
          .from('staff_courses')
          .select('staff_id')
          .eq('course_id', courseId)
          .eq('is_active', true);
        if (courseTeachers && courseTeachers.length > 0) {
          qualifiedTeacherIds = courseTeachers.map(t => t.staff_id);
        }
      }
      
      // If still no teachers, use all active teachers (with warning)
      if (qualifiedTeacherIds.length === 0) {
        console.warn('⚠️ No qualified teachers found, using all active teachers');
        const { data: allTeachers } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'teacher')
          .eq('is_active', true);
        if (allTeachers) {
          qualifiedTeacherIds = allTeachers.map(t => t.id);
        }
      }

      if (qualifiedTeacherIds.length === 0) {
        setDebugInfo('No qualified teachers found');
        setLoading(false);
        return;
      }

      // 5. Get teacher details with profiles
      const { data: teachersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', qualifiedTeacherIds)
        .eq('is_active', true);

      const { data: profilesData } = await supabase
        .from('teachers')
        .select('id, specialization, years_experience, profile_headline, hourly_rate')
        .in('id', qualifiedTeacherIds);

      const teacherMap = new Map();
      (teachersData || []).forEach(t => teacherMap.set(t.id, { ...t, profile: null }));
      (profilesData || []).forEach(p => {
        if (teacherMap.has(p.id)) {
          teacherMap.set(p.id, { ...teacherMap.get(p.id), profile: p });
        }
      });

      const teachersWithProfiles = Array.from(teacherMap.values());

      // 6. Validate startDateParam before using
      if (!startDateParam) {
        setDebugInfo('No start date provided');
        setLoading(false);
        return;
      }

      const startDateTime = new Date(startDateParam);
      if (isNaN(startDateTime.getTime())) {
        setDebugInfo('Invalid start date');
        setLoading(false);
        return;
      }

      // 7. Find available slots for each teacher (up to 3 days)
      const allTeacherSlots: TeacherWithSlots[] = [];
      const searchEndDate = new Date(startDateTime);
      searchEndDate.setDate(searchEndDate.getDate() + 30); // Look 30 days ahead

      // Get teacher leaves
      const { data: leavesData } = await supabase
        .from('staff_leaves')
        .select('*')
        .in('staff_id', qualifiedTeacherIds)
        .eq('is_active', true)
        .gte('end_date', startDateParam);

      const leaveDatesByTeacher: Record<string, Set<string>> = {};
      if (leavesData) {
        for (const leave of leavesData) {
          if (!leaveDatesByTeacher[leave.staff_id]) {
            leaveDatesByTeacher[leave.staff_id] = new Set();
          }
          let current = new Date(leave.start_date);
          const end = new Date(leave.end_date);
          while (current <= end) {
            leaveDatesByTeacher[leave.staff_id].add(current.toISOString().split('T')[0]);
            current = addDays(current, 1);
          }
        }
      }

      // Get existing bookings for teachers
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('*')
        .in('teacher_id', qualifiedTeacherIds)
        .gte('start_time', startDateTime.toISOString())
        .lte('start_time', searchEndDate.toISOString())
        .in('status', ['confirmed', 'in_progress', 'pending']);

      const bookingsByTeacher: Record<string, { start: Date; end: Date }[]> = {};
      if (existingBookings) {
        for (const booking of existingBookings) {
          if (!bookingsByTeacher[booking.teacher_id]) {
            bookingsByTeacher[booking.teacher_id] = [];
          }
          bookingsByTeacher[booking.teacher_id].push({
            start: new Date(booking.start_time),
            end: new Date(booking.end_time)
          });
        }
      }

      // Get teacher availability
      const { data: availabilityData } = await supabase
        .from('teacher_availability')
        .select('*')
        .in('teacher_id', qualifiedTeacherIds)
        .eq('is_active', true);

      const teacherAvailability: Record<string, Record<number, { start: string; end: string }[]>> = {};
      for (const avail of availabilityData || []) {
        if (!teacherAvailability[avail.teacher_id]) {
          teacherAvailability[avail.teacher_id] = {};
        }
        if (!teacherAvailability[avail.teacher_id][avail.day_of_week]) {
          teacherAvailability[avail.teacher_id][avail.day_of_week] = [];
        }
        teacherAvailability[avail.teacher_id][avail.day_of_week].push({
          start: avail.start_time,
          end: avail.end_time
        });
      }

      // Get rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true);

      // Get room bookings
      const { data: roomBookings } = await supabase
        .from('room_bookings')
        .select('*')
        .gte('start_time', startDateTime.toISOString())
        .lte('start_time', searchEndDate.toISOString())
        .in('status', ['confirmed', 'pending']);

      const roomBookingsByRoom: Record<string, { start: Date; end: Date }[]> = {};
      if (roomBookings) {
        for (const booking of roomBookings) {
          if (!roomBookingsByRoom[booking.room_id]) {
            roomBookingsByRoom[booking.room_id] = [];
          }
          roomBookingsByRoom[booking.room_id].push({
            start: new Date(booking.start_time),
            end: new Date(booking.end_time)
          });
        }
      }

      // For each teacher, find up to 3 available slots
      let currentDate = new Date(startDateTime);
      let attempts = 0;
      const maxAttempts = 30;

      // Build a map of teacher slots
      const teacherSlotsMap: Record<string, AvailableSlot[]> = {};

      while (currentDate <= searchEndDate && attempts < maxAttempts) {
        attempts++;
        const dayOfWeek = currentDate.getDay();
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Check if student is available on this day
        if (!preferredDays.includes(dayOfWeek)) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        // For each qualified teacher
        for (const teacher of teachersWithProfiles) {
          const teacherId = teacher.id;
          
          // Skip if teacher already has 3 slots found
          if (teacherSlotsMap[teacherId] && teacherSlotsMap[teacherId].length >= 3) {
            continue;
          }
          
          // Skip if teacher is on leave
          if (leaveDatesByTeacher[teacherId]?.has(dateStr)) {
            continue;
          }

          // Get teacher's availability for this day
          const availSlots = teacherAvailability[teacherId]?.[dayOfWeek] || [];
          if (availSlots.length === 0) continue;

          // Check each availability slot
          for (const avail of availSlots) {
            // Find overlap between student and teacher availability
            const overlapStart = avail.start > startTime ? avail.start : startTime;
            const overlapEnd = avail.end < endTime ? avail.end : endTime;

            if (overlapStart >= overlapEnd) continue;

            // Calculate if we can fit the session
            const startHour = parseInt(overlapStart.split(':')[0]);
            const startMin = parseInt(overlapStart.split(':')[1] || '0');
            const endHour = parseInt(overlapEnd.split(':')[0]);
            const endMin = parseInt(overlapEnd.split(':')[1] || '0');
            const availableMinutes = (endHour - startHour) * 60 + (endMin - startMin);
            const sessionMinutes = hours * 60;

            if (availableMinutes < sessionMinutes) continue;

            // ⭐ FIXED: Calculate latest start time in minutes
            const latestStartMinutes = (endHour * 60 + endMin) - sessionMinutes;
            const maxStartHour = Math.floor(latestStartMinutes / 60);
            const maxStartMin = latestStartMinutes % 60;

            // Try different start times
            let slotStart = new Date(currentDate);
            slotStart.setHours(startHour, startMin, 0, 0);

            while ((slotStart.getHours() < maxStartHour || 
                    (slotStart.getHours() === maxStartHour && slotStart.getMinutes() <= maxStartMin))) {
              
              // ⭐ FIXED: Preserve minutes when calculating end time
              const slotEnd = new Date(slotStart);
              slotEnd.setHours(slotStart.getHours() + hours, slotStart.getMinutes(), 0, 0);

              // Check if the slot is valid using minutes
              const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
              const overlapEndMinutes = endHour * 60 + endMin;
              
              if (slotEndMinutes > overlapEndMinutes) {
                slotStart.setMinutes(slotStart.getMinutes() + 15);
                continue;
              }

              // Check teacher booking conflicts
              const teacherBookings = bookingsByTeacher[teacherId] || [];
              const hasTeacherConflict = teacherBookings.some((b: any) => {
                return isWithinInterval(slotStart, { start: b.start, end: b.end }) ||
                       isWithinInterval(slotEnd, { start: b.start, end: b.end }) ||
                       (slotStart <= b.start && slotEnd >= b.end);
              });

              if (!hasTeacherConflict) {
                // Find available room
                let selectedRoom = null;
                for (const room of roomsData || []) {
                  const roomBookingsList = roomBookingsByRoom[room.id] || [];
                  const hasRoomConflict = roomBookingsList.some((b: any) => {
                    return isWithinInterval(slotStart, { start: b.start, end: b.end }) ||
                           isWithinInterval(slotEnd, { start: b.start, end: b.end }) ||
                           (slotStart <= b.start && slotEnd >= b.end);
                  });

                  if (!hasRoomConflict) {
                    selectedRoom = room;
                    break;
                  }
                }

                if (selectedRoom) {
                  if (!teacherSlotsMap[teacherId]) {
                    teacherSlotsMap[teacherId] = [];
                  }
                  
                  // Only add if we have less than 3 slots
                  if (teacherSlotsMap[teacherId].length < 3) {
                    teacherSlotsMap[teacherId].push({
                      teacher_id: teacherId,
                      teacher_name: teacher.full_name,
                      date: dateStr,
                      start_time: format(slotStart, 'HH:mm'),
                      end_time: format(slotEnd, 'HH:mm'),
                      room_id: selectedRoom.id,
                      room_name: selectedRoom.name,
                      teacher_profile: teacher.profile || undefined,
                    });
                  }
                  break;
                }
              }

              // ⭐ FIXED: Increment by 15 minutes
              slotStart.setMinutes(slotStart.getMinutes() + 15);
            }

            if (teacherSlotsMap[teacherId] && teacherSlotsMap[teacherId].length >= 3) break;
          }
        }

        currentDate = addDays(currentDate, 1);
      }

      // Convert map to array and sort slots by date for each teacher
      const result: TeacherWithSlots[] = [];
      for (const [teacherId, slots] of Object.entries(teacherSlotsMap)) {
        if (slots.length === 0) continue;
        
        // Sort slots by date
        slots.sort((a, b) => a.date.localeCompare(b.date));
        
        const teacher = teachersWithProfiles.find(t => t.id === teacherId);
        result.push({
          teacher_id: teacherId,
          teacher_name: teacher?.full_name || 'Unknown',
          teacher_profile: teacher?.profile || undefined,
          slots: slots,
        });
      }

      // Sort teachers by the date of their first available slot
      result.sort((a, b) => {
        if (a.slots.length === 0 || b.slots.length === 0) return 0;
        return a.slots[0].date.localeCompare(b.slots[0].date);
      });

      setTeachersWithSlots(result);

      // Auto-select the first teacher and their first slot
      if (result.length > 0 && result[0].slots.length > 0) {
        setSelectedTeacher(result[0].teacher_id);
        setSelectedSlot(result[0].slots[0]);
      }

      setDebugInfo(`Found ${result.length} teachers with available slots`);

    } catch (error: any) {
      console.error('Error loading results:', error);
      setDebugInfo('Error: ' + error.message);
    }
    setLoading(false);
  }, [studentId, courseId, moduleId, startDateParam, startTime, endTime, hours, preferredDays]);

  const handleSelectTeacher = (teacherId: string) => {
    setSelectedTeacher(teacherId);
    const teacher = teachersWithSlots.find(t => t.teacher_id === teacherId);
    if (teacher && teacher.slots.length > 0) {
      setSelectedSlot(teacher.slots[0]);
    }
  };

  const handleSelectSlot = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
  };

  const toggleExpandTeacher = (teacherId: string) => {
    setExpandedTeacher(expandedTeacher === teacherId ? null : teacherId);
  };

  const handleConfirm = async () => {
    if (!selectedSlot) {
      alert('Please select a time slot.');
      return;
    }

    try {
      // Create trial booking
      const { data: trial, error } = await supabase
        .from('trial_class_bookings')
        .insert({
          student_id: studentId,
          course_id: courseId,
          module_id: moduleId,
          session_type: sessionType,
          hours: hours,
          selected_date: selectedSlot.date,
          selected_time: selectedSlot.start_time,
          selected_teacher_id: selectedSlot.teacher_id,
          room_id: selectedSlot.room_id,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      // Also create a booking entry for calendar
      const startDateTime = new Date(`${selectedSlot.date}T${selectedSlot.start_time}:00`);
      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(startDateTime.getHours() + hours, startDateTime.getMinutes(), 0, 0);

      await supabase
        .from('bookings')
        .insert({
          room_id: selectedSlot.room_id,
          teacher_id: selectedSlot.teacher_id,
          course_id: courseId,
          student_id: studentId,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          status: 'confirmed',
          class_id: null,
        });

      alert('✅ Trial class booked successfully!');
      router.push('/dashboard/classes/management');
    } catch (error: any) {
      console.error('Error confirming trial:', error);
      alert('Error: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/trial">
          <button className="text-gray-600 hover:text-gray-900">← Back to Trial Booking</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">🎯 Trial Class - Available Slots</h1>
        <span className="text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
          Single Session
        </span>
        {debugInfo && (
          <span className="text-sm text-gray-500 ml-2">{debugInfo}</span>
        )}
      </div>

      {/* Summary */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <span className="text-blue-600">Student:</span>
            <span className="ml-1 font-medium text-blue-800">{studentName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600">Course:</span>
            <span className="ml-1 font-medium text-blue-800">{courseName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600">Module:</span>
            <span className="ml-1 font-medium text-blue-800">{moduleName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-blue-600">Type:</span>
            <span className="ml-1 font-medium text-blue-800 capitalize">{sessionType}</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-blue-600">
          📅 Preferred days: {preferredDays.map(d => DAYS[d]).join(', ')} | ⏰ {startTime} - {endTime} | 📖 {hours} hour(s)
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-purple-700">
          🎯 Showing <strong>up to 3 available slots</strong> for each qualified teacher.
          Select the teacher and time that works best for the trial class.
        </p>
      </div>

      {/* Teachers with Slots */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">
          👨‍🏫 Qualified Teachers ({teachersWithSlots.length})
        </h3>
        {teachersWithSlots.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center text-yellow-700">
            <p className="font-medium">No available slots found</p>
            <p className="text-sm mt-1">
              Try adjusting your preferred days, time range, or start date.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {teachersWithSlots.map((teacher) => {
              const isSelected = selectedTeacher === teacher.teacher_id;
              const profile = teacher.teacher_profile;
              const isExpanded = expandedTeacher === teacher.teacher_id;
              
              return (
                <div
                  key={teacher.teacher_id}
                  className={`p-4 rounded-lg border-2 transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Teacher Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-lg">{teacher.teacher_name}</p>
                        {profile?.profile_headline && (
                          <span className="text-sm text-gray-500">• {profile.profile_headline}</span>
                        )}
                      </div>
                      {profile?.specialization && (
                        <p className="text-sm text-gray-600">📚 {profile.specialization}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1">
                        {profile?.years_experience && profile.years_experience > 0 && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">⏱ {profile.years_experience} years</span>
                        )}
                        {profile?.hourly_rate && profile.hourly_rate > 0 && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">💰 ${profile.hourly_rate}/hr</span>
                        )}
                      </div>
                      {profile?.bio && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{profile.bio}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => {
                          handleSelectTeacher(teacher.teacher_id);
                          // Expand the teacher when selected
                          if (isSelected) {
                            toggleExpandTeacher(teacher.teacher_id);
                          } else {
                            setExpandedTeacher(teacher.teacher_id);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {isSelected ? '✓ Selected' : 'Select'}
                      </button>
                      <button
                        onClick={() => toggleExpandTeacher(teacher.teacher_id)}
                        className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {isExpanded ? 'Hide Slots' : `Show ${teacher.slots.length} Slots`}
                      </button>
                    </div>
                  </div>

                  {/* Available Slots (up to 3) */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        📅 Available Slots for Trial
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {teacher.slots.map((slot, idx) => {
                          const isSlotSelected = selectedSlot?.date === slot.date && 
                                                 selectedSlot?.start_time === slot.start_time;
                          return (
                            <button
                              key={idx}
                              onClick={() => handleSelectSlot(slot)}
                              className={`p-3 rounded-lg border-2 text-left transition ${
                                isSlotSelected
                                  ? 'border-blue-500 bg-blue-100'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className="font-medium text-gray-900">
                                {format(parseISO(slot.date), 'EEE, MMM d')}
                              </div>
                              <div className="text-sm text-gray-600">
                                {slot.start_time} - {slot.end_time}
                              </div>
                              <div className="text-xs text-gray-400">
                                🏠 {slot.room_name}
                              </div>
                              {isSlotSelected && (
                                <div className="mt-1 text-xs text-blue-600 font-medium">✓ Selected</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Slot Summary */}
      {selectedSlot && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-green-800 mb-2">✅ Selected Trial Slot</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-green-600">Teacher:</span>
              <span className="ml-1 font-medium">{selectedSlot.teacher_name}</span>
            </div>
            <div>
              <span className="text-green-600">Date:</span>
              <span className="ml-1 font-medium">{format(parseISO(selectedSlot.date), 'EEE, MMM d, yyyy')}</span>
            </div>
            <div>
              <span className="text-green-600">Time:</span>
              <span className="ml-1 font-medium">{selectedSlot.start_time} - {selectedSlot.end_time}</span>
            </div>
            <div>
              <span className="text-green-600">Room:</span>
              <span className="ml-1 font-medium">{selectedSlot.room_name}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <Link href="/dashboard/classes/trial">
          <button className="px-4 py-2 text-gray-600 hover:text-gray-800">
            ← Back
          </button>
        </Link>
        <button
          onClick={handleConfirm}
          disabled={!selectedSlot}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
        >
          ✅ Confirm Trial Class
        </button>
      </div>
    </div>
  );
}