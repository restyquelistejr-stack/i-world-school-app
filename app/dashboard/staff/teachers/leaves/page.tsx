// app/dashboard/staff/teachers/leaves/page.tsx
// ⭐ M5: Auto-flag affected sessions on leave approval + Un-approve support
// ⭐ M5 FIX: Pass staff_id + date range to unflag for robust matching
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  scanAndFlagAffectedSessions,
  unflagSessionsForLeave,
} from '@/lib/substituteService';

interface Leave {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  is_active: boolean;
  created_at: string;
}

const LEAVE_TYPES = ['annual', 'sick', 'personal', 'emergency', 'other'];

export default function TeacherLeavesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teacherId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [leaves, setLeaves] = useState<Leave[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    leave_type: 'annual',
    reason: '',
  });

  useEffect(() => {
    if (teacherId) {
      loadData();
    } else {
      router.push('/dashboard/staff/teachers');
    }
  }, [teacherId]);

  async function loadData() {
    setLoading(true);

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', teacherId)
        .single();

      if (userData) setTeacherName(userData.full_name);

      const { data: leaveData, error: leaveError } = await supabase
        .from('staff_leaves')
        .select('*')
        .eq('staff_id', teacherId)
        .eq('is_active', true)
        .order('start_date', { ascending: false });

      if (leaveError) {
        if (leaveError.message.includes('status')) {
          console.warn('Status column missing, loading without status...');
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('staff_leaves')
            .select('id, start_date, end_date, leave_type, reason, is_active, created_at')
            .eq('staff_id', teacherId)
            .eq('is_active', true)
            .order('start_date', { ascending: false });

          if (!fallbackError && fallbackData) {
            setLeaves(fallbackData.map((l: any) => ({ ...l, status: 'approved' })));
          }
        } else {
          console.warn('Error loading leaves:', leaveError.message);
          setLeaves([]);
        }
      } else {
        setLeaves(leaveData || []);
      }
    } catch (error: any) {
      console.error('Error loading leaves:', error);
      setLeaves([]);
    }

    setLoading(false);
  }

  async function handleAddLeave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('❌ You must be logged in to create a leave request.');
        setSaving(false);
        return;
      }

      const leaveData = {
        staff_id: teacherId,
        start_date: formData.start_date,
        end_date: formData.end_date,
        leave_type: formData.leave_type,
        reason: formData.reason || null,
        status: 'pending',
        is_active: true,
      };

      const { data, error } = await supabase
        .from('staff_leaves')
        .insert(leaveData)
        .select();

      if (error) {
        console.error('Supabase error:', error);

        if (error.message.includes('row-level security')) {
          alert('❌ Permission denied. Please contact your administrator to enable leave requests.');
        } else if (error.message.includes('status')) {
          const { data: retryData, error: retryError } = await supabase
            .from('staff_leaves')
            .insert({
              staff_id: teacherId,
              start_date: formData.start_date,
              end_date: formData.end_date,
              leave_type: formData.leave_type,
              reason: formData.reason || null,
              is_active: true,
            })
            .select();

          if (retryError) {
            alert('❌ Error creating leave: ' + retryError.message);
          } else {
            alert('✅ Leave request submitted successfully!');
            setShowForm(false);
            setFormData({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
            loadData();
          }
        } else {
          alert('❌ Error creating leave: ' + error.message);
        }
        setSaving(false);
        return;
      }

      alert('✅ Leave request submitted successfully!');
      setShowForm(false);
      setFormData({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
      loadData();
    } catch (error: any) {
      console.error('Error creating leave:', error);
      alert('❌ Error: ' + (error.message || 'Something went wrong'));
    }

    setSaving(false);
  }

  // ==========================================
  // ⭐ M5: UPDATE LEAVE STATUS WITH AUTO-FLAG/UNFLAG
  // ==========================================
  async function updateLeaveStatus(
    leaveId: string,
    newStatus: 'approved' | 'rejected' | 'cancelled'
  ) {
    const leave = leaves.find(l => l.id === leaveId);
    if (!leave) {
      alert('❌ Leave record not found.');
      return;
    }

    const previousStatus = leave.status;

    // ── Confirmation copy per transition ──
    let confirmMsg = '';
    if (newStatus === 'approved' && previousStatus === 'pending') {
      confirmMsg = 'Approve this leave request?\n\nThe system will scan all future sessions for this teacher and flag any that fall within the leave period for substitute assignment.';
    } else if (newStatus === 'rejected' && previousStatus === 'pending') {
      confirmMsg = 'Reject this leave request?\n\nNo sessions will be flagged.';
    } else if (newStatus === 'rejected' && previousStatus === 'approved') {
      confirmMsg = '⚠️ Un-approve this leave?\n\nThis will:\n• Set the leave back to rejected\n• Remove any PENDING substitute assignments\n• Clear the ⚠️ flags on affected sessions\n\nAlready-assigned substitutes will NOT be affected. Continue?';
    } else if (newStatus === 'approved' && previousStatus === 'rejected') {
      confirmMsg = 'Re-approve this leave?\n\nThe system will re-scan sessions and re-flag any that still need substitutes.';
    } else {
      confirmMsg = `Change leave status to ${newStatus}?`;
    }

    if (!confirm(confirmMsg)) return;

    setProcessing(leaveId);

    try {
      // ⭐ 1. Update the leave status
      const { error } = await supabase
        .from('staff_leaves')
        .update({ status: newStatus })
        .eq('id', leaveId);

      if (error) {
        alert('❌ Error updating leave: ' + error.message);
        setProcessing(null);
        return;
      }

      // ==========================================
      // ⭐ M5: Auto-flag OR unflag sessions based on transition
      // ==========================================
      let scanResult: any = null;
      let unflagResult: any = null;

      try {
        // Case 1: Approving (from pending OR from rejected — re-approve)
        if (newStatus === 'approved' && previousStatus !== 'approved') {
          console.log(`🔍 Auto-scanning sessions for leave ${leaveId}...`);

          scanResult = await scanAndFlagAffectedSessions(
            teacherId!,
            leaveId,
            leave.start_date,
            leave.end_date,
            leave.leave_type
          );

          console.log('✅ Scan result:', scanResult);
        }

        // Case 2: Un-approving (approved → rejected)
        // ⭐ Pass staffId + date range so we can catch M4-style assignments too
        else if (previousStatus === 'approved' && newStatus === 'rejected') {
          console.log(`🔄 Unflagging sessions for leave ${leaveId}...`);

          unflagResult = await unflagSessionsForLeave(
            leaveId,
            teacherId!,          // staff id
            leave.start_date,    // YYYY-MM-DD
            leave.end_date       // YYYY-MM-DD
          );

          console.log('✅ Unflag result:', unflagResult);
        }
      } catch (scanErr) {
        console.error('⚠️ Scan/unflag error (leave updated, but scan failed):', scanErr);
      }

      // ==========================================
      // ⭐ Show result to the user
      // ==========================================
      let message = '';

      if (newStatus === 'approved') {
        message = previousStatus === 'rejected' ? '✅ Leave re-approved!' : '✅ Leave approved!';

        if (scanResult) {
          if (scanResult.flagged > 0) {
            message += `\n\n⚠️ ${scanResult.flagged} session(s) need substitutes.`;
            if (scanResult.skipped > 0) {
              message += `\n(${scanResult.skipped} already flagged)`;
            }
            message += `\n\nVisit the Substitute Needed dashboard to assign substitutes.`;
          } else if (scanResult.scanned > 0) {
            message += `\n\n✓ No sessions require substitutes for this leave period.`;
          } else {
            message += `\n\n✓ No future sessions found in this leave period.`;
          }

          if (scanResult.failed > 0) {
            message += `\n\n⚠️ ${scanResult.failed} session(s) failed to flag — check console.`;
          }
        }
      } else if (newStatus === 'rejected' && previousStatus === 'approved') {
        message = '✅ Leave un-approved!';

        if (unflagResult) {
          if (unflagResult.unassigned > 0) {
            message += `\n\n🔄 Removed ${unflagResult.unassigned} pending substitute assignment(s).`;
            message += `\nSession flags have been cleared.`;
          } else {
            message += `\n\n✓ No pending substitute assignments to remove.`;
          }

          if (unflagResult.failed > 0) {
            message += `\n\n⚠️ ${unflagResult.failed} assignment(s) failed to clear — check console.`;
          }
        }
      } else {
        message = '✅ Leave rejected!';
      }

      alert(message);
      loadData();

    } catch (error: any) {
      console.error('Error in updateLeaveStatus:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setProcessing(null);
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getLeaveTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      annual: 'Annual Leave',
      sick: 'Sick Leave',
      personal: 'Personal Leave',
      emergency: 'Emergency Leave',
      other: 'Other',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/staff/teachers/view?id=${teacherId}`}>
            <button className="text-gray-600 hover:text-gray-900">← Back to Profile</button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            🌴 {teacherName}'s Leaves
          </h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? 'Cancel' : '+ Request Leave'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Request Leave</h3>
          <form onSubmit={handleAddLeave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date *</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  min={formData.start_date}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type *</label>
                <select
                  value={formData.leave_type}
                  onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {LEAVE_TYPES.map((type) => (
                    <option key={type} value={type}>{getLeaveTypeLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional reason"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {leaves.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No leave requests found.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {leaves.map((leave) => {
              const isProcessing = processing === leave.id;

              return (
                <div key={leave.id} className="p-4 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{getLeaveTypeLabel(leave.leave_type)}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(leave.status || 'approved')}`}>
                          {(leave.status || 'approved').toUpperCase()}
                        </span>
                        {isProcessing && (
                          <span className="flex items-center gap-1 text-xs text-blue-600">
                            <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full"></span>
                            Processing...
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {leave.start_date} → {leave.end_date}
                      </div>
                      {leave.reason && (
                        <div className="text-sm text-gray-600 mt-1">{leave.reason}</div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      {leave.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateLeaveStatus(leave.id, 'approved')}
                            disabled={isProcessing}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                          >
                            {isProcessing ? (
                              <>
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                                Processing...
                              </>
                            ) : (
                              <>✅ Approve</>
                            )}
                          </button>
                          <button
                            onClick={() => updateLeaveStatus(leave.id, 'rejected')}
                            disabled={isProcessing}
                            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                          >
                            ❌ Reject
                          </button>
                        </>
                      )}

                      {leave.status === 'approved' && (
                        <button
                          onClick={() => updateLeaveStatus(leave.id, 'rejected')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          {isProcessing ? (
                            <>
                              <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                              Processing...
                            </>
                          ) : (
                            <>↩️ Un-approve</>
                          )}
                        </button>
                      )}

                      {leave.status === 'rejected' && (
                        <button
                          onClick={() => updateLeaveStatus(leave.id, 'approved')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          {isProcessing ? (
                            <>
                              <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                              Processing...
                            </>
                          ) : (
                            <>✅ Re-approve</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <div className="font-semibold mb-1">ℹ️ How leave approval works</div>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Approve</strong> → System scans all future sessions for this teacher, flags any within the leave period, and creates pending substitute assignments.</li>
          <li><strong>Reject</strong> → No changes to sessions.</li>
          <li><strong>Un-approve</strong> → Reverses the flags on sessions and cancels <em>pending</em> substitute assignments. Already-assigned substitutes are preserved.</li>
          <li><strong>Re-approve</strong> → Re-scans and re-flags sessions that still don't have a substitute assigned.</li>
        </ul>
      </div>
    </div>
  );
}