// components/TeacherContactInfo.tsx
// ⭐ v3.9: Compact teacher contact block — reused across the app
'use client';

interface TeacherContactInfoProps {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  teacherType?: string | null;
  compact?: boolean;
  className?: string;
}

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