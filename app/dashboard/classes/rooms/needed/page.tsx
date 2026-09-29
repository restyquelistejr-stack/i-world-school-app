// app/dashboard/classes/rooms/needed/page.tsx
// ⭐ PHASE 4: Room Needed queue — sessions flagged with room_unassigned
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO, isToday, isTomorrow, isThisWeek } from 'date-fns';
import Link from 'next/link';
import RoomAssignmentModal from './components/RoomAssignmentModal';

interface RoomNeed {
  id: string;
  group_class_id: string;
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
  teacher_id: string | null;
  course_id?: string;
  course_name?: string;
  class_name?: string;
  teacher_name?: string;
}

type FilterKey = 'all' | 'today' | 'tomorrow' | 'week';

export default function RoomNeededPage() {
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState<RoomNeed[]>([]);
  const [selected, setSelected] = useState<RoomNeed | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadNeeds();
    const interval = setInterval(loadNeeds, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function loadNeeds() {
    setLoading(true);

    const { data: sessions } = await supabase
      .from('group_class_sessions')
      .select(`
        id,
        group_class_id,
        session_number,
        session_date,
        start_time,
        end_time,
        teacher_id,
        scheduled_group_classes!inner (
          id,
          class_name,
          course_id,
          courses ( name )
        )
      `)
      .eq('needs_attention', true)
      .eq('attention_reason', 'room_unassigned')
      .is('room_id', null)
      .order('session_date', { ascending: true });

    if (!sessions) {
      setNeeds([]);
      setLoading(false);
      return;
    }

    const teacherIds = [...new Set(sessions.map((s: any) => s.teacher_id).filter(Boolean))];
    const { data: teachers } = teacherIds.length > 0
      ? await supabase.from('users').select('id, full_name').in('id', teacherIds)
      : { data: [] as any[] };

    const teacherMap = Object.fromEntries((teachers || []).map((t: any) => [t.id, t.full_name]));

    const enriched: RoomNeed[] = sessions.map((s: any) => ({
      id: s.id,
      group_class_id: s.group_class_id,
      session_number: s.session_number,
      session_date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      teacher_id: s.teacher_id,
      course_id: s.scheduled_group_classes?.course_id,
      course_name: s.scheduled_group_classes?.courses?.name,
      class_name: s.scheduled_group_classes?.class_name,
      teacher_name: teacherMap[s.teacher_id] || 'Unknown',
    }));

    setNeeds(enriched);
    setLoading(false);
  }

  const filtered = needs.filter(n => {
    const d = parseISO(n.session_date);

    // Date filter
    if (filter === 'today' && !isToday(d)) return false;
    if (filter === 'tomorrow' && !isTomorrow(d)) return false;
    if (filter === 'week' && !isThisWeek(d, { weekStartsOn: 1 })) return false;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = [
        n.class_name,
        n.course_name,
        n.teacher_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  // Group by date for nicer display
  const grouped = filtered.reduce<Record<string, RoomNeed[]>>((acc, n) => {
    const key = n.session_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort();

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🏫 Rooms Needed
            {needs.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                {needs.length}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sessions flagged for room assignment. Assign a room to clear the flag.
          </p>
        </div>
        <Link href="/dashboard/classes/management">
          <button className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to Management
          </button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['all', 'today', 'tomorrow', 'week'] as FilterKey[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search class, course, teacher…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {(filter !== 'all' || search) && (
          <button
            onClick={() => { setFilter('all'); setSearch(''); }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-5xl mb-3">{needs.length === 0 ? '✨' : '🔍'}</div>
          <p className="text-gray-600 font-medium">
            {needs.length === 0 ? 'All sessions have rooms assigned' : 'No matches'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {needs.length === 0
              ? 'Nothing needs your attention right now.'
              : 'Try a different filter or clear your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dateKeys.map(dateKey => (
            <div key={dateKey} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Date header */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {format(parseISO(dateKey), 'EEEE, MMM d, yyyy')}
                </span>
                <span className="text-xs text-gray-400">
                  {grouped[dateKey].length} session{grouped[dateKey].length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Sessions */}
              <div className="divide-y divide-gray-50">
                {grouped[dateKey].map(n => (
                  <div
                    key={n.id}
                    className="px-4 py-3 hover:bg-amber-50/30 transition flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-16 text-xs text-gray-500 shrink-0">
                        #{n.session_number}
                      </div>
                      <div className="w-32 text-sm font-medium text-gray-800 shrink-0">
                        {n.start_time.slice(0, 5)} – {n.end_time.slice(0, 5)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {n.class_name || 'Group Class'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {n.course_name || '—'}
                          {n.teacher_name && ` · 👨‍🏫 ${n.teacher_name}`}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelected(n)}
                      className="shrink-0 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
                    >
                      Assign Room →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <RoomAssignmentModal
          need={selected}
          onClose={() => setSelected(null)}
          onAssigned={() => {
            setSelected(null);
            loadNeeds();
          }}
        />
      )}
    </div>
  );
}