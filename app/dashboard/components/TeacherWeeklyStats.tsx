// app/dashboard/components/TeacherWeeklyStats.tsx
// ⭐ Current week — per-teacher small multiples (matches 6-week view style)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface TeacherDayData {
  day: string;
  dayShort: string;
  date: string;
  private_class: number;
  group_class: number;
  trial_class: number;
  total: number;
}

interface TeacherWeeklyData {
  teacher_id: string;
  teacher_name: string;
  days: TeacherDayData[];
  total_sessions: number;
  private_total: number;
  group_total: number;
  trial_total: number;
  peak_day: string;
  busiest_day_total: number;
}

export default function TeacherWeeklyStats() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeacherWeeklyData[]>([]);
  const [totals, setTotals] = useState<TeacherDayData[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'total' | 'peak'>('total');
  const [weekStartDate, setWeekStartDate] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');
      setWeekStartDate(startStr);

      const { data: teachers } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'teacher')
        .eq('is_active', true)
        .order('full_name');

      if (!teachers || teachers.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const teacherIds = teachers.map((t: any) => t.id);

      // 1. PRIVATE sessions (from bookings)
      const { data: privateBookings } = await supabase
        .from('bookings')
        .select('id, teacher_id, start_time, is_trial')
        .in('teacher_id', teacherIds)
        .gte('start_time', `${startStr}T00:00:00`)
        .lte('start_time', `${endStr}T23:59:59`)
        .in('status', ['confirmed', 'in_progress', 'pending'])
        .or('is_trial.is.null,is_trial.eq.false');

      // 2. TRIAL sessions
      const { data: trialBookings } = await supabase
        .from('trial_class_bookings')
        .select('id, selected_teacher_id, selected_date')
        .in('selected_teacher_id', teacherIds)
        .gte('selected_date', startStr)
        .lte('selected_date', endStr)
        .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')');

      // 3. GROUP sessions
      const { data: groupSessions } = await supabase
        .from('group_class_sessions')
        .select('id, teacher_id, session_date')
        .in('teacher_id', teacherIds)
        .gte('session_date', startStr)
        .lte('session_date', endStr)
        .in('status', ['scheduled', 'ongoing']);

      // Day lookup
      const dayMap: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        dayMap[format(addDays(weekStart, i), 'yyyy-MM-dd')] = i;
      }

      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayShorts = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

      const teacherData: TeacherWeeklyData[] = teachers.map((teacher: any) => {
        const days: TeacherDayData[] = dayLabels.map((label, idx) => ({
          day: label,
          dayShort: dayShorts[idx],
          date: format(addDays(weekStart, idx), 'yyyy-MM-dd'),
          private_class: 0,
          group_class: 0,
          trial_class: 0,
          total: 0,
        }));

        (privateBookings || []).forEach((b: any) => {
          if (b.teacher_id === teacher.id) {
            const idx = dayMap[format(parseISO(b.start_time), 'yyyy-MM-dd')];
            if (idx !== undefined) days[idx].private_class += 1;
          }
        });

        (trialBookings || []).forEach((t: any) => {
          if (t.selected_teacher_id === teacher.id) {
            const idx = dayMap[t.selected_date];
            if (idx !== undefined) days[idx].trial_class += 1;
          }
        });

        (groupSessions || []).forEach((g: any) => {
          if (g.teacher_id === teacher.id) {
            const idx = dayMap[g.session_date];
            if (idx !== undefined) days[idx].group_class += 1;
          }
        });

        days.forEach(d => {
          d.total = d.private_class + d.group_class + d.trial_class;
        });

        const totalAll = days.reduce((s, d) => s + d.total, 0);
        const peakDay = days.reduce(
          (max, d) => (d.total > max.total ? d : max),
          days[0]
        );

        return {
          teacher_id: teacher.id,
          teacher_name: teacher.full_name,
          days,
          total_sessions: totalAll,
          private_total: days.reduce((s, d) => s + d.private_class, 0),
          group_total: days.reduce((s, d) => s + d.group_class, 0),
          trial_total: days.reduce((s, d) => s + d.trial_class, 0),
          peak_day: peakDay.day,
          busiest_day_total: peakDay.total,
        };
      });

      const totalDays: TeacherDayData[] = dayLabels.map((label, idx) => ({
        day: label,
        dayShort: dayShorts[idx],
        date: format(addDays(weekStart, idx), 'yyyy-MM-dd'),
        private_class: teacherData.reduce((s, t) => s + t.days[idx].private_class, 0),
        group_class: teacherData.reduce((s, t) => s + t.days[idx].group_class, 0),
        trial_class: teacherData.reduce((s, t) => s + t.days[idx].trial_class, 0),
        total: teacherData.reduce((s, t) => s + t.days[idx].total, 0),
      }));

      setData(teacherData);
      setTotals(totalDays);
    } catch (error) {
      console.error('Error loading teacher stats:', error);
    }
    setLoading(false);
  }

  const sortedData = [...data].sort((a, b) => {
    if (sortBy === 'name') return a.teacher_name.localeCompare(b.teacher_name);
    if (sortBy === 'peak') return b.busiest_day_total - a.busiest_day_total;
    return b.total_sessions - a.total_sessions;
  });

  // Max for the daily totals chart
  const globalMaxDay = Math.max(...totals.map(d => d.total), 1);

  if (loading) {
    return (
      <div className="animate-pulse bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center text-gray-400 text-sm">
        No teacher data available for this week
      </div>
    );
  }

  const todayIdx = (() => {
    const now = new Date();
    const ws = startOfWeek(now, { weekStartsOn: 1 });
    return Math.floor((now.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24));
  })();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header + Controls */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-3 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700 text-[11px]">
            📅 Teacher Weekly Load
          </span>
          {weekStartDate && (
            <span className="text-gray-400 text-[10px]">
              {format(new Date(weekStartDate), 'MMM d')} –{' '}
              {format(addDays(new Date(weekStartDate), 6), 'MMM d, yyyy')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-gray-500">Sort:</span>
          <button
            onClick={() => setSortBy('total')}
            className={`px-2 py-0.5 rounded transition ${sortBy === 'total' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Total
          </button>
          <button
            onClick={() => setSortBy('peak')}
            className={`px-2 py-0.5 rounded transition ${sortBy === 'peak' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Busiest Day
          </button>
          <button
            onClick={() => setSortBy('name')}
            className={`px-2 py-0.5 rounded transition ${sortBy === 'name' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Name
          </button>
        </div>
      </div>

      {/* Daily Totals Chart (top) */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            Daily Totals (all teachers)
          </span>
          <span className="text-[10px] text-gray-400">
            Peak: <strong className="text-gray-700">
              {totals.reduce((m, d) => d.total > m.total ? d : m, totals[0])?.day}
            </strong>
          </span>
        </div>
        <div className="h-20 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={totals} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                allowDecimals={false}
                width={25}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as TeacherDayData;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-[10px]">
                      <div className="font-bold text-gray-800 mb-1">{row.day} · {row.date}</div>
                      <div className="text-emerald-700">Private: {row.private_class}</div>
                      <div className="text-purple-700">Trial: {row.trial_class}</div>
                      <div className="text-amber-700">Group: {row.group_class}</div>
                      <div className="mt-1 pt-1 border-t border-gray-100 font-bold">Total: {row.total}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {totals.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={idx === todayIdx ? '#3b82f6' : '#cbd5e1'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Teacher Small Multiples */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedData.map((teacher) => {
            const chartData = teacher.days.map((d, idx) => ({
              dayShort: d.dayShort,
              day: d.day,
              P: d.private_class,
              T: d.trial_class,
              G: d.group_class,
              total: d.total,
              isToday: idx === todayIdx,
            }));

            return (
              <div
                key={teacher.teacher_id}
                className="border border-gray-200 rounded-lg p-3 bg-gray-50/30 hover:bg-gray-50 transition"
              >
                {/* Teacher Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1 h-4 rounded-full bg-blue-500 shrink-0"></span>
                    <span className="font-semibold text-[11px] text-gray-800 truncate">
                      {teacher.teacher_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                    Σ <strong className="text-gray-800">{teacher.total_sessions}</strong>
                    <span className="ml-1 text-gray-400">
                      · peak {teacher.peak_day}
                    </span>
                  </span>
                </div>

                {/* Mini Chart */}
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="dayShort"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        allowDecimals={false}
                        width={25}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const row = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-[10px]">
                              <div className="font-bold text-gray-800 mb-1">
                                {row.day}
                                {row.isToday && (
                                  <span className="ml-1 text-blue-600">· Today</span>
                                )}
                              </div>
                              <div className="text-emerald-700">P: {row.P}</div>
                              <div className="text-purple-700">T: {row.T}</div>
                              <div className="text-amber-700">G: {row.G}</div>
                              <div className="mt-1 pt-1 border-t border-gray-100 font-bold">
                                Total: {row.total}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="P" stackId="a" fill="#10b981" />
                      <Bar dataKey="T" stackId="a" fill="#a855f7" />
                      <Bar dataKey="G" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Mini Legend row (per-teacher color dots) */}
                <div className="flex items-center justify-between mt-1.5 text-[9px] text-gray-500">
                  <div className="flex items-center gap-2">
                    {teacher.private_total > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        P {teacher.private_total}
                      </span>
                    )}
                    {teacher.trial_total > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        T {teacher.trial_total}
                      </span>
                    )}
                    {teacher.group_total > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        G {teacher.group_total}
                      </span>
                    )}
                    {teacher.total_sessions === 0 && (
                      <span className="text-gray-300 italic">No sessions this week</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 border-t border-gray-100">
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider">Teachers</div>
          <div className="text-base font-bold text-gray-800">{data.length}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider">Private</div>
          <div className="text-base font-bold text-emerald-600">
            {data.reduce((sum, t) => sum + t.private_total, 0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider">Trial</div>
          <div className="text-base font-bold text-purple-600">
            {data.reduce((sum, t) => sum + t.trial_total, 0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider">Group</div>
          <div className="text-base font-bold text-amber-600">
            {data.reduce((sum, t) => sum + t.group_total, 0)}
          </div>
        </div>
      </div>

      {/* Global Legend */}
      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-[8px] text-gray-400 flex flex-wrap items-center gap-4">
        <span className="font-medium text-gray-500">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> P = Private
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-purple-500"></span> T = Trial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> G = Group
        </span>
        <span className="ml-auto text-[7px] text-gray-300">
          Mon–Sun · stacked per day
        </span>
      </div>
    </div>
  );
}