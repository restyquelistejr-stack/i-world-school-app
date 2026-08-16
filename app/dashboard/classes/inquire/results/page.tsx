'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, addDays, differenceInDays, startOfDay, isWithinInterval, differenceInCalendarDays } from 'date-fns';

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [foundOptions, setFoundOptions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

  const courseId = searchParams.get('courseId');
  const selectedLevel = searchParams.get('selectedLevel') || '';
  const packageId = searchParams.get('packageId');
  const maxStudents = parseInt(searchParams.get('maxStudents') || '1');
  const startDateStr = searchParams.get('startDate') || '';
  const duration = parseInt(searchParams.get('duration') || '30');
  const availabilities = JSON.parse(searchParams.get('availabilities') || '[]');
  const standardSessions = parseInt(searchParams.get('standardSessions') || '20');
  
  const hoursPerSession = parseFloat(searchParams.get('hoursPerSession') || '2');
  const totalSessions = parseInt(searchParams.get('totalSessions') || '20');
  const totalHours = parseFloat(searchParams.get('totalHours') || '40');
  const isFlexibleMode = searchParams.get('isFlexibleMode') === 'true';

  const getPossibleTimeSlots = (prefStart: string, prefEnd: string) => {
    const slots = [];
    const [startHour, startMinute] = prefStart.split(':').map(Number);
    const [endHour, endMinute] = prefEnd.split(':').map(Number);
    
    let currentHour = Math.max(startHour, 9);
    let currentMinute = 0;
    
    if (startMinute > 0) {
      currentMinute = startMinute;
    }
    
    while (currentHour + hoursPerSession <= Math.min(endHour, 22)) {
      const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      const endHour2 = currentHour + hoursPerSession;
      const endTime = `${String(Math.floor(endHour2)).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      slots.push({ start_time: startTime, end_time: endTime });
      
      currentHour += hoursPerSession;
    }
    return slots;
  };

  const getPackageName = () => {
    if (!packageId) {
      return `Standard (${standardSessions} sessions)`;
    }
    return `Selected Package`;
  };

  useEffect(() => {
    if (courseId) runSearch();
  }, [searchParams]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    
    try {
      if (!courseId) {
        setError('No course selected');
        setLoading(false);
        return;
      }

      const startWindow = startOfDay(new Date(startDateStr));
      const endWindow = addDays(startWindow, duration);

      const [
        staffCoursesRes,
        roomsRes,
        bookingsRes,
        optionsRes,
        leavesRes,
        courseRes,
        availabilityRes
      ] = await Promise.all([
        supabase.from('staff_courses').select('staff_id').eq('course_id', courseId),
        supabase.from('rooms').select('*').eq('is_active', true).gte('capacity', maxStudents).order('capacity'),
        supabase.from('bookings').select('room_id, teacher_id, start_time, end_time'),
        supabase.from('class_options').select('room_id, teacher_id, start_time, end_time, class_id'),
        supabase.from('staff_leaves').select('*').eq('is_active', true),
        supabase.from('courses').select('duration_hours').eq('id', courseId).single(),
        supabase.from('teacher_availability').select('*'),
      ]);

      if (staffCoursesRes.error || roomsRes.error || bookingsRes.error || optionsRes.error || leavesRes.error) {
        setError('Failed to fetch required data');
        setLoading(false);
        return;
      }

      const staffCourses = staffCoursesRes.data || [];
      const rooms = roomsRes.data || [];
      const allBookings = bookingsRes.data || [];
      const allOptions = optionsRes.data || [];
      const allLeaves = leavesRes.data || [];
      const course = courseRes.data;
      const teacherAvailability = availabilityRes.data || [];

      if (!staffCourses.length) { 
        setError('No teachers are qualified to teach this course');
        setLoading(false); 
        return; 
      }

      const eligibleIds = staffCourses.map((s: any) => s.staff_id);
      const { data: teachers } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'teacher')
        .in('id', eligibleIds);

      if (!teachers || !teachers.length) { 
        setError('No teachers found for this course');
        setLoading(false); 
        return; 
      }

      let options: any[] = [];

      for (const teacher of teachers) {
        const teacherLeaves = allLeaves.filter((l: any) => l.staff_id === teacher.id);
        const teacherAvail = teacherAvailability.filter((a: any) => a.teacher_id === teacher.id);
        
        if (!teacherAvail.length) continue;

        let allPossibleSlots: any[] = [];

        for (let dayOffset = 0; dayOffset < duration; dayOffset++) {
          const currentDate = addDays(startWindow, dayOffset);
          const dayOfWeek = currentDate.getDay();
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          
          const pref = availabilities.find((a: any) => a.day_of_week === dayOfWeek);
          if (!pref) continue;

          const onLeave = teacherLeaves.some((l: any) => {
            const leaveStart = new Date(l.start_date);
            const leaveEnd = new Date(l.end_date);
            return isWithinInterval(currentDate, { start: leaveStart, end: leaveEnd });
          });
          if (onLeave) continue;

          const dayAvailability = teacherAvail.find((a: any) => a.day_of_week === dayOfWeek);
          if (!dayAvailability) continue;

          const prefStart = pref.start_time;
          const prefEnd = pref.end_time;
          const teacherStart = dayAvailability.start_time;
          const teacherEnd = dayAvailability.end_time;
          
          const actualStart = prefStart > teacherStart ? prefStart : teacherStart;
          const actualEnd = prefEnd < teacherEnd ? prefEnd : teacherEnd;

          const possibleSlots = getPossibleTimeSlots(actualStart, actualEnd);

          for (const slot of possibleSlots) {
            const fullStartStr = `${dateStr} ${slot.start_time}`;
            const fullEndStr = `${dateStr} ${slot.end_time}`;

            const teacherConflict = 
              allBookings.some((b: any) => 
                b.teacher_id === teacher.id && 
                b.start_time === fullStartStr
              ) ||
              allOptions.some((o: any) => 
                o.teacher_id === teacher.id && 
                o.start_time === fullStartStr
              );

            if (teacherConflict) continue;

            let foundRoom = null;
            for (const room of rooms) {
              const roomConflict = 
                allBookings.some((b: any) => 
                  b.room_id === room.id && 
                  b.start_time === fullStartStr
                ) ||
                allOptions.some((o: any) => 
                  o.room_id === room.id && 
                  o.start_time === fullStartStr
                );
              
              if (!roomConflict) {
                foundRoom = room;
                break;
              }
            }

            if (foundRoom) {
              allPossibleSlots.push({
                date: currentDate,
                dateStr,
                startStr: fullStartStr,
                endStr: fullEndStr,
                startTime: slot.start_time,
                endTime: slot.end_time,
                room: foundRoom
              });
            }
          }
        }

        if (allPossibleSlots.length >= totalSessions) {
          allPossibleSlots.sort((a, b) => {
            const dateCompare = a.date.getTime() - b.date.getTime();
            if (dateCompare !== 0) return dateCompare;
            return a.startTime.localeCompare(b.startTime);
          });

          const selectedSlots = [];
          let lastSelectedDate = null;
          let lastSelectedTime = null;
          
          const slotsPerDay: Record<string, number> = {};

          for (const slot of allPossibleSlots) {
            if (selectedSlots.length >= totalSessions) break;

            if (slotsPerDay[slot.dateStr] && slotsPerDay[slot.dateStr] >= 1) {
              continue;
            }

            if (lastSelectedDate && lastSelectedDate === slot.dateStr) {
              continue;
            }

            selectedSlots.push(slot);
            
            if (!slotsPerDay[slot.dateStr]) {
              slotsPerDay[slot.dateStr] = 0;
            }
            slotsPerDay[slot.dateStr] += 1;

            lastSelectedDate = slot.dateStr;
            lastSelectedTime = slot.startTime;
          }

          if (selectedSlots.length >= totalSessions) {
            const first = selectedSlots[0];
            const last = selectedSlots[totalSessions - 1];
            const score = differenceInDays(last.date, first.date);

            options.push({
              teacher_id: teacher.id,
              teacher_name: teacher.full_name,
              room_id: selectedSlots[0].room.id,
              room_name: selectedSlots[0].room.name,
              start_date: format(first.date, 'MMM d, yyyy'),
              end_date: format(last.date, 'MMM d, yyyy'),
              completion_score: score,
              sessions_found: selectedSlots.length,
              total_sessions_needed: totalSessions,
              hours_per_session: hoursPerSession,
              total_hours: totalHours,
              slots: selectedSlots.map((s: any) => ({
                start_time: s.startStr,
                end_time: s.endStr,
                room_name: s.room.name,
                room_id: s.room.id,
                date: s.dateStr,
                time: s.startTime
              })),
              daily_schedule: selectedSlots.reduce((acc: any, s: any) => {
                if (!acc[s.dateStr]) {
                  acc[s.dateStr] = [];
                }
                acc[s.dateStr].push(s.startTime);
                return acc;
              }, {})
            });
          }
        }
      }

      options.sort((a, b) => a.completion_score - b.completion_score);
      setFoundOptions(options);

    } catch (error) {
      console.error('Search error:', error);
      setError('An error occurred while searching for resources');
    }
    setLoading(false);
  }

  async function handleSaveAsDraft() {
    try {
      const { data: newClass, error } = await supabase
        .from('classes')
        .insert({
          course_id: courseId,
          level: selectedLevel,
          package_id: packageId || null,
          package_name: getPackageName(),
          max_students: maxStudents,
          total_sessions: totalSessions,
          hours_per_session: hoursPerSession,
          requested_start_date: startDateStr,
          requested_duration_days: duration,
          status: 'draft', 
        })
        .select()
        .single();

      if (error || !newClass) {
        alert('Failed to create draft: ' + error?.message);
        return;
      }

      const availInserts = availabilities.map((a: any) => ({
        class_id: newClass.id,
        day_of_week: a.day_of_week,
        start_time: a.start_time,
        end_time: a.end_time,
      }));
      await supabase.from('inquiry_availability').insert(availInserts);

      router.push('/dashboard/classes/management');
    } catch (err: any) {
      alert('Error saving draft: ' + err.message);
    }
  }

  async function handleSaveAsSelected(teacherId: string) {
    try {
      const selectedOption = foundOptions.find(o => o.teacher_id === teacherId);
      if (!selectedOption) {
        alert('Selected option not found.');
        return;
      }

      const [bookingsCheck, optionsCheck] = await Promise.all([
        supabase.from('bookings').select('*'),
        supabase.from('class_options').select('*'),
      ]);

      const allBookings = bookingsCheck.data || [];
      const allOptions = optionsCheck.data || [];

      for (const slot of selectedOption.slots) {
        const teacherConflict = allBookings.some((b: any) => 
          b.teacher_id === teacherId && b.start_time === slot.start_time
        ) || allOptions.some((o: any) => 
          o.teacher_id === teacherId && o.start_time === slot.start_time
        );

        if (teacherConflict) {
          alert('Teacher availability has changed for session at ' + slot.start_time + '. Please search again.');
          return;
        }

        const roomConflict = allBookings.some((b: any) => 
          b.room_id === slot.room_id && b.start_time === slot.start_time
        ) || allOptions.some((o: any) => 
          o.room_id === slot.room_id && o.start_time === slot.start_time
        );

        if (roomConflict) {
          alert('Room availability has changed for session at ' + slot.start_time + '. Please search again.');
          return;
        }
      }

      const classData = {
        course_id: courseId,
        teacher_id: teacherId,
        room_id: selectedOption.room_id,
        max_students: maxStudents,
        total_sessions: selectedOption.total_sessions_needed,
        hours_per_session: selectedOption.hours_per_session,
        selected_level: selectedLevel,
        package_id: packageId || null,
        package_name: getPackageName(),
        requested_start_date: startDateStr,
        requested_duration_days: duration,
        status: 'pending_admin',
      };

      const { data: newClass, error } = await supabase
        .from('classes')
        .insert(classData)
        .select()
        .single();

      if (error || !newClass) {
        console.error('Supabase Error:', error);
        alert('Failed to create class: ' + error?.message || 'Unknown error');
        return;
      }

      const optionsInserts = selectedOption.slots.map((s: any, idx: number) => ({
        class_id: newClass.id,
        teacher_id: teacherId,
        room_id: s.room_id,
        session_index: idx + 1,
        start_time: s.start_time,
        end_time: s.end_time,
        completion_score: selectedOption.completion_score,
        is_selected: true,
      }));

      await supabase.from('class_options').insert(optionsInserts);
      
      const availInserts = availabilities.map((a: any) => ({
        class_id: newClass.id,
        day_of_week: a.day_of_week,
        start_time: a.start_time,
        end_time: a.end_time,
      }));
      await supabase.from('inquiry_availability').insert(availInserts);

      router.push('/dashboard/classes/management');

    } catch (err: any) {
      alert('Critical Error: ' + err.message);
    }
  }

  const goBack = () => {
    router.push('/dashboard/classes/inquire');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">📊 Available Teachers and Rooms</h1>
          <button onClick={goBack} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">← Back to Edit</button>
        </div>
        <div className="p-8 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900">📊 Available Teachers and Rooms By Score</h1>
        <div className="flex gap-2">
          <button onClick={goBack} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">← Back to Edit</button>
          <button onClick={handleSaveAsDraft} className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">💾 Save as Draft</button>
        </div>
      </div>

      {/* Session Config */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm flex flex-wrap gap-4 text-blue-800">
        <span><span className="font-medium">Session Configuration:</span> {totalSessions} sessions × {hoursPerSession}h = {totalHours}h total</span>
        <span className="text-blue-400">|</span>
        <span>Package: <span className="font-medium">{getPackageName()}</span></span>
        {selectedLevel && (
          <>
            <span className="text-blue-400">|</span>
            <span>Level: <span className="font-medium">{selectedLevel}</span></span>
          </>
        )}
      </div>

      {foundOptions.length === 0 ? (
        <div className="p-8 text-center border border-dashed rounded bg-gray-50 text-gray-500">
          No teachers found matching your criteria. Try adjusting your preferences.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-2">
            Found <span className="font-medium text-gray-800">{foundOptions.length}</span> options. 
            Best score: <span className="font-medium text-gray-800">{foundOptions[0]?.completion_score || 0} days</span>
          </p>
          
          {foundOptions.map((teacher, idx) => {
            const daysToComplete = Math.ceil(differenceInCalendarDays(new Date(teacher.end_date), new Date()));
            const isExpanded = expandedTeacherId === teacher.teacher_id;

            return (
              <div 
                key={teacher.teacher_id} 
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  
                  {/* Left Side: Teacher Info */}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full tracking-wide">
                        Score #{idx + 1}
                      </span>
                      <span className="text-sm text-gray-500">
                        {teacher.sessions_found}/{teacher.total_sessions_needed} Sessions
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{teacher.teacher_name}</h3>
                  </div>

                  {/* Center: Dates */}
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 uppercase tracking-wider">Start</span>
                      <span className="font-medium text-gray-700">{teacher.start_date}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 uppercase tracking-wider">End</span>
                      <span className="font-medium text-gray-700">{teacher.end_date}</span>
                    </div>
                  </div>

                  {/* Right Side: Days Badge & Action */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-3xl font-bold text-blue-600 leading-none">{daysToComplete}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Days to Complete</span>
                    </div>
                    <button 
                      onClick={() => handleSaveAsSelected(teacher.teacher_id)}
                      className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
                    >
                      Select This
                    </button>
                  </div>
                </div>

                {/* Toggle Section */}
                <div className="border-t border-gray-100">
                  <button 
                    onClick={() => setExpandedTeacherId(isExpanded ? null : teacher.teacher_id)}
                    className="w-full px-5 py-2.5 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50/50 transition flex items-center gap-2"
                  >
                    {isExpanded ? (
                      <span className="flex items-center gap-2">▲ Hide Schedule Details</span>
                    ) : (
                      <span className="flex items-center gap-2">▼ View Schedule Details</span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 overflow-x-auto">
                      <table className="w-full text-sm border-collapse mt-1">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] leading-tight">
                            <th className="py-2 px-3 text-left font-semibold">Session</th>
                            <th className="py-2 px-3 text-left font-semibold">Date</th>
                            <th className="py-2 px-3 text-left font-semibold">Start</th>
                            <th className="py-2 px-3 text-left font-semibold">End</th>
                            <th className="py-2 px-3 text-left font-semibold">Room</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-600">
                          {teacher.slots.map((s: any, i: number) => (
                            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                              <td className="py-2 px-3 text-left font-medium text-gray-800">{i + 1}</td>
                              <td className="py-2 px-3 text-left">{s.date}</td>
                              <td className="py-2 px-3 text-left">{s.start_time}</td>
                              <td className="py-2 px-3 text-left">{s.end_time}</td>
                              <td className="py-2 px-3 text-left">
                                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                  {s.room_name}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}