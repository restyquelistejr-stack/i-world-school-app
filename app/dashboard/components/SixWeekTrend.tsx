// app/dashboard/components/SixWeekTrend.tsx
// ⭐ Next 7 weeks — per-teacher small multiples + combined view
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface WeekData {
  week_label: string;
  week_start: string;
  pl: number;
  tcpl: number;
  tlgl: number;
  grp: number;
  total: number;
}

interface TeacherTrend {
  teacher_id: string;
  teacher_name: string;
  weeks: WeekData[];
  total_all: number;
  peak_week: string;
}

export default function SixWeekTrend() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeacherTrend[]>([]);
  const [globalTotals, setGlobalTotals] = useState<WeekData[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'total' | 'peak'>('total');
  const [view, setView] = useState<'teachers' | 'combined'>('teachers');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      const weekRange = 7; // This week + next 6

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

      const firstWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(addWeeks(now, weekRange - 1), { weekStartsOn: 1 });

      const [privateRes, trialRes, groupRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, teacher_id, start_time, is_trial')
          .in('teacher_id', teacherIds)
          .gte('start_time', `${format(firstWeekStart, 'yyyy-MM-dd')}T00:00:00`)
          .lte('start_time', `${format(lastWeekEnd, 'yyyy-MM-dd')}T23:59:59`)
          .in('status', ['confirmed', 'in_progress', 'pending'])
          .or('is_trial.is.null,is_trial.eq.false'),

        supabase
          .from('trial_class_bookings')
          .select('id, selected_teacher_id, selected_date, session_type')
          .in('selected_teacher_id', teacherIds)
          .gte('selected_date', format(firstWeekStart, 'yyyy-MM-dd'))
          .lte('selected_date', format(lastWeekEnd, 'yyyy-MM-dd'))
          .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')'),

        supabase
          .from('group_class_sessions')
          .select('id, teacher_id, session_date')
          .in('teacher_id', teacherIds)
          .gte('session_date', format(firstWeekStart, 'yyyy-MM-dd'))
          .lte('session_date', format(lastWeekEnd, 'yyyy-MM-dd'))
          .in('status', ['scheduled', 'ongoing']),
      ]);

      // Build week lookup
      const weekStartDates: string[] = [];
      const weekIndex: Record<string, number> = {};
      for (let i = 0; i < weekRange; i++) {
        const ws = startOfWeek(addWeeks(now, i), { weekStartsOn: 1 });
        const wsStr = format(ws, 'yyyy-MM-dd');
        weekStartDates.push(wsStr);
        weekIndex[wsStr] = i;
      }

      const getWeekIndex = (dateStr: string): number => {
        const d = new Date(dateStr);
        const ws = startOfWeek(d, { weekStartsOn: 1 });
        return weekIndex[format(ws, 'yyyy-MM-dd')] ?? -1;
      };

      const teacherTrends: TeacherTrend[] = teachers.map((teacher: any) => {
        const weeks: WeekData[] = weekStartDates.map((ws, i) => ({
          week_label: i === 0 ? 'This Wk' : `W+${i}`,
          week_start: ws,
          pl: 0,
          tcpl: 0,
          tlgl: 0,
          grp: 0,
          total: 0,
        }));

        (privateRes.data || []).forEach((b: any) => {
          if (b.teacher_id === teacher.id) {
            const idx = getWeekIndex(b.start_time.split('T')[0]);
            if (idx >= 0) weeks[idx].pl += 1;
          }
        });

        (trialRes.data || []).forEach((t: any) => {
          if (t.selected_teacher_id === teacher.id && t.selected_date) {
            const idx = getWeekIndex(t.selected_date);
            if (idx >= 0) {
              if (t.session_type === 'group') weeks[idx].tlgl += 1;
              else weeks[idx].tcpl += 1;
            }
          }
        });

        (groupRes.data || []).forEach((g: any) => {
          if (g.teacher_id === teacher.id) {
            const idx = getWeekIndex(g.session_date);
            if (idx >= 0) weeks[idx].grp += 1;
          }
        });

        weeks.forEach(w => {
          w.total = w.pl + w.tcpl + w.tlgl + w.grp;
        });

        const totalAll = weeks.reduce((sum, w) => sum + w.total, 0);
        const peakWeek = weeks.reduce((max, w) => w.total > max.total ? w : max, weeks[0]);

        return {
          teacher_id: teacher.id,
          teacher_name: teacher.full_name,
          weeks,
          total_all: totalAll,
          peak_week: peakWeek.week_label,
        };
      });

      const combinedWeeks: WeekData[] = weekStartDates.map((ws, i) => {
        const row: WeekData = {
          week_label: i === 0 ? 'This Wk' : `W+${i}`,
          week_start: ws,
          pl: 0, tcpl: 0, tlgl: 0, grp: 0, total: 0,
        };
        teacherTrends.forEach(tt => {
          row.pl += tt.weeks[i].pl;
          row.tcpl += tt.weeks[i].tcpl;
          row.tlgl += tt.weeks[i].tlgl;
          row.grp += tt.weeks[i].grp;
          row.total += tt.weeks[i].total;
        });
        return row;
      });

      teacherTrends.sort((a, b) => {
        if (sortBy === 'name') return a.teacher_name.localeCompare(b.teacher_name);
        if (sortBy === 'peak') return b.weeks.reduce((m, w) => Math.max(m, w.total), 0) - a.weeks.reduce((m, w) => Math.max(m, w.total), 0);
        return b.total_all - a.total_all;
      });

      setData(teacherTrends);
      setGlobalTotals(combinedWeeks);
    } catch (error) {
      console.error('Error loading trend:', error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-40 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center text-gray-400 text-sm">
        No trend data available
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Controls */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">View:</span>
          <button
            onClick={() => setView('teachers')}
            className={`px-2 py-0.5 rounded transition ${view === 'teachers' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Per Teacher
          </button>
          <button
            onClick={() => setView('combined')}
            className={`px-2 py-0.5 rounded transition ${view === 'combined' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Combined
          </button>
        </div>

        {view === 'teachers' && (
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
              Peak
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-2 py-0.5 rounded transition ${sortBy === 'name' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              Name
            </button>
          </div>
        )}
      </div>

      {/* Chart Area */}
      <div className="p-4">
        {view === 'combined' ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={globalTotals} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="week_label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as WeekData;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                        <div className="font-bold text-gray-800 mb-1">{row.week_label} · from {row.week_start}</div>
                        <div className="flex items-center gap-2 text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> PL: <strong>{row.pl}</strong></div>
                        <div className="flex items-center gap-2 text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500"></span> TCPL: <strong>{row.tcpl}</strong></div>
                        <div className="flex items-center gap-2 text-cyan-700"><span className="w-2 h-2 rounded-full bg-cyan-500"></span> TLGL: <strong>{row.tlgl}</strong></div>
                        <div className="flex items-center gap-2 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Grp: <strong>{row.grp}</strong></div>
                        <div className="mt-1 pt-1 border-t border-gray-100"><strong>Total: {row.total}</strong></div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="pl" name="PL" stackId="a" fill="#10b981" barSize={40} />
                <Bar dataKey="tcpl" name="TCPL" stackId="a" fill="#a855f7" barSize={40} />
                <Bar dataKey="tlgl" name="TLGL" stackId="a" fill="#06b6d4" barSize={40} />
                <Bar dataKey="grp" name="Grp" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((teacher) => {
              const chartData = teacher.weeks.map(w => ({
                week: w.week_label,
                PL: w.pl,
                TCPL: w.tcpl,
                TLGL: w.tlgl,
                Grp: w.grp,
                total: w.total,
              }));

              return (
                <div key={teacher.teacher_id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1 h-4 rounded-full bg-blue-500 shrink-0"></span>
                      <span className="font-semibold text-[11px] text-gray-800 truncate">
                        {teacher.teacher_name}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                      Σ <strong className="text-gray-800">{teacher.total_all}</strong>
                      <span className="ml-1 text-gray-400">· peak {teacher.peak_week}</span>
                    </span>
                  </div>

                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} allowDecimals={false} width={25} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0].payload;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-[10px]">
                                <div className="font-bold text-gray-800 mb-1">{row.week}</div>
                                <div className="text-emerald-700">PL: {row.PL}</div>
                                <div className="text-purple-700">TCPL: {row.TCPL}</div>
                                <div className="text-cyan-700">TLGL: {row.TLGL}</div>
                                <div className="text-amber-700">Grp: {row.Grp}</div>
                                <div className="mt-1 pt-1 border-t border-gray-100 font-bold">Total: {row.total}</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="PL" stackId="a" fill="#10b981" />
                        <Bar dataKey="TCPL" stackId="a" fill="#a855f7" />
                        <Bar dataKey="TLGL" stackId="a" fill="#06b6d4" />
                        <Bar dataKey="Grp" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-[9px] text-gray-500 flex flex-wrap items-center gap-4">
        <span className="font-medium text-gray-600">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> PL (Private)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-500"></span> TCPL (Trial Private)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-500"></span> TLGL (Trial Group)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Grp (Group)</span>
      </div>
    </div>
  );
}