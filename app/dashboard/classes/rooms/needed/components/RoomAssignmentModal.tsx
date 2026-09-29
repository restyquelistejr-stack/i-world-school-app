// app/dashboard/classes/rooms/needed/components/RoomAssignmentModal.tsx
// ⭐ PHASE 4: Assign a room to a flagged group session
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';
import { findFreeRoomForSlot, type RoomOption } from '@/lib/roomResolutionService';

interface RoomNeed {
  id: string;
  session_number: number;
  session_date: string;
  start_time: string;
  end_time: string;
  class_name?: string;
  course_name?: string;
  teacher_name?: string;
}

interface Props {
  need: RoomNeed;
  onClose: () => void;
  onAssigned: () => void;
}

export default function RoomAssignmentModal({ need, onClose, onAssigned }: Props) {
  const [loading, setLoading] = useState(true);
  const [allRooms, setAllRooms] = useState<RoomOption[]>([]);
  const [freeRooms, setFreeRooms] = useState<RoomOption[]>([]);
  const [busyRoomIds, setBusyRoomIds] = useState<string[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    setLoading(true);
    setError(null);

    const { data } = await supabase
      .from('rooms')
      .select('id, name, capacity')
      .eq('is_active', true)
      .order('name');

    const rooms = data || [];
    setAllRooms(rooms);

    // For each room, test availability for this exact slot
    const free: RoomOption[] = [];
    const busy: string[] = [];

    for (const r of rooms) {
      const found = await findFreeRoomForSlot(
        need.session_date,
        need.start_time.slice(0, 5),
        need.end_time.slice(0, 5),
        [r]
      );
      if (found) free.push(r);
      else busy.push(r.id);
    }

    setFreeRooms(free);
    setBusyRoomIds(busy);
    setLoading(false);
  }

  async function handleAssign() {
    if (!selectedRoomId) return;
    setSaving(true);
    setError(null);

    const { error: updateErr } = await supabase
      .from('group_class_sessions')
      .update({
        room_id: selectedRoomId,
        needs_attention: false,
        attention_reason: null,
      })
      .eq('id', need.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    onAssigned();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">🏫 Assign Room</h2>
            <p className="text-xs text-gray-500 mt-1">
              Session #{need.session_number} · {format(parseISO(need.session_date), 'EEE, MMM d, yyyy')} · {need.start_time.slice(0, 5)}–{need.end_time.slice(0, 5)}
            </p>
            {need.class_name && (
              <p className="text-xs text-gray-400 mt-0.5">
                {need.class_name}
                {need.course_name && ` · ${need.course_name}`}
                {need.teacher_name && ` · 👨‍🏫 ${need.teacher_name}`}
              </p>
            )}
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
              <div>Checking room availability…</div>
            </div>
          ) : freeRooms.length === 0 ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <div className="font-semibold mb-1">⚠️ No rooms available</div>
              <p className="text-xs">
                All rooms are busy at this time. You may need to move another booking
                or reschedule this session manually.
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-3">
                {freeRooms.length} of {allRooms.length} room(s) available
              </div>

              <div className="space-y-2">
                {freeRooms.map(r => {
                  const isSelected = selectedRoomId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoomId(r.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        {isSelected && (
                          <span className="text-blue-600 text-xs font-medium">✓ Selected</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Capacity: {r.capacity}
                      </div>
                    </button>
                  );
                })}
              </div>

              {busyRoomIds.length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Show {busyRoomIds.length} unavailable room(s)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {allRooms
                      .filter(r => busyRoomIds.includes(r.id))
                      .map(r => (
                        <div
                          key={r.id}
                          className="p-2 rounded border border-gray-100 bg-gray-50 text-xs text-gray-400 line-through"
                        >
                          {r.name} · Capacity {r.capacity}
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedRoomId || saving || freeRooms.length === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                Saving…
              </>
            ) : (
              '✅ Assign Room'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}