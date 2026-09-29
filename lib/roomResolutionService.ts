// lib/roomResolutionService.ts
// ⭐ PHASE 2: Find a free room for a specific time slot
import { supabase } from './supabaseClient';

export interface RoomOption {
  id: string;
  name: string;
  capacity: number;
}

/**
 * Return the first room that is completely free for the given slot.
 * Returns null if all rooms are busy.
 */
export async function findFreeRoomForSlot(
  sessionDate: string,
  startTime: string,
  endTime: string,
  rooms: RoomOption[],
  excludeRoomIds: string[] = []
): Promise<RoomOption | null> {
  const startISO = `${sessionDate}T${startTime}:00`;
  const endISO = `${sessionDate}T${endTime}:00`;

  const [priv, grp, trial, roomBook] = await Promise.all([
    supabase
      .from('bookings')
      .select('room_id, start_time, end_time')
      .gte('start_time', startISO)
      .lte('start_time', endISO)
      .in('status', ['confirmed', 'in_progress', 'pending']),
    supabase
      .from('group_class_sessions')
      .select('room_id, session_date, start_time, end_time')
      .eq('session_date', sessionDate)
      .in('status', ['scheduled', 'ongoing']),
    supabase
      .from('trial_class_bookings')
      .select('room_id, selected_date, selected_time, hours')
      .eq('selected_date', sessionDate)
      .not('status', 'in', '(\'cancelled\', \'completed\', \'converted\')'),
    supabase
      .from('room_bookings')
      .select('room_id, start_time, end_time')
      .gte('start_time', startISO)
      .lte('start_time', endISO)
      .in('status', ['confirmed', 'pending']),
  ]);

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const sStart = sh * 60 + sm;
  const sEnd = eh * 60 + em;

  const busy = new Set<string>();

  for (const b of priv.data || []) {
    if (!b.room_id) continue;
    const bStart = new Date(b.start_time);
    const bEnd = new Date(b.end_time);
    const bS = bStart.getHours() * 60 + bStart.getMinutes();
    const bE = bEnd.getHours() * 60 + bEnd.getMinutes();
    if (sStart < bE && sEnd > bS) busy.add(b.room_id);
  }

  for (const g of grp.data || []) {
    if (!g.room_id) continue;
    const [gh, gm] = (g.start_time as string).split(':').map(Number);
    const [geh, gem] = (g.end_time as string).split(':').map(Number);
    const gS = gh * 60 + gm;
    const gE = geh * 60 + gem;
    if (sStart < gE && sEnd > gS) busy.add(g.room_id);
  }

  for (const t of trial.data || []) {
    if (!t.room_id || !t.selected_time) continue;
    const [th, tm] = (t.selected_time as string).split(':').map(Number);
    const tS = th * 60 + tm;
    const tE = tS + (t.hours || 2) * 60;
    if (sStart < tE && sEnd > tS) busy.add(t.room_id);
  }

  for (const rb of roomBook.data || []) {
    if (!rb.room_id) continue;
    const rbStart = new Date(rb.start_time);
    const rbEnd = new Date(rb.end_time);
    const rS = rbStart.getHours() * 60 + rbStart.getMinutes();
    const rE = rbEnd.getHours() * 60 + rbEnd.getMinutes();
    if (sStart < rE && sEnd > rS) busy.add(rb.room_id);
  }

  for (const room of rooms) {
    if (excludeRoomIds.includes(room.id)) continue;
    if (!busy.has(room.id)) return room;
  }
  return null;
}