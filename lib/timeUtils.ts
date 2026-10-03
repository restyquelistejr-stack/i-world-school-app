// lib/timeUtils.ts
// ⭐ Single source of truth for time handling.
// ⭐ NEVER use `new Date(supabaseString)` or `.toISOString()` on session times.

/**
 * Extract "YYYY-MM-DD" from any Supabase date/timestamp string.
 * "2026-09-25"          → "2026-09-25"
 * "2026-09-25T17:00:00" → "2026-09-25"
 */
export function extractDate(ts: string | null | undefined): string {
  if (!ts) return '';
  return String(ts).slice(0, 10);
}

/**
 * Extract "HH:mm" from any Supabase timestamp or TIME string.
 * "2026-09-25T17:00:00" → "17:00"
 * "2026-09-25 17:00:00" → "17:00"
 * "17:00:00"            → "17:00"
 * "17:00"               → "17:00"
 */
export function extractTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const s = String(ts);
  if (s.length >= 16 && (s[10] === 'T' || s[10] === ' ')) return s.slice(11, 16);
  return s.slice(0, 5);
}

/**
 * Build a canonical Supabase timestamp string from date + time.
 * makeTimestamp("2026-11-11", "13:00") → "2026-11-11T13:00:00"
 * NO Date object involved, NO timezone conversion.
 */
export function makeTimestamp(dateStr: string, timeStr: string): string {
  const d = String(dateStr).slice(0, 10);
  const t = String(timeStr).slice(0, 5);
  return `${d}T${t}:00`;
}

/**
 * Add minutes to a "HH:mm" string. Pure math, no Date object.
 * addMinutesToTime("13:00", 120) → "15:00"
 */
export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = String(timeStr).slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/**
 * Add hours to a "HH:mm" string.
 */
export function addHoursToTime(timeStr: string, hours: number): string {
  return addMinutesToTime(timeStr, Math.round(hours * 60));
}

/**
 * Compute the end-time string given a start time and duration in hours.
 */
export function computeEndTime(startTime: string, durationHours: number): string {
  return addHoursToTime(startTime, durationHours);
}

/**
 * Today's date as "YYYY-MM-DD" in LOCAL time (no UTC shift).
 */
export function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" string into a JS Date at LOCAL midnight.
 * Use this ONLY for calendar arithmetic (e.g., iterating days).
 * NEVER call .toISOString() on the result for storage.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Format a JS Date as "YYYY-MM-DD" using LOCAL components (no UTC shift).
 * Use this instead of date.toISOString().split('T')[0].
 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compute hours between two "HH:mm" strings (exact, no rounding).
 */
export function hoursBetween(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}