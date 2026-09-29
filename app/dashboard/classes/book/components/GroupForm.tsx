// app/dashboard/classes/book/components/GroupForm.tsx
// ⭐ v3.11: Trial mode shows a session picker (pick a future session of the group class)
// ⭐ v3.9:  Teacher contact info everywhere
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { BookingData, DAYS_OF_WEEK, TrialSession } from '../types';
import { format, parseISO } from 'date-fns';
import TeacherContactInfo from '@/components/TeacherContactInfo';

interface GroupFormProps {
  data: BookingData;
  onChange: (field: string, value: any) => void;
  onBack: () => void;
  onContinue: () => void;
  isTrial: boolean;
}

interface GroupClass {
  id: string;
  class_name: string;
  course_id: string;
  module_id: string;
  teacher_ids: string[];
  room_id: string;
  total_sessions: number;
  start_date: string;
  end_date: string;
  schedule_days: number[];
  start_time: string;
  end_time: string;
  cycle: string;
  max_students: number;
  current_students: number;
  status: string;
  room_name?: string;
  teacher_names?: string[];
  teacher_contacts?: Array<{
    id: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    teacher_type?: string | null;
  }>;
  course_name?: string;
  module_name?: string;
  available_spots: number;
  future_sessions?: TrialSession[];   // ⭐ v3.11
}

const daysOfWeekLabels = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export default function GroupForm({ data, onChange, onBack, onContinue, isTrial }: GroupFormProps) {
  const [loading, setLoading] = useState(true);
  const [groupClasses, setGroupClasses] = useState<GroupClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ⭐ v3.11: session picker state (trial mode only)
  const [selectedTrialSession, setSelectedTrialSession] = useState<TrialSession | null>(null);

  // ==========================================
  // LOAD GROUP CLASSES (+ FUTURE SESSIONS)
  // ==========================================
  const loadGroupClasses = useCallback(async () => {
    if (!data.course_id) {
      setLoading(false);
      setErrorMessage('Please select a course first.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      let query = supabase
        .from('scheduled_group_classes')
        .select(`
          *,
          rooms:room_id (id, name),
          course:course_id (id, name),
          module:module_id (id, title)
        `)
        .eq('status', 'active')
        .order('start_date');

      query = query.eq('course_id', data.course_id);

      if (data.module_id) {
        query = query.eq('module_id', data.module_id);
      }

      const { data: classes, error } = await query;

      if (error) {
        console.error('❌ Error loading group classes:', error);
        setErrorMessage('Failed to load group classes: ' + error.message);
        setGroupClasses([]);
        setLoading(false);
        return;
      }

      const processedClasses: GroupClass[] = [];

      for (const gc of (classes || [])) {
        const availableSpots = (gc.max_students || 0) - (gc.current_students || 0);
        if (availableSpots <= 0) continue;

        // Teacher contacts
        let teacherContacts: GroupClass['teacher_contacts'] = [];
        if (gc.teacher_ids && gc.teacher_ids.length > 0) {
          const [usersRes, profilesRes] = await Promise.all([
            supabase.from('users').select('id, full_name, email, phone').in('id', gc.teacher_ids).eq('role', 'teacher'),
            supabase.from('teachers').select('id, teacher_type').in('id', gc.teacher_ids),
          ]);
          const profileMap: Record<string, any> = {};
          (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
          teacherContacts = (usersRes.data || []).map((u: any) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            phone: u.phone,
            teacher_type: profileMap[u.id]?.teacher_type || null,
          }));
        }

        // ⭐ v3.11: load future sessions (only for trial mode — cheaper, but we can do it always)
        let futureSessions: TrialSession[] = [];
        if (isTrial) {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          const { data: sessionRows } = await supabase
            .from('group_class_sessions')
            .select('id, session_number, session_date, start_time, end_time, teacher_id, room_id')
            .eq('group_class_id', gc.id)
            .gte('session_date', todayStr)
            .in('status', ['scheduled', 'ongoing'])
            .order('session_date')
            .limit(20);

          const teacherNameMap: Record<string, string> = {};
          teacherContacts?.forEach(t => { teacherNameMap[t.id] = t.full_name; });

          const roomNameMap: Record<string, string> = { [gc.room_id]: gc.rooms?.name || 'TBD' };

          futureSessions = (sessionRows || []).map((s: any) => ({
            id: s.id,
            session_number: s.session_number,
            date: s.session_date,
            start_time: s.start_time,
            end_time: s.end_time,
            teacher_id: s.teacher_id,
            teacher_name: s.teacher_id ? teacherNameMap[s.teacher_id] || null : null,
            room_id: s.room_id || gc.room_id,
            room_name: s.room_id ? roomNameMap[s.room_id] || 'TBD' : gc.rooms?.name || 'TBD',
          }));
        }

        processedClasses.push({
          ...gc,
          room_name: gc.rooms?.name || 'Not Assigned',
          course_name: gc.course?.name || 'Unknown Course',
          module_name: gc.module?.title || 'Unknown Module',
          teacher_names: teacherContacts?.map(t => t.full_name) || [],
          teacher_contacts: teacherContacts,
          available_spots: availableSpots,
          future_sessions: futureSessions,
        });
      }

      setGroupClasses(processedClasses);

      if (processedClasses.length > 0) {
        const stillAvailable = processedClasses.some(gc => gc.id === selectedClassId);
        if (!stillAvailable || !selectedClassId) {
          const firstClass = processedClasses[0];
          setSelectedClassId(firstClass.id);
          selectGroupClass(firstClass);
        }
      } else {
        setErrorMessage('No group classes available with open spots for this course.');
      }

    } catch (error: any) {
      console.error('❌ Error loading group classes:', error);
      setErrorMessage('Error loading group classes: ' + error.message);
      setGroupClasses([]);
    }

    setLoading(false);
  }, [data.course_id, data.module_id, selectedClassId, isTrial]);

  // ==========================================
  // SELECT GROUP CLASS
  // ==========================================
  const selectGroupClass = useCallback((gc: GroupClass) => {
    onChange('selected_group_class_id', gc.id);
    onChange('isGroupClassBooking', true);
    onChange('course_id', gc.course_id);
    onChange('module_id', gc.module_id);
    onChange('teacher_id', gc.teacher_ids?.[0] || null);
    onChange('room_id', gc.room_id);
    onChange('start_date', gc.start_date);
    onChange('start_time', gc.start_time);
    onChange('end_time', gc.end_time);
    onChange('number_of_sessions', gc.total_sessions);
    onChange('group_class_data', gc);

    // ⭐ v3.11: In trial mode, we DON'T generate the full session list for enrollment.
    // We only pass the picked trial_session. Reset any stale selection.
    if (isTrial) {
      onChange('trial_session', undefined);
      setSelectedTrialSession(null);
      onChange('generated_sessions', []);
    } else {
      // Register mode: keep the existing "generate all sessions" behavior for the Confirmation view
      generateSessionsFromGroup(gc);
    }
  }, [onChange, isTrial]);

  // ==========================================
  // GENERATE SESSIONS FROM GROUP CLASS (register mode only)
  // ==========================================
  const generateSessionsFromGroup = useCallback(async (gc: GroupClass) => {
    try {
      const { data: sessions, error } = await supabase
        .from('group_class_sessions')
        .select('*')
        .eq('group_class_id', gc.id)
        .order('session_number');

      if (error) throw error;

      if (sessions && sessions.length > 0) {
        const generatedSessions = sessions.map((s: any) => ({
          session_number: s.session_number,
          date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
          teacher_id: s.teacher_id || gc.teacher_ids?.[0] || '',
          teacher_name: gc.teacher_names?.[0] || 'Assigned',
          room_id: s.room_id || gc.room_id,
          room_name: gc.room_name || 'TBD',
          match_score: 100
        }));
        onChange('generated_sessions', generatedSessions);
        onChange('number_of_sessions', generatedSessions.length);
        onChange('hours_per_session', 2);
      } else {
        const generatedSessions = generateSessionsFromSchedule(gc);
        onChange('generated_sessions', generatedSessions);
      }
    } catch (error) {
      console.error('Error generating sessions from group:', error);
    }
  }, [onChange]);

  const generateSessionsFromSchedule = useCallback((gc: GroupClass) => {
    const sessions = [];
    let currentDate = new Date(gc.start_date);
    const endDate = new Date(gc.end_date);
    let sessionNumber = 1;

    while (currentDate <= endDate && sessionNumber <= gc.total_sessions) {
      const dayOfWeek = currentDate.getDay();
      if (gc.schedule_days?.includes(dayOfWeek)) {
        sessions.push({
          session_number: sessionNumber,
          date: currentDate.toISOString().split('T')[0],
          start_time: gc.start_time,
          end_time: gc.end_time,
          teacher_id: gc.teacher_ids?.[0] || '',
          teacher_name: gc.teacher_names?.[0] || 'Assigned',
          room_id: gc.room_id,
          room_name: gc.room_name || 'TBD',
          match_score: 100
        });
        sessionNumber++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return sessions;
  }, []);

  // ==========================================
  // HANDLE SELECTION
  // ==========================================
  const handleSelectClass = (classId: string) => {
    const selected = groupClasses.find(gc => gc.id === classId);
    if (selected) {
      setSelectedClassId(classId);
      selectGroupClass(selected);
    }
  };

  // ⭐ v3.11: pick a specific trial session
  const handlePickTrialSession = (session: TrialSession) => {
    setSelectedTrialSession(session);

    // Pass to parent state so submitTrialGroupBooking can use it
    onChange('trial_session', session);
    onChange('start_date', session.date);
    onChange('start_time', session.start_time);
    onChange('end_time', session.end_time);
    onChange('teacher_id', session.teacher_id);
    onChange('room_id', session.room_id);

    // Also set a 1-element generated_sessions so Confirmation view can render it
    onChange('generated_sessions', [{
      session_number: session.session_number,
      date: session.date,
      start_time: session.start_time,
      end_time: session.end_time,
      teacher_id: session.teacher_id || '',
      teacher_name: session.teacher_name || 'Assigned',
      room_id: session.room_id || '',
      room_name: session.room_name || 'TBD',
      match_score: 100,
    }]);
  };

  // ==========================================
  // HANDLE CONTINUE
  // ==========================================
  const handleContinue = () => {
    if (!selectedClassId) {
      alert('Please select a group class.');
      return;
    }
    const selected = groupClasses.find(gc => gc.id === selectedClassId);
    if (!selected) { alert('Selected group class not found.'); return; }
    if (selected.available_spots <= 0) { alert('This group class is full. Please select another.'); return; }

    // ⭐ v3.11: Trial mode requires a session pick
    if (isTrial) {
      if (!selectedTrialSession) {
        alert('Please pick a specific group session date for the trial.');
        return;
      }
    } else {
      if (!data.generated_sessions || data.generated_sessions.length === 0) {
        alert('No sessions available for this group class. Please contact support.');
        return;
      }
    }

    onContinue();
  };

  // ==========================================
  // LOAD ON MOUNT
  // ==========================================
  useEffect(() => {
    loadGroupClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.course_id, data.module_id]);

  // ==========================================
  // RENDER: Loading
  // ==========================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">Loading available group classes...</span>
      </div>
    );
  }

  // ==========================================
  // RENDER: No course
  // ==========================================
  if (!data.course_id) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-700">Please select a course first.</p>
        <button onClick={onBack} className="mt-3 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
          ← Back to Course Selection
        </button>
      </div>
    );
  }

  // ==========================================
  // RENDER: No classes
  // ==========================================
  if (groupClasses.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700 font-medium">{errorMessage || 'No group classes available'}</p>
          <p className="text-sm text-yellow-600 mt-1">
            Try adjusting your course/module selection or create a new group class.
          </p>
        </div>
        <div className="flex justify-between pt-4 border-t">
          <button onClick={onBack} className="px-4 py-2 text-gray-600 hover:text-gray-800">← Back</button>
          <button onClick={onContinue} disabled className="px-6 py-2 bg-blue-600 text-white rounded-lg opacity-50">
            Review & Confirm →
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: Main
  // ==========================================
  return (
    <div className="space-y-6">
      <div className={`rounded-lg p-4 border ${isTrial ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
        <p className={`text-sm ${isTrial ? 'text-purple-700' : 'text-blue-700'}`}>
          {isTrial ? '🎯👥 ' : '👥 '}
          <strong>{isTrial ? 'Trial Group Session' : 'Join an existing group class'}</strong>
        </p>
        <p className={`text-xs mt-1 ${isTrial ? 'text-purple-600' : 'text-blue-500'}`}>
          {isTrial
            ? 'Pick a specific future session from a group class that the student will attend as a trial.'
            : 'Select a group class below and the student will be enrolled.'}
        </p>
      </div>

      {/* Group Classes List */}
      <div className="space-y-4 max-h-[28rem] overflow-y-auto">
        {groupClasses.map((gc) => {
          const isSelected = selectedClassId === gc.id;
          const isFull = gc.available_spots <= 0;

          return (
            <div
              key={gc.id}
              onClick={() => !isFull && handleSelectClass(gc.id)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                isSelected ? 'border-blue-500 bg-blue-50'
                : isFull ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900">{gc.class_name || 'Group Class'}</h4>
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">{gc.status}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      isFull ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {isFull ? '❌ Full' : `${gc.available_spots} spot${gc.available_spots !== 1 ? 's' : ''} left`}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div><span className="text-gray-500">Course:</span> <span className="ml-1 font-medium">{gc.course_name}</span></div>
                    <div><span className="text-gray-500">Module:</span> <span className="ml-1 font-medium">{gc.module_name}</span></div>
                    <div><span className="text-gray-500">Schedule:</span> <span className="ml-1 font-medium">{gc.schedule_days?.map(d => daysOfWeekLabels[d]).join(', ')}</span></div>
                    <div><span className="text-gray-500">Time:</span> <span className="ml-1 font-medium">{gc.start_time} - {gc.end_time}</span></div>
                    <div><span className="text-gray-500">Room:</span> <span className="ml-1 font-medium">{gc.room_name}</span></div>
                    <div><span className="text-gray-500">Students:</span> <span className="ml-1 font-medium">{gc.current_students || 0}/{gc.max_students || 0}</span></div>

                    <div className="col-span-2 mt-1">
                      <div className="text-gray-500 mb-1">Teacher(s):</div>
                      {gc.teacher_contacts && gc.teacher_contacts.length > 0 ? (
                        <div className="space-y-1">
                          {gc.teacher_contacts.map(t => (
                            <TeacherContactInfo key={t.id} fullName={t.full_name} phone={t.phone} email={t.email} teacherType={t.teacher_type} compact />
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Not Assigned</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    isSelected ? 'bg-blue-600 text-white' : isFull ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isSelected ? '✓ Selected' : isFull ? 'Full' : 'Select'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ⭐ v3.11: Trial session picker — only when a class is selected and mode is trial */}
      {isTrial && selectedClassId && (() => {
        const selected = groupClasses.find(gc => gc.id === selectedClassId);
        if (!selected) return null;
        const sessions = selected.future_sessions || [];

        return (
          <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50">
            <h4 className="font-semibold text-purple-900 mb-2">
              🎯 Pick the trial session
            </h4>
            <p className="text-xs text-purple-700 mb-3">
              Choose which upcoming session of <strong>{selected.class_name}</strong> the student will attend.
            </p>

            {sessions.length === 0 ? (
              <div className="bg-white border border-purple-200 rounded-lg p-4 text-center text-sm text-purple-700">
                ⚠️ No future sessions available for this group class.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {sessions.map((s) => {
                  const isPicked = selectedTrialSession?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handlePickTrialSession(s)}
                      className={`text-left p-3 rounded-lg border-2 transition ${
                        isPicked
                          ? 'border-purple-500 bg-purple-100'
                          : 'border-purple-200 bg-white hover:border-purple-400'
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        Session #{s.session_number}
                      </div>
                      <div className="text-sm text-gray-700">
                        {format(parseISO(s.date), 'EEE, MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-gray-500">
                        🕐 {s.start_time} - {s.end_time}
                      </div>
                      {s.room_name && (
                        <div className="text-xs text-gray-500">🏠 {s.room_name}</div>
                      )}
                      {s.teacher_name && (
                        <div className="text-xs text-gray-500">👨‍🏫 {s.teacher_name}</div>
                      )}
                      {isPicked && (
                        <div className="mt-1 text-xs text-purple-700 font-semibold">✓ Selected</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Register mode summary (unchanged) */}
      {!isTrial && selectedClassId && (() => {
        const selected = groupClasses.find(gc => gc.id === selectedClassId);
        if (!selected) return null;
        return (
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h4 className="font-medium text-green-800 mb-2">📋 Selected Group Class</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Class:</span> <span className="ml-2 font-medium">{selected.class_name}</span></div>
              <div><span className="text-gray-500">Room:</span> <span className="ml-2 font-medium">{selected.room_name}</span></div>
              <div className="col-span-2">
                <div className="text-gray-500 mb-1">Teacher(s):</div>
                {selected.teacher_contacts?.map(t => (
                  <TeacherContactInfo key={t.id} fullName={t.full_name} phone={t.phone} email={t.email} teacherType={t.teacher_type} compact />
                ))}
              </div>
              <div><span className="text-gray-500">Sessions:</span> <span className="ml-2 font-medium">{selected.total_sessions}</span></div>
              <div><span className="text-gray-500">Schedule:</span> <span className="ml-2 font-medium">{selected.schedule_days?.map(d => daysOfWeekLabels[d]).join(', ')}</span></div>
              <div><span className="text-gray-500">Time:</span> <span className="ml-2 font-medium">{selected.start_time} - {selected.end_time}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Duration:</span> <span className="ml-2 font-medium">{selected.start_date} - {selected.end_date}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Status:</span> <span className="ml-2 font-medium text-green-600">✅ Ready for enrollment</span></div>
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button onClick={onBack} className="px-4 py-2 text-gray-600 hover:text-gray-800">← Back</button>
        <button
          onClick={handleContinue}
          disabled={!selectedClassId || (isTrial && !selectedTrialSession)}
          className={`px-6 py-2 text-white rounded-lg transition disabled:opacity-50 ${
            isTrial ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          Review & Confirm →
        </button>
      </div>
    </div>
  );
}