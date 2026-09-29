// components/QuickAddStudentModal.tsx
// ⭐ v3.14b: Minimal student creation — name only required
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (student: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  }) => void;
  defaultName?: string;
}

export default function QuickAddStudentModal({
  isOpen,
  onClose,
  onCreated,
  defaultName = '',
}: Props) {
  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function reset() {
    setFullName(defaultName);
    setEmail('');
    setPhone('');
    setError(null);
  }

  async function handleCreate() {
    if (!fullName.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: insertErr } = await supabase
        .from('users')
        .insert({
          full_name: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          role: 'student',
          is_active: true,
        })
        .select('id, full_name, email, phone')
        .single();

      if (insertErr) throw insertErr;
      if (!data) throw new Error('Failed to create student');

      onCreated(data);
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create student');
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
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">👤 Add Student</h2>
            <p className="text-xs text-gray-500 mt-1">
              Only the name is required. You can fill in the rest later.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. John Tan"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="student@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="+65 9123 4567"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !fullName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : '✅ Create Student'}
          </button>
        </div>
      </div>
    </div>
  );
}