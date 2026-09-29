// components/ArchiveConfirmModal.tsx
// ⭐ v3.14: Reusable archive confirmation modal
'use client';

import { useState } from 'react';

interface Props {
  isOpen: boolean;
  entityType: 'class' | 'group_class' | 'teacher' | 'student' | 'room' | 'course' | 'other';
  entityName: string;
  entityCode?: string;
  extraNotes?: string[];
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

const TYPE_META: Record<Props['entityType'], { icon: string; label: string }> = {
  class:       { icon: '📚', label: 'Class' },
  group_class: { icon: '👥', label: 'Group Class' },
  teacher:     { icon: '👨‍🏫', label: 'Teacher' },
  student:     { icon: '👨‍🎓', label: 'Student' },
  room:        { icon: '🏫', label: 'Room' },
  course:      { icon: '📖', label: 'Course' },
  other:       { icon: '📦', label: 'Item' },
};

export default function ArchiveConfirmModal({
  isOpen,
  entityType,
  entityName,
  entityCode,
  extraNotes = [],
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const { icon, label } = TYPE_META[entityType];

  async function handleConfirm() {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl">📦</span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">
              Archive {label}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              <span className="mr-1">{icon}</span>
              <strong>{entityName}</strong>
              {entityCode && (
                <span className="ml-2 font-mono text-xs text-gray-400">
                  {entityCode}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
          <p className="font-medium mb-1">This will:</p>
          <ul className="text-xs space-y-0.5 ml-4 list-disc">
            <li>Hide it from the default view</li>
            <li>Keep all history and records</li>
            <li>Allow reactivation later</li>
            {extraNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for archiving *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Cancelled by student request…"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !reason.trim()}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                Archiving…
              </>
            ) : (
              '📦 Archive'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}