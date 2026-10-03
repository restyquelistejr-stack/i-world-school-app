// app/dashboard/staff/attendance/AttendanceClient.tsx
// ⭐ v3.20 — Full rebuild using session_attendance
//            Sources: private, trial_private, trial_group, group
//            Reuses SessionRosterModal for marking
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO, addDays } from 'date-fns';
import Link from 'next/link';
import SessionRosterModal from '@/components/SessionRosterModal';
import type { SessionType } from '@/lib/attendanceService';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SourceKind = 'private' | 'trial_private' | 'trial_group' | 'group';

interface DaySession {
  id: string;                 // the underlying session id
  sessionTypeKey: SessionType; // 'booking' | 'group_session' | 'trial_booking'
  source: SourceKind;
  title: string;              // course or class name
  subtitle?: string;          // module / trial marker / etc
  startTime: string;          // 'HH:mm'
  endTime: string;            // 'HH:mm'
  teacherId: string | null;
  teacherName: string;
  substituteId: string | null;
  substituteName: string | null;
  roomName: string | null;
  studentCount: number;
  /** attendance state */
  marked: {
    teacher: boolean;
    studentsTotal: number;
    studentsMarked: number;
  };
}

type StatusFilter = 'all' | 'pending' | 'marked';

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function AttendanceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven state
  const dateParam = searchParams.get('date');
  const filterParam = (searchParams.get('filter') as StatusFilter) || 'all';

  const [selectedDate, setSelectedDate] = useState<Date>(
    dateParam ? parseISO(dateParam) : new Date()
  );
  const [filter, setFilter] = useState<StatusFilter>(filterParam);
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rosterSession, setRosterSession] = useState<DaySession | null>(null);

  // Keep URL in sync
  const setUrlState = useCallback(
    (next: { date?: string; filter?: StatusFilter }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.date !== undefined) params.set('date', next.date);
      if (next.filter !== undefined) params.set('filter', next.filter);
      router.push(`/dashboard/staff/attendance?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Load on date change
  useEffect(() => {
    loadDay(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate.toDateString()]);

  // Sync filter with URL when it changes externally
  useEffect(() => {
    setFilter(filterParam);
  }, [filterParam]);

  // Sync selected date from URL
  useEffect(() => {
    if (dateParam) {
      const d = parseISO(dateParam);
      if (d.toDateString() !== selectedDate.toDateString()) {
        setSelectedDate(d);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  const navigateDay = (dir: 'prev' | 'next') => {
    const next = addDays(selectedDate, dir === 'next' ? 1 : -1);
    setUrlState({ date: format(next, 'yyyy-MM-dd') });
  };

  const goToToday = () => {
    setUrlState({ date: format(new Date(), 'yyyy-MM-dd') });
  };

  const changeFilter = (f: StatusFilter) => {
    setFilter(f);
    setUrlState({ filter: f });
  };

  // ─────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────
  async function loadDay(date: Date) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const dateStr = format(date, 'yyyy-MM-dd');

      // ── 1. Fetch all 4 teaching sources in parallel ──
      const [privateRes, groupRes, trialRes] = await Promise.all([
        // Private class bookings
        supabase
          .from('bookings')
          .select('id, teacher_id, substitute_teacher_id, course_id, room_id, start_time, end_time, status, is_trial, is_deleted')
          .gte('start_time', `${dateStr}T00:00:00`)
          .lte('start_time', `${dateStr}T23:59:59`)
          .in('status', ['confirmed', 'in_progress', 'pending'])
          .eq('is_deleted', false)
          .or('is_trial.is.null,is_trial.eq.false'),

        // Group class sessions
        supabase
          .from('group_class_sessions')
          .select('id, group_class_id, teacher_id, substitute_teacher_id, room_id, session_date, start_time, end_time, status, session_number, is_deleted')
          .eq('session_date', dateStr)
          .eq('is_deleted', false)
          .in('status', ['scheduled', 'ongoing', 'completed']),

        // Trial bookings (private + group)
        supabase
          .from('trial_class_bookings')
          .select('id, selected_teacher_id, substitute_teacher_id, course_id, module_id, room_id, selected_date, selected_time, hours, status, session_type, student_id, is_deleted')
          .eq('selected_date', dateStr)
          .eq('is_deleted', false)
          .not('status', 'in', '(\'cancelled\', \'converted\')'),
      ]);

      const privateRows = privateRes.data || [];
      const groupRows = groupRes.data || [];
      const trialRows = trialRes.data || [];

      // ── 2. Collect IDs to enrich ──
      const teacherIds = new Set<string>();
      const courseIds = new Set<string>();
      const roomIds = new Set<string>();
      const groupClassIds = new Set<string>();
      const moduleIds = new Set<string>();

      privateRows.forEach((b: any) => {
        if (b.teacher_id) teacherIds.add(b.teacher_id);
        if (b.substitute_teacher_id) teacherIds.add(b.substitute_teacher_id);
        if (b.course_id) courseIds.add(b.course_id);
        if (b.room_id) roomIds.add(b.room_id);
      });
      groupRows.forEach((g: any) => {
        if (g.teacher_id) teacherIds.add(g.teacher_id);
        if (g.substitute_teacher_id) teacherIds.add(g.substitute_teacher_id);
        if (g.group_class_id) groupClassIds.add(g.group_class_id);
        if (g.room_id) roomIds.add(g.room_id);
      });
      trialRows.forEach((t: any) => {
        if (t.selected_teacher_id) teacherIds.add(t.selected_teacher_id);
        if (t.substitute_teacher_id) teacherIds.add(t.substitute_teacher_id);
        if (t.course_id) courseIds.add(t.course_id);
        if (t.module_id) moduleIds.add(t.module_id);
        if (t.room_id) roomIds.add(t.room_id);
      });

      // Fetch group class rows to get course names
      const groupClassCourseIds = new Set<string>();
      if (groupClassIds.size > 0) {
        const { data: gcs } = await supabase
          .from('scheduled_group_classes')
          .select('id, class_name, course_id')
          .in('id', [...groupClassIds]);
        (gcs || []).forEach((g: any) => {
          if (g.course_id) {
            courseIds.add(g.course_id);
            groupClassCourseIds.add(g.course_id);
          }
        });
        // stash for later
        (window as any).__gcMap = Object.fromEntries((gcs || []).map((g: any) => [g.id, g]));
      }

      // ── 3. Enrich in parallel ──
      const [teachersRes, coursesRes, roomsRes, modulesRes] = await Promise.all([
        teacherIds.size > 0
          ? supabase.from('users').select('id, full_name').in('id', [...teacherIds])
          : Promise.resolve({ data: [] as any[] }),
        courseIds.size > 0
          ? supabase.from('courses').select('id, name').in('id', [...courseIds])
          : Promise.resolve({ data: [] as any[] }),
        roomIds.size > 0
          ? supabase.from('rooms').select('id, name').in('id', [...roomIds])
          : Promise.resolve({ data: [] as any[] }),
        moduleIds.size > 0
          ? supabase.from('course_modules').select('id, title').in('id', [...moduleIds])
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const teacherMap = Object.fromEntries((teachersRes.data || []).map((t: any) => [t.id, t.full_name]));
      const courseMap = Object.fromEntries((coursesRes.data || []).map((c: any) => [c.id, c.name]));
      const roomMap = Object.fromEntries((roomsRes.data || []).map((r: any) => [r.id, r.name]));
      const moduleMap = Object.fromEntries((modulesRes.data || []).map((m: any) => [m.id, m.title]));
      const gcMap = (window as any).__gcMap || {};

      // ── 4. Fetch attendance rows for the day ──
      const allSessionIds: { sessionType: SessionType; sessionId: string }[] = [];
      privateRows.forEach((b: any) => allSessionIds.push({ sessionType: 'booking', sessionId: b.id }));
      groupRows.forEach((g: any) => allSessionIds.push({ sessionType: 'group_session', sessionId: g.id }));
      trialRows.forEach((t: any) => allSessionIds.push({ sessionType: 'trial_booking', sessionId: t.id }));

      let attendanceRows: any[] = [];
      if (allSessionIds.length > 0) {
        const grouped: Record<string, string[]> = {};
        allSessionIds.forEach(({ sessionType, sessionId }) => {
          if (!grouped[sessionType]) grouped[sessionType] = [];
          grouped[sessionType].push(sessionId);
        });

        const parts = await Promise.all(
          Object.entries(grouped).map(([st, ids]) =>
            supabase
              .from('session_attendance')
              .select('session_type, session_id, attendee_type, attendee_id, status, is_rendered')
              .eq('session_type', st)
              .in('session_id', ids)
          )
        );
        attendanceRows = parts.flatMap(p => p.data || []);
      }

      // Build attendance lookup: key = `${session_type}:${session_id}`
      const attendanceBySession: Record<
        string,
        { teacher?: any; students: any[] }
      > = {};
      attendanceRows.forEach((a: any) => {
        const key = `${a.session_type}:${a.session_id}`;
        if (!attendanceBySession[key]) attendanceBySession[key] = { students: [] };
        if (a.attendee_type === 'teacher') {
          attendanceBySession[key].teacher = a;
        } else if (a.attendee_type === 'student') {
          attendanceBySession[key].students.push(a);
        }
      });

      // ── 5. Build unified session list ──
      const list: DaySession[] = [];

      // Private
      privateRows.forEach((b: any) => {
        const att = attendanceBySession[`booking:${b.id}`];
        const startTime = (b.start_time as string).slice(11, 16);
        const endTime = (b.end_time as string).slice(11, 16);
        const roomName = b.room_id ? roomMap[b.room_id] ?? null : null;
        const teacherName = b.teacher_id ? teacherMap[b.teacher_id] ?? 'Unknown' : 'Not assigned';
        const substituteName = b.substitute_teacher_id
          ? teacherMap[b.substitute_teacher_id] ?? 'Substitute'
          : null;

        list.push({
          id: b.id,
          sessionTypeKey: 'booking',
          source: 'private',
          title: courseMap[b.course_id] ?? 'Private class',
          startTime,
          endTime,
          teacherId: b.teacher_id,
          teacherName,
          substituteId: b.substitute_teacher_id,
          substituteName,
          roomName,
          studentCount: 1,
          marked: {
            teacher: !!att?.teacher && att.teacher.status && att.teacher.status !== 'expected',
            studentsTotal: 1,
            studentsMarked:
              att?.students?.filter(s => s.status && s.status !== 'expected').length ?? 0,
          },
        });
      });

      // Group
      groupRows.forEach((g: any) => {
        const att = attendanceBySession[`group_session:${g.id}`];
        const startTime = (g.start_time as string).slice(0, 5);
        const endTime = (g.end_time as string).slice(0, 5);
        const gc = gcMap[g.group_class_id] || {};
        const title = gc.class_name || courseMap[gc.course_id] || 'Group class';
        const roomName = g.room_id ? roomMap[g.room_id] ?? null : null;
        const teacherName = g.teacher_id ? teacherMap[g.teacher_id] ?? 'Unknown' : 'Not assigned';
        const substituteName = g.substitute_teacher_id
          ? teacherMap[g.substitute_teacher_id] ?? 'Substitute'
          : null;

        const studentsTotal = att?.students?.length ?? 0;
        const studentsMarked =
          att?.students?.filter(s => s.status && s.status !== 'expected').length ?? 0;

        list.push({
          id: g.id,
          sessionTypeKey: 'group_session',
          source: 'group',
          title,
          subtitle: `Session #${g.session_number}`,
          startTime,
          endTime,
          teacherId: g.teacher_id,
          teacherName,
          substituteId: g.substitute_teacher_id,
          substituteName,
          roomName,
          studentCount: studentsTotal,
          marked: {
            teacher: !!att?.teacher && att.teacher.status && att.teacher.status !== 'expected',
            studentsTotal,
            studentsMarked,
          },
        });
      });

      // Trials
      trialRows.forEach((t: any) => {
        const att = attendanceBySession[`trial_booking:${t.id}`];
        const startTime = (t.selected_time as string).slice(0, 5);
        const [h, m] = startTime.split(':').map(Number);
        const endH = h + (t.hours ?? 2);
        const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const roomName = t.room_id ? roomMap[t.room_id] ?? null : null;
        const teacherName = t.selected_teacher_id
          ? teacherMap[t.selected_teacher_id] ?? 'Unknown'
          : 'Not assigned';
        const substituteName = t.substitute_teacher_id
          ? teacherMap[t.substitute_teacher_id] ?? 'Substitute'
          : null;
        const isGroupTrial = t.session_type === 'group';
        const title = courseMap[t.course_id] ?? 'Trial';
        const subtitle = isGroupTrial
          ? 'Trial · Group'
          : t.module_id
          ? `Trial · ${moduleMap[t.module_id] ?? 'Private'}`
          : 'Trial · Private';

        list.push({
          id: t.id,
          sessionTypeKey: 'trial_booking',
          source: isGroupTrial ? 'trial_group' : 'trial_private',
          title,
          subtitle,
          startTime,
          endTime,
          teacherId: t.selected_teacher_id,
          teacherName,
          substituteId: t.substitute_teacher_id,
          substituteName,
          roomName,
          studentCount: 1,
          marked: {
            teacher: !!att?.teacher && att.teacher.status && att.teacher.status !== 'expected',
            studentsTotal: 1,
            studentsMarked:
              att?.students?.filter(s => s.status && s.status !== 'expected').length ?? 0,
          },
        });
      });

      // Sort by start time
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSessions(list);
    } catch (err: any) {
      console.error('Error loading attendance day:', err);
      setErrorMessage(err?.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Derived — filter
  // ─────────────────────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    if (filter === 'all') return sessions;
    if (filter === 'pending')
      return sessions.filter(s => !(s.marked.teacher && s.marked.studentsMarked === s.marked.studentsTotal));
    if (filter === 'marked')
      return sessions.filter(s => s.marked.teacher && s.marked.studentsMarked === s.marked.studentsTotal);
    return sessions;
  }, [sessions, filter]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const complete = sessions.filter(
      s => s.marked.teacher && s.marked.studentsMarked === s.marked.studentsTotal
    ).length;
    const pending = total - complete;
    return { total, complete, pending };
  }, [sessions]);

  // ─────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────

  const dateHeading = format(selectedDate, 'EEEE, MMMM d, yyyy');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>📋</span> Daily Attendance
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{dateHeading}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
            <button
              onClick={goToToday}
              className={`px-3 py-1.5 text-sm rounded ${
                format(new Date(), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              Today
            </button>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            <button
              onClick={() => navigateDay('prev')}
              className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700"
              title="Previous day"
            >
              ←
            </button>
            <button
              onClick={() => navigateDay('next')}
              className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700"
              title="Next day"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Stats + filter pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => changeFilter('all')}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
              filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => changeFilter('pending')}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
              filter === 'pending' ? 'bg-orange-600 text-white' : 'bg-orange-50 hover:bg-orange-100 text-orange-700'
            }`}
          >
            ⏳ Pending ({stats.pending})
          </button>
          <button
            onClick={() => changeFilter('marked')}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
              filter === 'marked' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
            }`}
          >
            ✅ Marked ({stats.complete})
          </button>
        </div>

        <Link
          href="/dashboard/classes/calendar"
          className="text-xs text-blue-600 hover:underline"
        >
          View full calendar →
        </Link>
      </div>

      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Session list */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-gray-500">
            {filter === 'all'
              ? 'No sessions scheduled for this day.'
              : filter === 'pending'
              ? 'No pending sessions — all caught up!'
              : 'No fully-marked sessions yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map(s => (
            <SessionRow key={`${s.sessionTypeKey}:${s.id}`} session={s} onOpen={() => setRosterSession(s)} />
          ))}
        </div>
      )}

      {/* Roster modal — reuses the existing SessionRosterModal */}
      {rosterSession && (
        <SessionRosterModal
          isOpen={!!rosterSession}
          sessionType={rosterSession.sessionTypeKey}
          sessionId={rosterSession.id}
          sessionLabel={`${rosterSession.title} · ${rosterSession.startTime}–${rosterSession.endTime}`}
          onClose={() => setRosterSession(null)}
          onSaved={() => {
            setRosterSession(null);
            loadDay(selectedDate);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Session row
// ─────────────────────────────────────────────────────────────

function SessionRow({ session, onOpen }: { session: DaySession; onOpen: () => void }) {
  const isFullyMarked =
    session.marked.teacher && session.marked.studentsMarked === session.marked.studentsTotal;
  const isPartiallyMarked = session.marked.teacher || session.marked.studentsMarked > 0;

  const sourceMeta = SOURCE_META[session.source];

  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition p-4 flex items-start gap-4 group"
    >
      {/* Left: time */}
      <div className="shrink-0 w-[88px] text-sm font-mono text-gray-600 pt-0.5">
        <div>{session.startTime}</div>
        <div className="text-gray-400">– {session.endTime}</div>
      </div>

      {/* Middle: title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${sourceMeta.badge}`}>
            {sourceMeta.icon} {sourceMeta.label}
          </span>
          <span className="font-medium text-gray-900 truncate">{session.title}</span>
          {session.subtitle && (
            <span className="text-xs text-gray-500">{session.subtitle}</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          {session.substituteName ? (
            <span className="flex items-center gap-1">
              <span className="font-medium text-emerald-700">👨‍🏫 {session.substituteName}</span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] rounded font-semibold">
                🔄 SUB
              </span>
              <span className="text-gray-400 line-through">{session.teacherName}</span>
            </span>
          ) : (
            <span>👨‍🏫 {session.teacherName}</span>
          )}

          {session.roomName && <span>📍 {session.roomName}</span>}
          {session.studentCount > 0 && <span>👥 {session.studentCount}</span>}
        </div>
      </div>

      {/* Right: status + open */}
      <div className="shrink-0 flex items-center gap-2">
        {isFullyMarked ? (
          <span className="px-2 py-1 text-[10px] rounded-full font-semibold bg-emerald-100 text-emerald-800">
            ✅ Marked {session.marked.studentsMarked}/{session.marked.studentsTotal}
          </span>
        ) : isPartiallyMarked ? (
          <span className="px-2 py-1 text-[10px] rounded-full font-semibold bg-amber-100 text-amber-800">
            ⏳ Partial {session.marked.studentsMarked}/{session.marked.studentsTotal}
          </span>
        ) : (
          <span className="px-2 py-1 text-[10px] rounded-full font-semibold bg-gray-100 text-gray-600">
            ⏳ Pending
          </span>
        )}
        <span className="text-gray-400 text-sm group-hover:text-blue-600 transition">→</span>
      </div>
    </button>
  );
}

const SOURCE_META: Record<DaySession['source'], { icon: string; label: string; badge: string }> = {
  private:       { icon: '📚', label: 'Private',       badge: 'bg-emerald-100 text-emerald-700' },
  trial_private: { icon: '🎯', label: 'Trial Private', badge: 'bg-purple-100 text-purple-700' },
  trial_group:   { icon: '👥', label: 'Trial Group',   badge: 'bg-cyan-100 text-cyan-700' },
  group:         { icon: '👥', label: 'Group',         badge: 'bg-rose-100 text-rose-700' },
};