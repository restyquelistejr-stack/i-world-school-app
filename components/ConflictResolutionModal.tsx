// components/ConflictResolutionModal.tsx
// ⭐ M4: Reusable conflict resolution modal
// ⭐ v3.9: Shows teacher contact info in group headers
'use client';

import { format, parseISO } from 'date-fns';

export type ConflictResolutionChoice = 'create_as_is' | 'skip_conflicting';

export interface ConflictSessionInfo {
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
  conflictType: string;
  conflictDescription: string;
  teacherName?: string;
  // ⭐ v3.9: teacher contact
  teacherPhone?: string;
  teacherEmail?: string;
  teacherType?: string;
}

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: ConflictSessionInfo[];
  totalSessions: number;
  onCancel: () => void;
  onConfirm: (choice: ConflictResolutionChoice) => void;
}

export default function ConflictResolutionModal({
  isOpen,
  conflicts,
  totalSessions,
  onCancel,
  onConfirm,
}: ConflictResolutionModalProps) {
  if (!isOpen) return null;

  const conflictCount = conflicts.length;
  const skippedTotal = totalSessions - conflictCount;

  // Group by teacher for cleaner display
  const groupedByTeacher = conflicts.reduce((acc, c) => {
    const key = c.teacherName || 'Unknown Teacher';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {} as Record<string, ConflictSessionInfo[]>);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-amber-200 bg-amber-50 rounded-t-lg">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-amber-900">
                {conflictCount} session{conflictCount !== 1 ? 's' : ''} have conflicts
              </h2>
              <p className="text-sm text-amber-700 mt-1">
                You can still create this class. Sessions with conflicts will be flagged
                for later substitute assignment.
              </p>
            </div>
          </div>
        </div>

        {/* Conflict list */}
        <div className="p-6 space-y-4">
          {Object.entries(groupedByTeacher).map(([teacherName, teacherConflicts]) => (
            <div key={teacherName} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* ⭐ v3.9: teacher header with contact info */}
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">👨‍🏫</span>
                  <span className="font-semibold text-gray-800">{teacherName}</span>

                  {teacherConflicts[0]?.teacherType && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-gray-100 text-gray-600">
                      {teacherConflicts[0].teacherType.replace(/_/g, ' ')}
                    </span>
                  )}

                  {teacherConflicts[0]?.teacherPhone && (
                    <a
                      href={`tel:${teacherConflicts[0].teacherPhone}`}
                      className="text-[11px] text-gray-500 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📞 {teacherConflicts[0].teacherPhone}
                    </a>
                  )}

                  {teacherConflicts[0]?.teacherEmail && (
                    <a
                      href={`mailto:${teacherConflicts[0].teacherEmail}`}
                      className="text-[11px] text-gray-500 hover:text-blue-600 truncate max-w-[180px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ✉️ {teacherConflicts[0].teacherEmail}
                    </a>
                  )}

                  <span className="text-xs text-gray-500 ml-auto">
                    {teacherConflicts.length} conflict{teacherConflicts.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {teacherConflicts.map((conflict, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
                    <span className="text-red-500 text-lg mt-0.5">❌</span>
                    <div className="flex-1 text-sm">
                      <div className="font-medium text-gray-800">
                        Session #{conflict.session_number}
                        <span className="text-gray-500 font-normal ml-2">
                          {format(parseISO(conflict.session_date), 'EEE, MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        🕐 {conflict.start_time} - {conflict.end_time}
                      </div>
                      <div className="text-amber-700 text-xs mt-1">
                        → {conflict.conflictDescription}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Resolution options */}
        <div className="px-6 pb-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            How would you like to handle these?
          </p>

          {/* Option A: Create as-is */}
          <button
            onClick={() => onConfirm('create_as_is')}
            className="w-full text-left p-4 rounded-lg border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">✨</span>
              <div className="flex-1">
                <div className="font-semibold text-emerald-900">
                  Create as-is — I'll assign substitutes later
                </div>
                <div className="text-sm text-emerald-700 mt-1">
                  All {totalSessions} sessions will be created.
                  The {conflictCount} conflicting session{conflictCount !== 1 ? 's' : ''} will be
                  flagged ⚠️ and appear in the <strong>Substitute Needed</strong> dashboard.
                </div>
              </div>
            </div>
          </button>

          {/* Option C: Skip conflicting */}
          <button
            onClick={() => onConfirm('skip_conflicting')}
            className="w-full text-left p-4 rounded-lg border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">✂️</span>
              <div className="flex-1">
                <div className="font-semibold text-amber-900">
                  Skip conflicting sessions
                </div>
                <div className="text-sm text-amber-700 mt-1">
                  Class will have <strong>{skippedTotal} sessions</strong> instead of {totalSessions}.
                  Conflicting sessions will not be created.
                </div>
                {skippedTotal < 1 && (
                  <div className="text-xs text-red-600 mt-1 font-medium">
                    ⚠️ All sessions conflict — skipping will leave 0 sessions.
                  </div>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}