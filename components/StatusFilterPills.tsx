// components/StatusFilterPills.tsx
// ⭐ v3.14: Reusable status filter pills with counts
'use client';

import { BUCKET_META, StatusBucket, ALL_BUCKETS } from '@/lib/filters/managementFilters';

interface Props {
  counts: Record<StatusBucket, number>;
  active: Set<StatusBucket>;
  onToggle: (bucket: StatusBucket) => void;
  /** Which buckets to show as options (default: all) */
  visibleBuckets?: StatusBucket[];
}

export default function StatusFilterPills({
  counts,
  active,
  onToggle,
  visibleBuckets = ALL_BUCKETS,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {visibleBuckets.map(bucket => {
        const meta = BUCKET_META[bucket];
        const isOn = active.has(bucket);
        const count = counts[bucket] || 0;

        return (
          <button
            key={bucket}
            onClick={() => onToggle(bucket)}
            title={meta.description}
            className={`px-3 py-1.5 text-xs rounded-full transition flex items-center gap-1.5 border ${
              isOn
                ? `${meta.color} border-transparent font-medium`
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
            <span className={`text-[10px] px-1.5 rounded-full ${
              isOn ? 'bg-white/40' : 'bg-gray-100'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}