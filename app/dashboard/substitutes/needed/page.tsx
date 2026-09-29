// app/dashboard/substitutes/needed/page.tsx
// ⭐ M7: Substitute Needed dashboard
// ⭐ M8: Wired up Find Substitute modal
// ⭐ PHASE 6: Adds cross-link to Room Needed queue
// ⭐ v3.3: Works with updated substituteService — no functional changes
'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import FindSubstituteModal from '@/components/FindSubstituteModal';
import {
  getPendingSubstituteNeeds,
  type SubstituteNeed,
} from '@/lib/substituteService';

type FilterStatus = 'pending' | 'assigned' | 'all';
type SessionTypeFilter = 'all' | 'group_session' | 'private_session' | 'trial_private' | 'trial_group';
type SortOrder = 'date_asc' | 'date_desc' | 'urgency';

export default function SubstituteNeededPage() {
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState<SubstituteNeed[]>([]);
  const [roomNeededCount, setRoomNeededCount] = useState(0);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [filterType, setFilterType] = useState<SessionTypeFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('urgency');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNeed, setSelectedNeed] = useState<SubstituteNeed | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getPendingSubstituteNeeds();
      setNeeds(data);
    } catch (err) {
      console.error('Error loading substitute needs:', err);
    }

    try {
      const { count } = await supabase
        .from('group_class_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('needs_attention', true)
        .eq('attention_reason', 'room_unassigned');
      setRoomNeededCount(count || 0);
    } catch (err) {
      console.warn('Could not load room needed count:', err);
    }

    setLoading(false);
  }

  function openFindSubstituteModal(need: SubstituteNeed) {
    setSelectedNeed(need);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedNeed(null);
  }

  async function handleAssigned() {
    await loadData();
  }

  const filteredNeeds = useMemo(() => {
    let result = [...needs];

    if (filterStatus === 'pending') {
      result = result.filter(n => n.status === 'pending');
    } else if (filterStatus === 'assigned') {
      result = result.filter(n => n.status === 'assigned');
    }

    if (filterType !== 'all') {
      result = result.filter(n => n.session_type === filterType);
    }

    if (dateFrom) {
      result = result.filter(n => (n.session_date || '') >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(n => (n.session_date || '') <= dateTo);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        (n.original_teacher_name || '').toLowerCase().includes(q) ||
        (n.substitute_teacher_name || '').toLowerCase().includes(q) ||
        (n.course_name || '').toLowerCase().includes(q) ||
        (n.class_code || '').toLowerCase().includes(q) ||
        (n.room_name || '').toLowerCase().includes(q) ||
        (n.student_name || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortOrder === 'urgency') {
        const priority: Record<SubstituteNeed['urgency'], number> = {
          past: 0,
          today: 1,
          tomorrow: 2,
          this_week: 3,
          later: 4,
        };
        const diff = priority[a.urgency] - priority[b.urgency];
        if (diff !== 0) return diff;
        return (a.session_date || '').localeCompare(b.session_date || '');
      }
      if (sortOrder === 'date_asc') {
        return (a.session_date || '').localeCompare(b.session_date || '');
      }
      return (b.session_date || '').localeCompare(a.session_date || '');
    });

    return result;
  }, [needs, filterStatus, filterType, dateFrom, dateTo, searchQuery, sortOrder]);

  const groupedNeeds = useMemo(() => {
    const groups: Record<string, SubstituteNeed[]> = {
      past: [],
      today: [],
      tomorrow: [],
      this_week: [],
      later: [],
    };
    for (const n of filteredNeeds) {
      groups[n.urgency].push(n);
    }
    return groups;
  }, [filteredNeeds]);

  const stats = useMemo(() => {
    const pending = needs.filter(n => n.status === 'pending');
    return {
      totalPending: pending.length,
      today: pending.filter(n => n.urgency === 'today').length,
      tomorrow: pending.filter(n => n.urgency === 'tomorrow').length,
      thisWeek: pending.filter(n => n.urgency === 'this_week').length,
      unassigned: pending.filter(n => !n.substitute_teacher_id).length,
    };
  }, [needs]);

  const getSessionTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      trial_private: '🎯 Trial Private',
      trial_group: '👥 Trial Group',
      private_session: '📚 Private Class',
      group_session: '👥 Group Class',
    };
    return map[type] || type;
  };

  const getSessionTypeColor = (type: string) => {
    const map: Record<string, string> = {
      trial_private: 'bg-purple-100 text-purple-700',
      trial_group: 'bg-cyan-100 text-cyan-700',
      private_session: 'bg-emerald-100 text-emerald-700',
      group_session: 'bg-rose-100 text-rose-700',
    };
    return map[type] || 'bg-gray-100 text-gray-700';
  };

  const getUrgencyColor = (urgency: string) => {
    const map: Record<string, string> = {
      past: 'bg-gray-100 text-gray-600 border-gray-300',
      today: 'bg-red-100 text-red-800 border-red-300',
      tomorrow: 'bg-orange-100 text-orange-800 border-orange-300',
      this_week: 'bg-amber-100 text-amber-800 border-amber-300',
      later: 'bg-blue-100 text-blue-700 border-blue-300',
    };
    return map[urgency] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const getUrgencyLabel = (urgency: string, daysUntil: number) => {
    if (urgency === 'past') return `⏰ ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago`;
    if (urgency === 'today') return '🔥 TODAY';
    if (urgency === 'tomorrow') return '⏰ Tomorrow';
    if (urgency === 'this_week') return `📅 In ${daysUntil} days`;
    return `📆 In ${daysUntil} days`;
  };

  const getLeaveReasonLabel = (reason: string | null) => {
    if (!reason) return 'Teacher unavailable';
    if (reason.startsWith('teacher_leave:')) {
      const leaveType = reason.split(':')[1] || 'leave';
      const map: Record<string, string> = {
        annual: 'Annual leave',
        sick: 'Sick leave',
        personal: 'Personal leave',
        emergency: 'Emergency leave',
        other: 'Leave',
        leave: 'Leave',
      };
      return map[leaveType] || 'Leave';
    }
    if (reason === 'teacher_conflict') return 'Teacher conflict';
    if (reason === 'room_conflict') return 'Room conflict';
    return reason;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'EEE, MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatTimeRange = (start: string | null, end: string | null) => {
    if (!start || !end) return 'N/A';
    return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
  };

  const renderNeedCard = (need: SubstituteNeed) => {
    const isAssigned = need.status === 'assigned' && need.substitute_teacher_id;

    return (
      <div
        key={need.id}
        className={`bg-white rounded-lg border-2 p-4 transition hover:shadow-md ${
          isAssigned ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 hover:border-amber-300'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getSessionTypeColor(need.session_type)}`}>
                {getSessionTypeLabel(need.session_type)}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium border ${getUrgencyColor(need.urgency)}`}>
                {getUrgencyLabel(need.urgency, need.days_until)}
              </span>
              {isAssigned && (
                <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✅ Assigned
                </span>
              )}
            </div>

            <div className="text-base font-semibold text-gray-900">
              {need.course_name || 'Class Session'}
              {need.class_code && (
                <span className="ml-2 font-mono text-xs text-gray-500">{need.class_code}</span>
              )}
            </div>

            {need.module_name && (
              <div className="text-sm text-gray-600 mt-0.5">
                📖 {need.module_name}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-gray-400">📅</span>
                <span>{formatDate(need.session_date)}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-gray-400">🕐</span>
                <span>{formatTimeRange(need.start_time, need.end_time)}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-gray-400">🏠</span>
                <span>{need.room_name || 'No room'}</span>
              </div>
              {need.student_name && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="text-gray-400">👤</span>
                  <span>{need.student_name}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Original:</span>
                <span className="font-medium text-gray-700">
                  👨‍🏫 {need.original_teacher_name || 'Unknown'}
                </span>
                {need.leave_reason && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    {getLeaveReasonLabel(need.leave_reason)}
                  </span>
                )}
              </div>

              {isAssigned && (
                <div className="flex items-center gap-2 text-sm mt-1">
                  <span className="text-emerald-600">Substitute:</span>
                  <span className="font-medium text-emerald-700">
                    👨‍🏫 {need.substitute_teacher_name}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {!isAssigned ? (
              <button
                onClick={() => openFindSubstituteModal(need)}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition whitespace-nowrap flex items-center gap-2"
              >
                🔍 Find Substitute
              </button>
            ) : (
              <button
                onClick={() => openFindSubstituteModal(need)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition whitespace-nowrap flex items-center gap-2"
              >
                🔄 Re-assign
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderGroup = (key: string, title: string, items: SubstituteNeed[]) => {
    if (items.length === 0) return null;

    const emoji = {
      past: '⏰',
      today: '🔥',
      tomorrow: '⏳',
      this_week: '📅',
      later: '📆',
    }[key] || '📋';

    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{emoji}</span>
          <h2 className="text-lg font-bold text-gray-800">
            {title}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({items.length})
            </span>
          </h2>
        </div>
        <div className="space-y-3">
          {items.map(renderNeedCard)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const totalFiltered = filteredNeeds.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🔄 Substitute Needed
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sessions requiring substitute teacher coverage
          </p>
        </div>

        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900 text-sm">
            ← Back to Management
          </button>
        </Link>
      </div>

      {roomNeededCount > 0 && (
        <Link href="/dashboard/classes/rooms/needed">
          <div className="mb-6 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 hover:bg-orange-100 transition flex items-center justify-between cursor-pointer">
            <span className="flex items-center gap-2">
              🏫 <strong>{roomNeededCount}</strong> session{roomNeededCount !== 1 ? 's' : ''} also need room assignment
            </span>
            <span className="font-medium">→</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.totalPending}</div>
        </div>
        <div className={`rounded-lg border p-3 ${stats.today > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="text-xs text-gray-500 uppercase tracking-wider">🔥 Today</div>
          <div className={`text-2xl font-bold mt-1 ${stats.today > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {stats.today}
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${stats.tomorrow > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
          <div className="text-xs text-gray-500 uppercase tracking-wider">⏳ Tomorrow</div>
          <div className={`text-2xl font-bold mt-1 ${stats.tomorrow > 0 ? 'text-orange-700' : 'text-gray-900'}`}>
            {stats.tomorrow}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">📅 This Week</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.thisWeek}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Unassigned</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{stats.unassigned}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="pending">Pending only</option>
              <option value="assigned">Assigned only</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Session Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as SessionTypeFilter)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="all">All types</option>
              <option value="group_session">👥 Group Class</option>
              <option value="private_session">📚 Private Class</option>
              <option value="trial_group">👥 Group Trial</option>
              <option value="trial_private">🎯 Private Trial</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="urgency">🔥 Urgency (default)</option>
              <option value="date_asc">📅 Date (soonest first)</option>
              <option value="date_desc">📅 Date (latest first)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-3">
          <input
            type="text"
            placeholder="🔍 Search by teacher, course, class code, student…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[240px] px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={() => {
              setFilterStatus('pending');
              setFilterType('all');
              setSortOrder('urgency');
              setDateFrom('');
              setDateTo('');
              setSearchQuery('');
            }}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            Clear Filters
          </button>
          <button
            onClick={loadData}
            className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {totalFiltered === 0 ? (
        <div className="bg-white rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">
            {needs.length === 0
              ? 'No substitute assignments'
              : 'No sessions match your filters'}
          </h3>
          <p className="text-sm text-gray-500">
            {needs.length === 0
              ? 'All sessions have their assigned teachers. Great job!'
              : 'Try clearing some filters to see more results.'}
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-4">
            Showing {totalFiltered} session{totalFiltered !== 1 ? 's' : ''}
            {filterStatus !== 'all' && ` · Status: ${filterStatus}`}
            {filterType !== 'all' && ` · Type: ${getSessionTypeLabel(filterType)}`}
          </div>

          {sortOrder === 'urgency' ? (
            <>
              {renderGroup('past', '⏰ Past (needs review)', groupedNeeds.past)}
              {renderGroup('today', '🔥 Today', groupedNeeds.today)}
              {renderGroup('tomorrow', '⏳ Tomorrow', groupedNeeds.tomorrow)}
              {renderGroup('this_week', '📅 This Week', groupedNeeds.this_week)}
              {renderGroup('later', '📆 Later', groupedNeeds.later)}
            </>
          ) : (
            <div className="space-y-3">
              {filteredNeeds.map(renderNeedCard)}
            </div>
          )}
        </>
      )}

      <FindSubstituteModal
        isOpen={modalOpen}
        need={selectedNeed}
        onClose={closeModal}
        onAssigned={handleAssigned}
      />
    </div>
  );
}