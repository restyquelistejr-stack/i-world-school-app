// app/dashboard/classes/group-class/create/page.tsx
// ⭐ v3.9: Teacher contact info visible everywhere
// ⭐ v3.14b: Creates teacher attendance rows for each generated session
'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, parseISO, differenceInDays } from 'date-fns';
import { formatLocalDate } from '@/lib/timeUtils';

import ConflictResolutionModal, {
  type ConflictResolutionChoice,
  type ConflictSessionInfo,
} from '@/components/ConflictResolutionModal';
import TeacherContactInfo from '@/components/TeacherContactInfo';
import {
  createBulkSubstituteAssignments,
  flagSessionNeedsAttention,
  type SubstituteAssignmentInput,
} from '@/lib/substituteService';
import {
  detectAllConflicts,
  splitConflicts,
  buildConflictInfoList,
  type RawConflict,
} from '@/lib/conflictDetectionService';
import { createAttendanceForGroupSession } from '@/lib/attendanceService';

interface Course { id: string; name: string; }
interface Module { id: string; title: string; level: string; total_sessions: number; }
interface Teacher {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  teacher_type?: string;
  qualification_source?: 'module' | 'course';
}
interface Room { id: string; name: string; capacity: number; }

type SchedulingMode = 'by_count' | 'by_range';

export default function CreateGroupClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [qualifiedTeachers, setQualifiedTeachers] = useState<Teacher[]>([]);
  const [qualificationSource, setQualificationSource] = useState<'module' | 'course' | 'none'>('none');

  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>('by_count');

  const [formData, setFormData] = useState({
    class_name: '',
    total_sessions: 24,
    start_date: '',
    end_date: '',
    schedule_days: [] as number[],
    start_time: '09:00',
    end_time: '11:00',
    cycle: 'January' as 'January' | 'July',
    max_students: 20,
  });

  const [generatedSessions, setGeneratedSessions] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ConflictSessionInfo[]>([]);
  const [rawConflicts, setRawConflicts] = useState<RawConflict[]>([]);

  const daysOfWeek = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
  ];

  const cycles = [
    { value: 'January', label: 'January Cycle (Jan - Jun)' },
    { value: 'July', label: 'July Cycle (Jul - Dec)' },
  ];

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [coursesRes, roomsRes] = await Promise.all([
      supabase.from('courses').select('id, name').eq('is_active', true).order('name'),
      supabase.from('rooms').select('id, name, capacity').eq('is_active', true).order('name'),
    ]);
    if (!coursesRes.error) setCourses(coursesRes.data || []);
    if (!roomsRes.error) setRooms(roomsRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!selectedCourseId) {
      setModules([]);
      setSelectedModuleId('');
      return;
    }
    loadModules();
  }, [selectedCourseId]);

  async function loadModules() {
    const { data } = await supabase
      .from('course_modules')
      .select('id, title, level, total_sessions')
      .eq('course_id', selectedCourseId)
      .order('module_order');
    setModules(data || []);
  }

  useEffect(() => {
    if (!selectedCourseId || !selectedModuleId) {
      setQualifiedTeachers([]);
      setQualificationSource('none');
      setSelectedTeacherIds([]);
      return;
    }
    loadQualifiedTeachers();
  }, [selectedCourseId, selectedModuleId]);

  async function loadQualifiedTeachers() {
    setLoadingTeachers(true);
    setQualifiedTeachers([]);
    setSelectedTeacherIds([]);

    try {
      let teacherIds: string[] = [];
      let source: 'module' | 'course' | 'none' = 'none';

      const { data: moduleTeachers } = await supabase
        .from('teacher_modules')
        .select('teacher_id')
        .eq('module_id', selectedModuleId)
        .eq('is_active', true);

      if (moduleTeachers && moduleTeachers.length > 0) {
        teacherIds = moduleTeachers.map(t => t.teacher_id);
        source = 'module';
      } else {
        const { data: courseTeachers } = await supabase
          .from('staff_courses')
          .select('staff_id')
          .eq('course_id', selectedCourseId)
          .eq('is_active', true);

        if (courseTeachers && courseTeachers.length > 0) {
          teacherIds = courseTeachers.map(t => t.staff_id);
          source = 'course';
        }
      }

      if (teacherIds.length > 0) {
        const [usersRes, profilesRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, full_name, email, phone')
            .in('id', teacherIds)
            .eq('role', 'teacher')
            .eq('is_active', true)
            .order('full_name'),
          supabase
            .from('teachers')
            .select('id, teacher_type')
            .in('id', teacherIds),
        ]);

        const profileMap: Record<string, any> = {};
        (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });

        const enriched: Teacher[] = (usersRes.data || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email || undefined,
          phone: u.phone || undefined,
          teacher_type: profileMap[u.id]?.teacher_type || undefined,
        }));

        setQualifiedTeachers(enriched);
        setQualificationSource(source);
      } else {
        setQualifiedTeachers([]);
        setQualificationSource('none');
      }
    } catch (err) {
      console.error('Exception in loadQualifiedTeachers:', err);
      setQualifiedTeachers([]);
      setQualificationSource('none');
    }

    setLoadingTeachers(false);
  }

  useEffect(() => {
    if (selectedModuleId) {
      const module = modules.find(m => m.id === selectedModuleId);
      if (module?.total_sessions) {
        setFormData(prev => ({ ...prev, total_sessions: module.total_sessions || 24 }));
      }
    }
  }, [selectedModuleId, modules]);

  const countSessionsInRange = (
    startDateStr: string,
    endDateStr: string,
    scheduleDays: number[]
  ): number => {
    if (!startDateStr || !endDateStr || scheduleDays.length === 0) return 0;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (start > end) return 0;
    const totalDays = differenceInDays(end, start);
    if (totalDays > 1095) return 0;
    let count = 0;
    let current = new Date(start);
    while (current <= end) {
      if (scheduleDays.includes(current.getDay())) count++;
      current = addDays(current, 1);
    }
    return count;
  };

  const computeEndDate = (
    startDateStr: string,
    targetCount: number,
    scheduleDays: number[]
  ): string | null => {
    if (!startDateStr || targetCount < 1 || scheduleDays.length === 0) return null;
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return null;
    const maxScanDays = 365 * 5;
    let count = 0;
    let current = new Date(start);
    for (let i = 0; i < maxScanDays; i++) {
      if (scheduleDays.includes(current.getDay())) {
        count++;
        if (count === targetCount) return formatLocalDate(current);
      }
      current = addDays(current, 1);
    }
    return null;
  };

  const derivedEndDate = useMemo(() => {
    if (schedulingMode !== 'by_count') return null;
    return computeEndDate(formData.start_date, formData.total_sessions, formData.schedule_days);
  }, [schedulingMode, formData.start_date, formData.total_sessions, formData.schedule_days]);

  const derivedSessionCount = useMemo(() => {
    if (schedulingMode !== 'by_range') return 0;
    return countSessionsInRange(formData.start_date, formData.end_date, formData.schedule_days);
  }, [schedulingMode, formData.start_date, formData.end_date, formData.schedule_days]);

  const expectedSessionCount = useMemo(() => {
    if (!selectedModuleId) return null;
    const module = modules.find(m => m.id === selectedModuleId);
    return module?.total_sessions || null;
  }, [selectedModuleId, modules]);

  const rangeCountMismatch =
    schedulingMode === 'by_range' &&
    expectedSessionCount !== null &&
    derivedSessionCount > 0 &&
    derivedSessionCount !== expectedSessionCount;

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(day)
        ? prev.schedule_days.filter(d => d !== day)
        : [...prev.schedule_days, day]
    }));
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeacherIds(prev =>
      prev.includes(teacherId)
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const generateSessions = () => {
    if (!formData.start_date) { alert('Please select a start date.'); return; }
    if (formData.schedule_days.length === 0) { alert('Please select at least one schedule day.'); return; }

    let sessions: any[] = [];
    let sessionNumber = 1;

    if (schedulingMode === 'by_count') {
      const start = new Date(formData.start_date);
      const maxScanDays = 365 * 5;
      for (let i = 0; i < maxScanDays && sessionNumber <= formData.total_sessions; i++) {
        const current = addDays(start, i);
        if (formData.schedule_days.includes(current.getDay())) {
          sessions.push({
            session_number: sessionNumber,
            session_date: formatLocalDate(current),
            start_time: formData.start_time,
            end_time: formData.end_time,
            room_id: selectedRoomId || null,
          });
          sessionNumber++;
        }
      }
      if (sessions.length < formData.total_sessions) {
        alert(`⚠️ Could not fit ${formData.total_sessions} sessions.`);
        return;
      }
    } else {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      if (start > end) { alert('Start date must be before end date.'); return; }
      let current = new Date(start);
      while (current <= end) {
        if (formData.schedule_days.includes(current.getDay())) {
          sessions.push({
            session_number: sessionNumber,
            session_date: formatLocalDate(current),
            start_time: formData.start_time,
            end_time: formData.end_time,
            room_id: selectedRoomId || null,
          });
          sessionNumber++;
        }
        current = addDays(current, 1);
      }
      if (sessions.length === 0) {
        alert('⚠️ No sessions match your selected days within the date range.');
        return;
      }
    }

    setGeneratedSessions(sessions);
    setShowPreview(true);
  };

  async function handleSubmit() {
    if (!selectedCourseId) { alert('Please select a course.'); return; }
    if (!selectedModuleId) { alert('Please select a module.'); return; }
    if (selectedTeacherIds.length === 0) { alert('Please select at least one teacher.'); return; }
    if (!selectedRoomId) { alert('Please select a room.'); return; }
    if (!formData.start_date) { alert('Please select a start date.'); return; }
    if (formData.schedule_days.length === 0) { alert('Please select at least one schedule day.'); return; }
    if (schedulingMode === 'by_range' && !formData.end_date) { alert('Please select an end date.'); return; }
    if (generatedSessions.length === 0) { alert('Please generate a schedule first.'); return; }

    setSubmitting(true);
    setCheckingConflicts(true);

    try {
      const teacherNamesById: Record<string, string> = {};
      selectedTeacherIds.forEach(id => {
        const t = qualifiedTeachers.find(x => x.id === id);
        if (t) teacherNamesById[id] = t.full_name;
      });

      const allConflicts = await detectAllConflicts({
        sessions: generatedSessions.map(s => ({
          session_number: s.session_number,
          session_date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
          room_id: s.room_id || selectedRoomId,
        })),
        teacherIds: selectedTeacherIds,
        roomId: selectedRoomId,
        teacherNamesById,
        roomConflictMode: 'full',
      });

      setCheckingConflicts(false);
      setRawConflicts(allConflicts);

      const { teacherConflicts, roomConflicts } = splitConflicts(allConflicts);

      if (teacherConflicts.length > 0) {
        const teacherList = buildConflictInfoList(teacherConflicts).map(info => {
          const t = qualifiedTeachers.find(x => x.full_name === info.teacherName);
          return {
            ...info,
            teacherPhone: t?.phone || undefined,
            teacherEmail: t?.email || undefined,
            teacherType: t?.teacher_type || undefined,
          };
        });
        const roomList = buildConflictInfoList(roomConflicts);
        setDetectedConflicts([...teacherList, ...roomList]);
        setShowConflictModal(true);
        setSubmitting(false);
        return;
      }

      if (roomConflicts.length > 0) {
        await finalizeCreate('create_as_is', buildConflictInfoList(roomConflicts), allConflicts);
        return;
      }

      await finalizeCreate('create_as_is', [], []);
    } catch (err: any) {
      alert('Error: ' + err.message);
      setSubmitting(false);
      setCheckingConflicts(false);
    }
  }

  async function finalizeCreate(
    choice: ConflictResolutionChoice,
    _conflicts: ConflictSessionInfo[],
    raw: RawConflict[] = []
  ) {
    setSubmitting(true);

    try {
      const teacherConflictNumbers = new Set(
        raw.filter(c => c.source === 'teacher').map(c => c.session.session_number)
      );
      const roomConflictNumbers = new Set(
        raw.filter(c => c.source === 'room').map(c => c.session.session_number)
      );

      const sessionsToCreate =
        choice === 'skip_conflicting'
          ? generatedSessions.filter(s => !teacherConflictNumbers.has(s.session_number))
          : generatedSessions;

      if (sessionsToCreate.length === 0) {
        alert('⚠️ Cannot create class — all sessions were conflicting.');
        setSubmitting(false);
        setShowConflictModal(false);
        return;
      }

      const finalEndDate = schedulingMode === 'by_count'
        ? (derivedEndDate || formData.end_date)
        : formData.end_date;

      const { data: groupClass, error: gcError } = await supabase
        .from('scheduled_group_classes')
        .insert({
          course_id: selectedCourseId,
          module_id: selectedModuleId,
          teacher_ids: selectedTeacherIds,
          room_id: selectedRoomId,
          class_name: formData.class_name || `${courses.find(c => c.id === selectedCourseId)?.name} - Group`,
          total_sessions: sessionsToCreate.length,
          start_date: formData.start_date,
          end_date: finalEndDate,
          schedule_days: formData.schedule_days,
          start_time: formData.start_time,
          end_time: formData.end_time,
          cycle: formData.cycle,
          max_students: formData.max_students,
          current_students: 0,
          status: 'active',
        })
        .select()
        .single();

      if (gcError) throw new Error('Failed to create group class: ' + gcError.message);

      const sessionsToInsert = sessionsToCreate.map((s, index) => {
        const teacherId = selectedTeacherIds[index % selectedTeacherIds.length];
        const isRoomFlagged = roomConflictNumbers.has(s.session_number);

        return {
          group_class_id: groupClass.id,
          session_number: s.session_number,
          session_date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
          room_id: isRoomFlagged ? null : (s.room_id || selectedRoomId),
          teacher_id: teacherId,
          status: 'scheduled',
          needs_attention: isRoomFlagged,
          attention_reason: isRoomFlagged ? 'room_unassigned' : null,
        };
      });

      const { data: insertedSessions, error: sessionsError } = await supabase
        .from('group_class_sessions')
        .insert(sessionsToInsert)
        .select();

      if (sessionsError) {
        await supabase.from('scheduled_group_classes').delete().eq('id', groupClass.id);
        throw new Error('Failed to generate sessions: ' + sessionsError.message);
      }

      // ⭐ v3.14b: create attendance rows for each session's teacher
      for (const s of insertedSessions || []) {
        await createAttendanceForGroupSession(s.id, s.teacher_id);
      }

      if (choice === 'create_as_is' && teacherConflictNumbers.size > 0) {
        const sessionNumberToId: Record<number, string> = {};
        (insertedSessions || []).forEach((row: any) => {
          sessionNumberToId[row.session_number] = row.id;
        });

        const substituteInputs: SubstituteAssignmentInput[] = [];
        const flagPromises: Promise<any>[] = [];

        for (const c of raw.filter(x => x.source === 'teacher')) {
          const sessionId = sessionNumberToId[c.session.session_number];
          if (!sessionId) continue;

          flagPromises.push(
            flagSessionNeedsAttention('group_class_sessions', sessionId, c.conflictType)
          );

          substituteInputs.push({
            session_type: 'group_session',
            session_id: sessionId,
            original_teacher_id: c.teacherId || null,
            leave_reason: c.conflictType === 'teacher_leave' ? 'leave' : null,
            class_id: groupClass.id,
            course_id: selectedCourseId,
            module_id: selectedModuleId,
            room_id: selectedRoomId,
            session_date: c.session.session_date,
            start_time: c.session.start_time,
            end_time: c.session.end_time,
          });
        }

        await Promise.all(flagPromises);
        await createBulkSubstituteAssignments(substituteInputs);
      }

      setShowConflictModal(false);
      setRawConflicts([]);

      const skipped = choice === 'skip_conflicting' ? teacherConflictNumbers.size : 0;
      const teacherFlagged = choice === 'create_as_is' ? teacherConflictNumbers.size : 0;
      const roomFlagged = roomConflictNumbers.size;

      let msg = `✅ Group class created with ${sessionsToCreate.length} sessions.`;
      if (skipped > 0) msg += `\n\n${skipped} conflicting session(s) skipped.`;
      if (teacherFlagged > 0) msg += `\n\n⚠️ ${teacherFlagged} session(s) flagged for substitute.`;
      if (roomFlagged > 0) msg += `\n\n🏫 ${roomFlagged} session(s) flagged for room assignment.`;
      alert(msg);

      router.push(`/dashboard/classes/group-class/view?id=${groupClass.id}`);

    } catch (err: any) {
      alert('Error: ' + err.message);
      setSubmitting(false);
    }
  }

  const getDuration = (startTime: string, endTime: string) => {
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    const diff = (end[0] - start[0]) * 60 + (end[1] - start[1]);
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours}h ${mins > 0 ? mins + 'm' : ''}`;
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
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">👥 Register Group Class</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">
        {/* Course & Module */}
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
          </div>
        </div>

        {/* Class Name & Cycle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Class Name</label>
            <input
              type="text"
              value={formData.class_name}
              onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              placeholder="e.g., Business English Group - Jan 2026"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cycle *</label>
            <select
              value={formData.cycle}
              onChange={(e) => setFormData({ ...formData, cycle: e.target.value as 'January' | 'July' })}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              {cycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Teachers & Room */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Teachers *
              <span className="text-gray-400 font-normal ml-1">(Select one or more)</span>
            </label>

            {!selectedModuleId && (
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center">
                <p className="text-sm text-gray-500">📚 Select a course and module first to see qualified teachers</p>
              </div>
            )}

            {selectedModuleId && loadingTeachers && (
              <div className="p-4 border rounded-lg bg-gray-50 flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                <span className="text-sm text-gray-500">Loading qualified teachers...</span>
              </div>
            )}

            {selectedModuleId && !loadingTeachers && qualifiedTeachers.length === 0 && (
              <div className="p-4 border-2 border-yellow-300 rounded-lg bg-yellow-50">
                <p className="text-sm text-yellow-800 font-medium mb-1">⚠️ No qualified teachers for this module</p>
                <p className="text-xs text-yellow-700 mb-3">No teachers are assigned to this module or its parent course.</p>
                <Link
                  href="/dashboard/staff/teachers/qualifications"
                  className="inline-block text-xs px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
                >
                  → Manage Teacher Qualifications
                </Link>
              </div>
            )}

            {selectedModuleId && !loadingTeachers && qualifiedTeachers.length > 0 && (
              <>
                <div className="space-y-2 max-h-72 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                  {qualifiedTeachers.map(teacher => {
                    const isSelected = selectedTeacherIds.includes(teacher.id);
                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        onClick={() => toggleTeacher(teacher.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border-2 transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <TeacherContactInfo
                              fullName={teacher.full_name}
                              phone={teacher.phone}
                              email={teacher.email}
                              teacherType={teacher.teacher_type}
                            />
                          </div>
                          {isSelected && (
                            <span className="shrink-0 text-blue-600 text-lg leading-none">✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {qualifiedTeachers.length} teacher{qualifiedTeachers.length !== 1 ? 's' : ''} qualified
                  {qualificationSource === 'module' && ' for this module'}
                  {qualificationSource === 'course' && ' for this course (no module-specific teachers)'}
                </p>
                {selectedTeacherIds.length > 1 && (
                  <p className="text-xs text-blue-600 mt-1">ℹ️ Teachers will be rotated across sessions</p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Room *</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              <option value="">Select a room...</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} (Capacity: {r.capacity})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📅 Schedule</h2>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Scheduling Mode</label>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setSchedulingMode('by_count')}
                className={`px-4 py-2 text-sm font-medium transition ${
                  schedulingMode === 'by_count'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📊 By Number of Sessions
              </button>
              <button
                type="button"
                onClick={() => setSchedulingMode('by_range')}
                className={`px-4 py-2 text-sm font-medium transition border-l border-gray-300 ${
                  schedulingMode === 'by_range'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📆 By Date Range
              </button>
            </div>
          </div>

          {schedulingMode === 'by_count' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Total Sessions *
                  <span className="text-gray-400 font-normal ml-1">(module-driven)</span>
                </label>
                <input
                  type="number"
                  value={formData.total_sessions}
                  onChange={(e) => setFormData({ ...formData, total_sessions: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                  min={1}
                />
                {expectedSessionCount && formData.total_sessions !== expectedSessionCount && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Module expects {expectedSessionCount} sessions
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date *</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                  min={formData.start_date}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Schedule Days *</label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(day => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 text-sm rounded-full transition ${
                    formData.schedule_days.includes(day.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {day.label}
                  {formData.schedule_days.includes(day.value) && ' ✓'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time *</label>
              <input
                type="time"
                step="900"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time *</label>
              <input
                type="time"
                step="900"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              />
              <p className="text-xs text-gray-400 mt-1">
                Duration: {getDuration(formData.start_time, formData.end_time)}
              </p>
            </div>
          </div>

          {/* Derived Preview Card */}
          <div className="mt-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✨</span>
              <span className="text-sm font-semibold text-blue-900">Schedule Summary</span>
            </div>

            {schedulingMode === 'by_count' ? (
              <div className="text-sm text-blue-800 space-y-1">
                {formData.start_date && formData.schedule_days.length > 0 && formData.total_sessions > 0 ? (
                  derivedEndDate ? (
                    <>
                      <div>
                        <span className="text-blue-600">Start:</span>{' '}
                        <strong>{format(parseISO(formData.start_date), 'EEE, MMM d, yyyy')}</strong>
                      </div>
                      <div>
                        <span className="text-blue-600">End:</span>{' '}
                        <strong>{format(parseISO(derivedEndDate), 'EEE, MMM d, yyyy')}</strong>
                        <span className="ml-2 text-xs text-blue-500">(auto-calculated)</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Sessions:</span>{' '}
                        <strong>{formData.total_sessions}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="text-amber-700">⚠️ Could not compute end date — please verify inputs.</div>
                  )
                ) : (
                  <div className="text-blue-600 italic">Fill in start date, total sessions, and schedule days to see the summary.</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-blue-800 space-y-1">
                {formData.start_date && formData.end_date && formData.schedule_days.length > 0 ? (
                  derivedSessionCount > 0 ? (
                    <>
                      <div>
                        <span className="text-blue-600">Start:</span>{' '}
                        <strong>{format(parseISO(formData.start_date), 'EEE, MMM d, yyyy')}</strong>
                      </div>
                      <div>
                        <span className="text-blue-600">End:</span>{' '}
                        <strong>{format(parseISO(formData.end_date), 'EEE, MMM d, yyyy')}</strong>
                      </div>
                      <div>
                        <span className="text-blue-600">Sessions:</span>{' '}
                        <strong className={rangeCountMismatch ? 'text-amber-700' : ''}>{derivedSessionCount}</strong>
                        <span className="ml-2 text-xs text-blue-500">(auto-calculated)</span>
                      </div>
                      {rangeCountMismatch && (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                          ⚠️ Module expects <strong>{expectedSessionCount}</strong> sessions, this range generates <strong>{derivedSessionCount}</strong>. You can still proceed.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-amber-700">⚠️ No sessions match — check schedule days and date range.</div>
                  )
                ) : (
                  <div className="text-blue-600 italic">Fill in start date, end date, and schedule days to see the summary.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Max Students */}
        <div className="border-t pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Students</label>
              <input
                type="number"
                value={formData.max_students}
                onChange={(e) => setFormData({ ...formData, max_students: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
                min={1}
              />
            </div>
          </div>
        </div>

        {/* Generate & Preview */}
        <div className="border-t pt-6">
          <button
            type="button"
            onClick={generateSessions}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            🔄 Generate Sessions Preview
          </button>

          {showPreview && generatedSessions.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-700 mb-3">
                📋 Session Preview ({generatedSessions.length} sessions)
              </h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {generatedSessions.map((session, idx) => {
                      const teacherId = selectedTeacherIds[idx % selectedTeacherIds.length];
                      const teacher = qualifiedTeachers.find(t => t.id === teacherId);
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{idx + 1}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {format(parseISO(session.session_date), 'EEE, MMM d, yyyy')}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">{session.start_time}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{session.end_time}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {rooms.find(r => r.id === session.room_id)?.name || 'TBD'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {teacher ? (
                              <TeacherContactInfo
                                fullName={teacher.full_name}
                                phone={teacher.phone}
                                teacherType={teacher.teacher_type}
                                compact
                              />
                            ) : 'TBD'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/dashboard/classes/management">
            <button className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
              Cancel
            </button>
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || checkingConflicts || !showPreview || generatedSessions.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {checkingConflicts ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Checking conflicts...
              </>
            ) : submitting ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Creating...
              </>
            ) : (
              '✅ Create Group Class'
            )}
          </button>
        </div>
      </div>

      <ConflictResolutionModal
        isOpen={showConflictModal}
        conflicts={detectedConflicts}
        totalSessions={generatedSessions.length}
        onCancel={() => {
          setShowConflictModal(false);
          setDetectedConflicts([]);
          setRawConflicts([]);
        }}
        onConfirm={(choice: ConflictResolutionChoice) => {
          finalizeCreate(choice, detectedConflicts, rawConflicts);
        }}
      />
    </div>
  );
}