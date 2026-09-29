// components/RoomConflictModal.tsx
// ⭐ v3.7: Room conflict resolution modal — detailed conflicts + user choice
'use client';

import { format, parseISO } from 'date-fns';
import type { Conflict } from '@/lib/roomConflictChecker';

interface RoomConflictModalProps {
  isOpen: boolean;
  roomName: string;
  requestedDate: string;
  requestedStart: string;
  requestedEnd: string;
  conflicts: Conflict[];
  onPickAnotherRoom: () => void;
  onPickAnotherTime: () => void;
  onBookAnyway: () => void;
  onCancel: () => void;
}

export default function RoomConflictModal({
  isOpen,
  roomName,
  requestedDate,
  requestedStart,
  requestedEnd,
  conflicts,
  onPickAnotherRoom,
  onPickAnotherTime,
  onBookAnyway,
  onCancel,
}: RoomConflictModalProps) {
  if (!isOpen) return null;

  const getSourceMeta = (type: Conflict['type']) => {
    switch (type) {
      case 'private_booking':
        return { icon: '📚', label: 'Private Class', color: 'bg-emerald-100 text-emerald-700' };
      case 'trial_booking':
        return { icon: '🎯', label: 'Trial Class', color: 'bg-purple-100 text-purple-700' };
      case 'group_session':
        return { icon: '👥', label: 'Group Class', color: 'bg-rose-100 text-rose-700' };
      case 'room_booking':
        return { icon: '🏫', label: 'Room Booking', color: 'bg-gray-100 text-gray-700' };
      case 'teacher_leave':
        return { icon: '🌴', label: 'Teacher Leave', color: 'bg-amber-100 text-amber-700' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                ⚠️ Room Conflicts Detected
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">{roomName}</span> has {conflicts.length} conflicting booking{conflicts.length !== 1 ? 's' : ''} on{' '}
                <span className="font-medium">{format(parseISO(requestedDate), 'EEEE, MMM d, yyyy')}</span>
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-xs text-blue-700">
              <span className="font-semibold">Your requested slot:</span>{' '}
              <span className="font-mono">{requestedStart} – {requestedEnd}</span>
            </div>
          </div>
        </div>

        {/* Conflicts list */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {conflicts.map((c) => {
              const meta = getSourceMeta(c.type);
              return (
                <div
                  key={c.conflictId}
                  className="border border-red-200 bg-red-50/40 rounded-lg p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <span className="text-xl">{meta.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="font-mono text-sm font-bold text-red-700">
                          🔴 {c.start_time} – {c.end_time}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {c.title || meta.label}
                      </div>
                      {c.class_code && (
                        <div className="text-xs font-mono text-gray-500 mt-0.5">
                          {c.class_code}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                        {c.teacher_name && (
                          <span>👨‍🏫 {c.teacher_name}</span>
                        )}
                        {typeof c.student_count === 'number' && c.student_count > 0 && (
                          <span>👥 {c.student_count} student{c.student_count !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendation */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <div className="font-semibold mb-1">💡 Recommendation</div>
            <p>
              Choose a different room or time to avoid double-booking. If you book anyway,
              the booking will be created with <strong>status = pending</strong> so an admin
              can review it.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={onPickAnotherRoom}
              className="flex-1 px-4 py-2.5 bg-white border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition font-medium text-sm flex items-center justify-center gap-2"
            >
              🔄 Pick Another Room
            </button>
            <button
              onClick={onPickAnotherTime}
              className="flex-1 px-4 py-2.5 bg-white border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition font-medium text-sm flex items-center justify-center gap-2"
            >
              ⏰ Pick Another Time
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <button
              onClick={onBookAnyway}
              className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition font-medium text-sm flex items-center justify-center gap-2"
            >
              ⚠️ Book Anyway (create as pending)
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}