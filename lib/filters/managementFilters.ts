// lib/filters/managementFilters.ts
// ⭐ v3.14: Centralized status bucket logic for Management list views

export type StatusBucket = 'active' | 'completed' | 'past' | 'cancelled' | 'archived';

export const ALL_BUCKETS: StatusBucket[] = [
  'active', 'completed', 'past', 'cancelled', 'archived',
];

export const BUCKET_META: Record<StatusBucket, {
  label: string;
  icon: string;
  color: string;         // tailwind classes for active state
  description: string;
}> = {
  active: {
    label: 'Active',
    icon: '🟢',
    color: 'bg-emerald-100 text-emerald-800',
    description: 'Currently scheduled or in progress',
  },
  completed: {
    label: 'Completed',
    icon: '✅',
    color: 'bg-teal-100 text-teal-800',
    description: 'Finished successfully',
  },
  past: {
    label: 'Past',
    icon: '⏳',
    color: 'bg-gray-100 text-gray-700',
    description: 'Past end date, not marked complete',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '🚫',
    color: 'bg-red-100 text-red-700',
    description: 'Cancelled — hidden by default',
  },
  archived: {
    label: 'Archived',
    icon: '📦',
    color: 'bg-amber-100 text-amber-800',
    description: 'Manually archived — reactivatable',
  },
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Classify a class-like row (private class or scheduled group class).
 */
export function classifyClass(row: {
  is_deleted?: boolean | null;
  status: string;
  end_date?: string | null;
}): StatusBucket {
  if (row.is_deleted) return 'archived';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'completed') return 'completed';
  if (row.end_date && row.end_date < today()) return 'past';
  return 'active';
}

/**
 * Classify a person-like row (user, room, course, module).
 * These don't have "past" — only active/inactive/archived.
 */
export function classifyPerson(row: {
  is_deleted?: boolean | null;
  is_active?: boolean | null;
}): StatusBucket {
  if (row.is_deleted) return 'archived';
  if (row.is_active === false) return 'cancelled';   // treat inactive as "cancelled" bucket for filtering
  return 'active';
}

/**
 * Count rows per bucket.
 */
export function countBuckets<T>(
  rows: T[],
  classifier: (row: T) => StatusBucket
): Record<StatusBucket, number> {
  const counts: Record<StatusBucket, number> = {
    active: 0, completed: 0, past: 0, cancelled: 0, archived: 0,
  };
  for (const row of rows) {
    counts[classifier(row)]++;
  }
  return counts;
}

/**
 * Filter rows to only those in the active filter set.
 */
export function filterByBuckets<T>(
  rows: T[],
  classifier: (row: T) => StatusBucket,
  activeBuckets: Set<StatusBucket>
): T[] {
  return rows.filter(row => activeBuckets.has(classifier(row)));
}