// components/TeacherContactInfo.tsx
// ⭐ v3.9: Compact teacher contact block — reused across the app
// ⭐ v3.10: Added TeacherContactInfoById — fetches by teacher id
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface TeacherContactInfoProps {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  teacherType?: string | null;
  compact?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatTeacherType(type: string | null | undefined): {
  label: string;
  color: string;
} | null {
  if (!type) return null;
  const t = String(type).toLowerCase().replace(/[_\s-]/g, '');
  if (t.includes('full')) {
    return { label: '🕐 Full-time', color: 'bg-emerald-100 text-emerald-700' };
  }
  if (t.includes('part')) {
    return { label: '⏰ Part-time', color: 'bg-amber-100 text-amber-700' };
  }
  return { label: type, color: 'bg-gray-100 text-gray-600' };
}

// ─────────────────────────────────────────────────────────────
// Default export — unchanged. Existing callers keep working.
// ─────────────────────────────────────────────────────────────

export default function TeacherContactInfo({
  fullName,
  phone,
  email,
  teacherType,
  compact = false,
  className = '',
}: TeacherContactInfoProps) {
  const typeInfo = formatTeacherType(teacherType);

  if (compact) {
    return (
      <div className={`flex items-center gap-2 flex-wrap text-xs ${className}`}>
        <span className="font-semibold text-gray-800">{fullName}</span>
        {typeInfo && (
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="text-gray-500 hover:text-blue-600 transition"
            onClick={(e) => e.stopPropagation()}
          >
            📞 {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="text-gray-500 hover:text-blue-600 transition truncate max-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            ✉️ {email}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-gray-800 text-sm">{fullName}</span>
        {typeInfo && (
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="hover:text-blue-600 transition"
            onClick={(e) => e.stopPropagation()}
          >
            📞 {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="hover:text-blue-600 transition truncate max-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            ✉️ {email}
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Named export — v3.10 — id-driven wrapper
// Fetches full_name / email / phone / teacher_type by teacher id
// and forwards everything to the default export above.
// ─────────────────────────────────────────────────────────────

interface TeacherContactInfoByIdProps {
  teacherId: string;
  variant?: 'compact' | 'default';
  className?: string;
}

interface TeacherRecord {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  teacher_type: string | null;
}

export function TeacherContactInfoById({
  teacherId,
  variant = 'default',
  className = '',
}: TeacherContactInfoByIdProps) {
  const [rec, setRec] = useState<TeacherRecord | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('full_name,email,phone')
        .eq('id', teacherId)
        .maybeSingle();

      const { data: teacherRow, error: teacherErr } = await supabase
        .from('teachers')
        .select('teacher_type')
        .eq('id', teacherId)
        .maybeSingle();

      if (cancelled) return;

      if (userErr || !userRow) {
        console.warn('[TeacherContactInfoById] user lookup failed:', userErr);
        setFailed(true);
        return;
      }

      if (teacherErr) {
        // Non-fatal — still show name/email/phone.
        console.warn('[TeacherContactInfoById] teacher_type lookup failed:', teacherErr);
      }

      setRec({
        full_name: userRow.full_name ?? 'Unknown',
        email: userRow.email ?? null,
        phone: userRow.phone ?? null,
        teacher_type: teacherRow?.teacher_type ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  if (failed) {
    return (
      <div className={`text-xs text-gray-400 ${className}`}>
        Teacher not found ({teacherId.slice(0, 8)})
      </div>
    );
  }

  if (!rec) {
    return <div className={`text-xs text-gray-300 ${className}`}>Loading…</div>;
  }

  return (
    <TeacherContactInfo
      fullName={rec.full_name ?? 'Unknown'}
      phone={rec.phone}
      email={rec.email}
      teacherType={rec.teacher_type}
      compact={variant === 'compact'}
      className={className}
    />
  );
}