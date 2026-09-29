// app/dashboard/room-booking/page.tsx
// ⭐ v3.12: Polished form layout + multi-day/recurring scheduling
'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import { formatLocalDate } from '@/lib/timeUtils';

// ==========================================
// TYPES
// ==========================================
type BookingType = 'meeting' | 'event' | 'activity' | 'other';
type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
type RecurrenceEndMode = 'count' | 'until';

interface Room {
  id: string;
  name: string;
  capacity: number;
}

interface FormData {
  booking_type: BookingType;
  title: string;
  description: string;
  notes: string;
  status: 'confirmed' | 'pending';
  requestor_name: string;
  room_id: string;
  start_date: string;
  start_time: string;
  end_time: string;
  // Recurrence
  frequency: RecurrenceFrequency;
  end_mode: RecurrenceEndMode;
  occurrence_count: number;
  end_date: string;
  weekdays: number[];    // for weekly: 0-6
}

const BOOKING_TYPES: { value: BookingType; label: string; icon: string }[] = [
  { value: 'meeting', label: 'Meeting', icon: '💼' },
  { value: 'event', label: 'Event', icon: '🎉' },
  { value: 'activity', label: 'Activity', icon: '🎨' },
  { value: 'other', label: 'Other', icon: '📌' },
];

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function RoomBookingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  const today = formatLocalDate(new Date());

  const [formData, setFormData] = useState<FormData>({
    booking_type: 'meeting',
    title: '',
    description: '',
    notes: '',
    status: 'confirmed',
    requestor_name: '',
    room_id: '',
    start_date: today,
    start_time: '09:00',
    end_time: '10:00',
    frequency: 'none',
    end_mode: 'count',
    occurrence_count: 1,
    end_date: formatLocalDate(addMonths(new Date(), 1)),
    weekdays: [new Date().getDay()],
  });

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    setLoading(true);
    const { data } = await supabase
      .from('rooms')
      .select('id, name, capacity')
      .eq('is_active', true)
      .order('name');
    setRooms(data || []);
    setLoading(false);
  }

  // ==========================================
  // DERIVED: OCCURRENCES PREVIEW
  // ==========================================
  const occurrences = useMemo(() => {
    return computeOccurrences(formData);
  }, [formData]);

  // ==========================================
  // SUBMIT
  // ==========================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) { alert('Please enter a title.'); return; }
    if (!formData.room_id) { alert('Please select a room.'); return; }
    if (!formData.requestor_name.trim()) { alert('Please enter the requestor name.'); return; }
    if (!formData.start_date) { alert('Please select a date.'); return; }
    if (formData.start_time >= formData.end_time) {
      alert('End time must be after start time.'); return;
    }
    if (occurrences.length === 0) {
      alert('No occurrences generated — check your recurrence settings.'); return;
    }

    setSubmitting(true);

    try {
      // Build all rows to insert
      const rows = occurrences.map(occ => ({
        room_id: formData.room_id,
        title: formData.title,
        description: formData.description || null,
        notes: formData.notes || null,
        booking_type: formData.booking_type,
        status: formData.status,
        requestor_name: formData.requestor_name,
        start_time: `${occ.date}T${formData.start_time}:00`,
        end_time: `${occ.date}T${formData.end_time}:00`,
      }));

      // Optional: conflict pre-check per row
      const conflicts: string[] = [];
      for (const row of rows) {
        const { data: clash } = await supabase
          .from('room_bookings')
          .select('id')
          .eq('room_id', formData.room_id)
          .lt('start_time', row.end_time)
          .gt('end_time', row.start_time)
          .in('status', ['confirmed', 'pending']);

        if (clash && clash.length > 0) {
          conflicts.push(`${format(parseISO(row.start_time), 'MMM d, HH:mm')}`);
        }
      }

      if (conflicts.length > 0) {
        const ok = confirm(
          `⚠️ ${conflicts.length} of ${rows.length} occurrence(s) conflict with existing bookings:\n\n` +
          conflicts.slice(0, 5).join('\n') +
          (conflicts.length > 5 ? `\n…and ${conflicts.length - 5} more` : '') +
          `\n\nDo you want to book anyway?`
        );
        if (!ok) { setSubmitting(false); return; }
      }

      const { error } = await supabase.from('room_bookings').insert(rows);
      if (error) throw error;

      const summary = rows.length === 1
        ? `1 booking on ${format(parseISO(rows[0].start_time), 'MMM d, yyyy')}`
        : `${rows.length} recurring bookings`;

      alert(`✅ Room booked successfully!\n\n${summary}`);
      router.push('/dashboard/classes/management');

    } catch (err: any) {
      console.error('Room booking error:', err);
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const showRecurrenceEnd = formData.frequency !== 'none';
  const showWeekdays = formData.frequency === 'weekly' || formData.frequency === 'biweekly';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">🏫 Book a Room</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6 border border-gray-200">

        {/* ────────── ROW 1: Booking Type + Requestor ────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Booking Type *
            </label>
            <select
              value={formData.booking_type}
              onChange={(e) => setFormData({ ...formData, booking_type: e.target.value as BookingType })}
              className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              required
            >
              {BOOKING_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Requestor Name *
            </label>
            <input
              type="text"
              value={formData.requestor_name}
              onChange={(e) => setFormData({ ...formData, requestor_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Who is requesting this booking?"
              required
            />
          </div>
        </div>

        {/* ────────── ROW 2: Title + Status ────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Staff Meeting, Yoga Class…"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status *
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'confirmed' | 'pending' })}
              className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="confirmed">✅ Confirmed</option>
              <option value="pending">⏳ Pending</option>
            </select>
          </div>
        </div>

        {/* ────────── ROW 3: Room ────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Room *
          </label>
          <select
            value={formData.room_id}
            onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a room…</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} {r.capacity ? `(Capacity: ${r.capacity})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* ────────── ROW 4: Description ────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description of the booking…"
          />
        </div>

        {/* ────────── ROW 5: Date + Start + End ────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Time *
            </label>
            <input
              type="time"
              step="900"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Time *
            </label>
            <input
              type="time"
              step="900"
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* ────────── RECURRENCE ────────── */}
        <div className="border-t pt-5">
          <h3 className="font-semibold text-gray-800 mb-3">🔁 Recurrence</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Repeat
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as RecurrenceFrequency })}
                className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Once (no repeat)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {showRecurrenceEnd && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ends
                </label>
                <select
                  value={formData.end_mode}
                  onChange={(e) => setFormData({ ...formData, end_mode: e.target.value as RecurrenceEndMode })}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="count">After N occurrences</option>
                  <option value="until">On date</option>
                </select>
              </div>
            )}
          </div>

          {showRecurrenceEnd && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {formData.end_mode === 'count' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of occurrences
                  </label>
                  <input
                    type="number"
                    value={formData.occurrence_count}
                    onChange={(e) => setFormData({ ...formData, occurrence_count: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={1}
                    max={100}
                  />
                  <p className="text-xs text-gray-400 mt-1">Max 100 occurrences</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End date
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    min={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {showWeekdays && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repeat on
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(d => {
                  const isOn = formData.weekdays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          weekdays: isOn
                            ? prev.weekdays.filter(x => x !== d.value)
                            : [...prev.weekdays, d.value].sort((a, b) => a - b),
                        }));
                      }}
                      className={`px-3 py-1.5 text-sm rounded-full transition ${
                        isOn
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                The first occurrence will be on {format(parseISO(formData.start_date), 'EEE')}, adjusted to match your selection.
              </p>
            </div>
          )}

          {/* Occurrence preview */}
          {occurrences.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs text-blue-700 font-medium mb-2">
                📅 {occurrences.length} occurrence{occurrences.length !== 1 ? 's' : ''} will be created:
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {occurrences.slice(0, 20).map((occ, i) => (
                  <span key={i} className="text-xs bg-white border border-blue-200 text-blue-800 px-2 py-0.5 rounded">
                    {format(parseISO(occ.date), 'EEE, MMM d')}
                  </span>
                ))}
                {occurrences.length > 20 && (
                  <span className="text-xs text-blue-600 font-medium px-2 py-0.5">
                    +{occurrences.length - 20} more
                  </span>
                )}
              </div>
            </div>
          )}

          {showRecurrenceEnd && occurrences.length === 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠️ No occurrences match your recurrence settings. Check your date and weekday selection.
            </div>
          )}
        </div>

        {/* ────────── Notes ────────── */}
        <div className="border-t pt-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Additional notes…"
          />
        </div>

        {/* ────────── Actions ────────── */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/dashboard/classes/management">
            <button
              type="button"
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Booking…
              </>
            ) : (
              <>
                ✅ Book {occurrences.length > 1 ? `${occurrences.length} Rooms` : 'Room'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// OCCURRENCE GENERATOR
// ==========================================
interface Occurrence {
  date: string;    // YYYY-MM-DD
}

function computeOccurrences(form: FormData): Occurrence[] {
  const { frequency, start_date, end_mode, occurrence_count, end_date, weekdays } = form;

  if (!start_date) return [];

  const start = new Date(start_date + 'T00:00:00');
  if (isNaN(start.getTime())) return [];

  const out: Occurrence[] = [];
  const MAX = 100;

  const push = (d: Date) => {
    if (out.length >= MAX) return false;
    out.push({ date: formatLocalDate(d) });
    return true;
  };

  // Single occurrence
  if (frequency === 'none') {
    push(start);
    return out;
  }

  // Compute an end date for iteration
  let hardEnd: Date | null = null;
  if (end_mode === 'until' && end_date) {
    hardEnd = new Date(end_date + 'T00:00:00');
    if (isNaN(hardEnd.getTime())) hardEnd = null;
  }

  const targetCount = end_mode === 'count'
    ? Math.max(1, Math.min(MAX, occurrence_count))
    : MAX;

  // -------------------------------------------------
  // DAILY
  // -------------------------------------------------
  if (frequency === 'daily') {
    let cur = new Date(start);
    while (out.length < targetCount) {
      if (hardEnd && cur > hardEnd) break;
      push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  // -------------------------------------------------
  // WEEKLY / BIWEEKLY — iterate by day, matching selected weekdays
  // -------------------------------------------------
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const selectedDays = weekdays.length > 0 ? weekdays : [start.getDay()];

    // Anchor: start of the week (Sunday) containing start_date
    const anchor = new Date(start);
    anchor.setDate(anchor.getDate() - anchor.getDay());   // back to Sunday

    // Iterate week-by-week
    for (let weekOffset = 0; out.length < targetCount; weekOffset++) {
      const weekStart = addDays(anchor, weekOffset * step);
      if (hardEnd && weekStart > hardEnd) break;
      if (weekOffset > 500) break;   // safety

      // For each selected weekday in this week
      for (const wd of selectedDays) {
        const d = addDays(weekStart, wd);
        // Skip days before the start date
        if (d < start) continue;
        if (hardEnd && d > hardEnd) break;

        // For biweekly, the "off" weeks are skipped by the step already
        push(d);
        if (out.length >= targetCount) break;
      }
    }

    // Sort chronologically
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  // -------------------------------------------------
  // MONTHLY
  // -------------------------------------------------
  if (frequency === 'monthly') {
    const targetDay = start.getDate();
    let monthOffset = 0;

    while (out.length < targetCount) {
      const monthStart = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
      // Handle months with fewer days (e.g. day 31 → last day of month)
      const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const useDay = Math.min(targetDay, lastDay);

      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), useDay);
      if (d < start) { monthOffset++; continue; }
      if (hardEnd && d > hardEnd) break;
      if (monthOffset > 200) break;  // safety

      push(d);
      monthOffset++;
    }

    return out;
  }

  return out;
}