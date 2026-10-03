// components/SessionRosterModal.tsx
// ⭐ v3.14b: Attendance marking modal — teacher + student roster
// ⭐ v3.15: Payroll override toggle for the teacher row (is_rendered + reason)
'use client';

import { useEffect, useState } from 'react';
import {
  getSessionRoster,
  markAttendanceBulk,
  ATTENDANCE_LABELS,
  type SessionType,
  type AttendanceStatus,
  type RosterEntry,
  type MarkAttendanceInput,
} from '@/lib/attendanceService';

interface Props {
  isOpen: boolean;
  sessionType: SessionType;
  sessionId: string;
  sessionLabel: string;
  onClose: () => void;
  onSaved?: () => void;
  actorId?: string;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'no_show'];

// ⭐ v3.15 — per-teacher override draft state
type RenderedMode = 'auto' | 'paid' | 'unpaid';

export default function SessionRosterModal({
  isOpen,
  sessionType,
  sessionId,
  sessionLabel,
  onClose,
  onSaved,
  actorId,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⭐ v3.15 — teacher payroll override draft
  const [renderedMode, setRenderedMode] = useState<RenderedMode>('auto');
  const [overrideReason, setOverrideReason] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    loadRoster();
  }, [isOpen, sessionType, sessionId]);

  async function loadRoster() {
    setLoading(true);
    setError(null);
    const res = await getSessionRoster(sessionType, sessionId);
    if (!res.success || !res.roster) {
      setError(res.error || 'Failed to load roster');
      setLoading(false);
      return;
    }
    setRoster(res.roster);

    const initial: Record<string, AttendanceStatus> = {};
    res.roster.forEach(r => {
      initial[r.id] = r.status;
    });
    setDraft(initial);

    // ⭐ v3.15 — initialize override draft from the teacher row
    const teacherRow = res.roster.find(r => r.attendee_type === 'teacher');
    if (teacherRow) {
      if (teacherRow.is_rendered === true) setRenderedMode('paid');
      else if (teacherRow.is_rendered === false) setRenderedMode('unpaid');
      else setRenderedMode('auto');
      setOverrideReason(teacherRow.override_reason || '');
    } else {
      setRenderedMode('auto');
      setOverrideReason('');
    }

    setLoading(false);
  }

  function setStatus(rowId: string, status: AttendanceStatus) {
    setDraft(prev => ({ ...prev, [rowId]: status }));
  }

  function markAllStudents(status: AttendanceStatus) {
    setDraft(prev => {
      const next = { ...prev };
      roster.forEach(r => {
        if (r.attendee_type === 'student' && r.status !== 'not_expected') {
          next[r.id] = status;
        }
      });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const changes: MarkAttendanceInput[] = [];

    // Status changes
    roster.forEach(r => {
      const newStatus = draft[r.id];
      if (newStatus && newStatus !== r.status) {
        changes.push({
          session_type: r.session_type,
          session_id: r.session_id,
          attendee_type: r.attendee_type,
          attendee_id: r.attendee_id,
          status: newStatus,
          actor_id: actorId,
        });
      }
    });

    // ⭐ v3.15 — teacher override change (independent of status change)
    const teacherRow = roster.find(r => r.attendee_type === 'teacher');
    if (teacherRow) {
      const desired: boolean | null =
        renderedMode === 'paid' ? true : renderedMode === 'unpaid' ? false : null;

      const currentDesired: boolean | null =
        teacherRow.is_rendered === true ? true
        : teacherRow.is_rendered === false ? false
        : null;

      const reasonChanged = (overrideReason || '') !== (teacherRow.override_reason || '');

      if (desired !== currentDesired || reasonChanged) {
        // If the teacher row isn't already in `changes`, add a status entry
        // so that the upsert touches the row. Use current status.
        const existing = changes.find(
          c =>
            c.session_type === teacherRow.session_type &&
            c.session_id === teacherRow.session_id &&
            c.attendee_type === teacherRow.attendee_type &&
            c.attendee_id === teacherRow.attendee_id
        );

        if (existing) {
          existing.is_rendered = desired;
          existing.override_reason = desired === null ? null : (overrideReason || null);
        } else {
          changes.push({
            session_type: teacherRow.session_type,
            session_id: teacherRow.session_id,
            attendee_type: teacherRow.attendee_type,
            attendee_id: teacherRow.attendee_id,
            status: (draft[teacherRow.id] || teacherRow.status) as AttendanceStatus,
            actor_id: actorId,
            is_rendered: desired,
            override_reason: desired === null ? null : (overrideReason || null),
          });
        }
      }
    }

    if (changes.length === 0) {
      setSaving(false);
      onClose();
      return;
    }

    const res = await markAttendanceBulk(changes);
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Failed to save attendance');
      return;
    }

    onSaved?.();
    onClose();
  }

  if (!isOpen) return null;

  const teacher = roster.find(r => r.attendee_type === 'teacher');
  const students = roster.filter(r => r.attendee_type === 'student' && r.status !== 'not_expected');
  const notExpected = roster.filter(r => r.attendee_type === 'student' && r.status === 'not_expected');

  // ⭐ v3.15 — reason required only when overriding (not when auto)
  const reasonRequired = renderedMode !== 'auto' && overrideReason.trim().length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">📋 Mark Attendance</h2>
            <p className="text-xs text-gray-500 mt-1">{sessionLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3"></div>
              <div>Loading roster…</div>
            </div>
          ) : roster.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
              No attendance rows found for this session.
            </div>
          ) : (
            <>
              {/* Teacher section */}
              {teacher && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    👨‍🏫 Teacher
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800">{teacher.attendee_name}</div>
                        <div className="text-xs text-gray-500">{teacher.attendee_email || '—'}</div>
                      </div>
                      <select
                        value={draft[teacher.id] || teacher.status}
                        onChange={(e) => setStatus(teacher.id, e.target.value as AttendanceStatus)}
                        className="px-3 py-1.5 border rounded-lg text-sm bg-white"
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{ATTENDANCE_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>

                    {/* ⭐ v3.15 — Payroll override */}
                    <div className="border-t border-gray-200 pt-3">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
                        💰 Payroll (Teacher Hours Report)
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <button
                          type="button"
                          onClick={() => setRenderedMode('auto')}
                          className={`px-2.5 py-1 text-xs rounded-md border ${
                            renderedMode === 'auto'
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          🤖 Auto (from status)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenderedMode('paid')}
                          className={`px-2.5 py-1 text-xs rounded-md border ${
                            renderedMode === 'paid'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          ✅ Paid
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenderedMode('unpaid')}
                          className={`px-2.5 py-1 text-xs rounded-md border ${
                            renderedMode === 'unpaid'
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                          }`}
                        >
                          ❌ Not paid
                        </button>
                      </div>

                      {renderedMode === 'auto' ? (
                        <div className="text-[11px] text-gray-400 italic">
                          Report will use the attendance status above.
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder={
                            renderedMode === 'paid'
                              ? 'Reason (required) — e.g. covered extra session'
                              : 'Reason (required) — e.g. no-show, unpaid leave'
                          }
                          className={`w-full px-2.5 py-1.5 border rounded-md text-xs ${
                            reasonRequired ? 'border-red-300 bg-red-50/40' : 'border-gray-300'
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Students section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase">
                    👨‍🎓 Students ({students.length})
                  </div>
                  {students.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => markAllStudents('present')}
                        className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                      >
                        ✅ All present
                      </button>
                      <button
                        type="button"
                        onClick={() => markAllStudents('absent')}
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        ❌ All absent
                      </button>
                    </div>
                  )}
                </div>

                {students.length === 0 ? (
                  <div className="p-3 bg-gray-50 rounded text-xs text-gray-500 italic">
                    No students expected for this session.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {students.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                      >
                        <div>
                          <div className="font-medium text-gray-800">{s.attendee_name}</div>
                          <div className="text-xs text-gray-500">{s.attendee_email || '—'}</div>
                        </div>
                        <select
                          value={draft[s.id] || s.status}
                          onChange={(e) => setStatus(s.id, e.target.value as AttendanceStatus)}
                          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
                        >
                          {STATUS_OPTIONS.map(st => (
                            <option key={st} value={st}>{ATTENDANCE_LABELS[st]}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Not expected (collapsed) */}
              {notExpected.length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Show {notExpected.length} not-expected student(s)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {notExpected.map(s => (
                      <div
                        key={s.id}
                        className="p-2 rounded border border-gray-100 bg-gray-50 text-xs text-gray-400"
                      >
                        {s.attendee_name} — withdrawn from this session
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || roster.length === 0 || reasonRequired}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                Saving…
              </>
            ) : (
              '✅ Save Attendance'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}