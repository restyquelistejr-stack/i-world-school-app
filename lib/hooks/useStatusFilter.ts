// lib/hooks/useStatusFilter.ts
// ⭐ v3.14: Persist status bucket filter selection per page in localStorage
'use client';

import { useEffect, useState } from 'react';
import type { StatusBucket } from '@/lib/filters/managementFilters';

export function useStatusFilter(
  storageKey: string,
  defaultBuckets: StatusBucket[] = ['active']
) {
  const [active, setActive] = useState<Set<StatusBucket>>(
    new Set(defaultBuckets)
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid: StatusBucket[] = parsed.filter((k: any) =>
          ['active', 'completed', 'past', 'cancelled', 'archived'].includes(k)
        );
        if (valid.length > 0) {
          setActive(new Set(valid));
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...active]));
    } catch {
      // ignore
    }
  }, [active, storageKey]);

  const toggle = (bucket: StatusBucket) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      if (next.size === 0) next.add('active');
      return next;
    });
  };

  const reset = () => setActive(new Set(defaultBuckets));

  return { active, toggle, setActive, reset };
}

export default useStatusFilter;
