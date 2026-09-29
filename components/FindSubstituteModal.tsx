// components/FindSubstituteModal.tsx
// ⭐ M8: Find & assign substitute teacher modal
// ⭐ v3.3: Auto-expand unavailable tier when no one is available; clearer tier headers
'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  findQualifiedSubstitutes,
  assignSubstitute,
  unassignSubstitute,
  type SubstituteCandidate,
  type SubstituteNeed,
} from '@/lib/substituteService';

interface FindSubstituteModalProps {
  isOpen: boolean;
  need: SubstituteNeed | null;
  onClose: () => void;
  onAssigned: () => void;
}

export default function FindSubstituteModal({
  isOpen,
  need,
  onClose,
  onAssigned,
}: FindSubstituteModalProps) {
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showUnavailable, setShowUnavailable] = useState(false);

  useEffect(() => {
    if (isOpen && need) {
      setCandidates([]);
      setSelectedId(null);
      setNotes('');
      setShowUnavailable(false);
      loadCandidates(need);
    }
  }, [isOpen, need?.id]);

  async function loadCandidates(n: SubstituteNeed) {
    setLoading(true);
    try {
      const results = await findQualifiedSubstitutes({
        session_type: n.session_type,
        session_id: n.session_id,
        session_date: n.session_date || '',
        start_time: (n.start_time || '00:00').slice(0, 5),
        end_time: (n.end_time || '00:00').slice(0, 5),
        course_id: n.course_id,
        module_id: n.module_id,
        room_id: n.room_id,
        original_teacher_id: n.original_teacher_id,
      });
      setCandidates(results);

      // Auto-select: already-assigned > first available
      const alreadyAssigned = results.find(c => c.already_assigned);
      const firstAvailable = results.find(c => c.is_available);
      setSelectedId(alreadyAssigned?.teacher_id || firstAvailable?.teacher_id || null);

      // ⭐ v3.3: Auto-expand unavailable section if there are no available candidates
      const availCount = results.filter(c => c.is_available).length;
      if (availCount === 0 && results.length > 0) {
        setShowUnavailable(true);
      }
    } catch (err) {
      console.error('Error loading candidates:', err);
    }
    setLoading(false);
  }

  async function handleAssign() {
    if (!need || !selectedId) {
      alert('Please select a teacher.');
      return;
    }

    const selected = candidates.find(c => c.teacher_id === selectedId);
    if (!selected) return;

    if (!selected.is_available) {
      const issues = selected.availability_issues.join('\n• ');
      const confirmed = confirm(
        `⚠️ ${selected.full_name} has availability issues:\n\n• ${issues}\n\nAssign anyway?`
      );
      if (!confirmed) return;
    }

    setAssigning(true);
    try {
      const result = await assignSubstitute({
        assignment_id: need.id,
        session_type: need.session_type,
        session_id: need.session_id,
        substitute_teacher_id: selectedId,
        notes: notes.trim() || null,
      });

      if (!result.success) {
        alert('❌ Failed to assign: ' + (result.error || 'Unknown error'));
        setAssigning(false);
        return;
      }

      alert(`✅ ${selected.full_name} assigned as substitute!`);
      onAssigned();
      onClose();
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
    }
    setAssigning(false);
  }

  async function handleUnassign() {
    if (!need) return;

    if (!confirm(`Remove the current substitute assignment?`)) return;

    setAssigning(true);
    try {
      const result = await unassignSubstitute({
        assignment_id: need.id,
        session_type: need.session_type,
        session_id: need.session_id,
        reason: 'admin_unassigned',
      });

      if (!result.success) {
        alert('❌ Failed to unassign: ' + (result.error || 'Unknown error'));
        setAssigning(false);
        return;
      }

      alert('✅ Substitute un-assigned. Session is back in the pending queue.');
      onAssigned();
      onClose();
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
    }
    setAssigning(false);
  }

  if (!isOpen || !need) return null;

  const alreadyAssignedCandidates = candidates.filter(c => c.already_assigned);
  const availableCandidates = candidates.filter(c => c.is_available && !c.already_assigned);
  const unavailableCandidates = candidates.filter(c => !c.is_available && !c.already_assigned);

  const getTypeLabel = (t: string) => ({
    trial_private: '🎯 Trial Private',
    trial_group: '👥 Trial Group',
    private_session: '📚 Private Class',
    group_session: '👥 Group Class',
  }[t] || t);

  const formatTimeRange = (start: string | null, end: string | null) => {
    if (!start || !end) return 'N/A';
    return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
  };

  const renderCandidateCard = (c: SubstituteCandidate) => {
    const isSelected = selectedId === c.teacher_id;
    const borderClass = c.already_assigned
      ? 'border-emerald-400 bg-emerald-50'
      : c.is_available
      ? isSelected
        ? 'border-blue-500 bg-blue-50'
        : 'border-gray-200 hover:border-blue-300'
      : isSelected
      ? 'border-amber-500 bg-amber-50'
      : 'border-gray-200 bg-gray-50 hover:border-amber-300';

    return (
      <button
        key={c.teacher_id}
        onClick={() => setSelectedId(c.teacher_id)}
        className={`w-full text-left p-3 rounded-lg border-2 transition ${borderClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{c.full_name}</span>

              {c.already_assigned && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✅ Currently Assigned
                </span>
              )}
              {!c.already_assigned && c.is_available && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-800 border border-green-300">
                  ✅ Available
                </span>
              )}
              {!c.already_assigned && !c.is_available && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-800 border border-red-300">
                  ⚠️ Unavailable
                </span>
              )}
              {c.qualification_source === 'module' && (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700">
                  📖 Module-qualified
                </span>
              )}
              {c.qualification_source === 'course' && (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700">
                  📚 Course-qualified
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
              {c.specialization && <span>📚 {c.specialization}</span>}
              {c.years_experience !== null && c.years_experience !== undefined && c.years_experience > 0 && (
                <span>⏱ {c.years_experience}y exp</span>
              )}
            </div>

            {c.availability_issues.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {c.availability_issues.map((issue, idx) => (
                  <li key={idx} className="text-xs text-red-600 flex items-start gap-1">
                    <span>•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
          }`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="currentColor">
                <path d="M4 9l-3-3 1.5-1.5L4 6l5-5L10.5 2.5 4 9z"/>
              </svg>
            )}
          </div>
        </div>
      </button>
    );
  };

  const isCurrentlyAssigned = candidates.some(c => c.already_assigned);
  const selectedCandidate = candidates.find(c => c.teacher_id === selectedId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              🔍 Find Substitute
            </h2>
            <div className="text-sm text-gray-600 mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                  {getTypeLabel(need.session_type)}
                </span>
                {need.class_code && (
                  <span className="font-mono text-xs text-gray-500">{need.class_code}</span>
                )}
              </div>
              {need.course_name && (
                <div className="text-xs text-gray-600">
                  📚 {need.course_name}
                  {need.module_name && ` · 📖 ${need.module_name}`}
                </div>
              )}
              <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                <span>📅 {need.session_date ? format(parseISO(need.session_date), 'EEE, MMM d, yyyy') : 'N/A'}</span>
                <span>🕐 {formatTimeRange(need.start_time, need.end_time)}</span>
                {need.room_name && <span>🏠 {need.room_name}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Original teacher: <strong>👨‍🏫 {need.original_teacher_name || 'Unknown'}</strong>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3"></span>
              <span className="text-sm text-gray-600">Finding qualified teachers...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">😕</div>
              <p className="text-gray-700 font-medium">No qualified teachers found</p>
              <p className="text-sm text-gray-500 mt-1">
                No teachers are assigned to this module or its parent course.
              </p>
            </div>
          ) : (
            <>
              {alreadyAssignedCandidates.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    ✅ Currently Assigned
                  </h3>
                  <div className="space-y-2">
                    {alreadyAssignedCandidates.map(renderCandidateCard)}
                  </div>
                </div>
              )}

              {availableCandidates.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    ✅ Qualified & Available ({availableCandidates.length})
                  </h3>
                  <div className="space-y-2">
                    {availableCandidates.map(renderCandidateCard)}
                  </div>
                </div>
              )}

              {unavailableCandidates.length > 0 && (
                <div className="mb-2">
                  <button
                    onClick={() => setShowUnavailable(!showUnavailable)}
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-700 flex items-center gap-2"
                  >
                    <span>⚠️ Unavailable ({unavailableCandidates.length})</span>
                    <span className={`transition-transform ${showUnavailable ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                  </button>
                  {showUnavailable && (
                    <div className="space-y-2 mt-2">
                      {unavailableCandidates.map(renderCandidateCard)}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g., covering for sick leave, prep materials shared..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-between gap-3">
          <div>
            {isCurrentlyAssigned && (
              <button
                onClick={handleUnassign}
                disabled={assigning}
                className="px-4 py-2 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition disabled:opacity-50"
              >
                ⏏️ Un-assign
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={assigning}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={assigning || !selectedId || loading}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 flex items-center gap-2 ${
                selectedCandidate?.is_available
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {assigning ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Assigning...
                </>
              ) : selectedCandidate?.already_assigned ? (
                <>✓ Keep Assigned</>
              ) : selectedCandidate?.is_available ? (
                <>✅ Assign Substitute</>
              ) : (
                <>⚠️ Assign Anyway</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}