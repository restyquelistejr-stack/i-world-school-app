// app/dashboard/room-booking/manage/page.tsx - COMPLETE FIX
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { checkRoomConflicts, formatConflicts } from '@/lib/roomConflictChecker';

interface RoomBooking {
  id: string;
  //booking_type: 'trial_lesson' | 'event' | 'meeting' | 'activity'; with trial 
  booking_type:  'event' | 'meeting' | 'activity';
  title: string;
  description: string;
  room_id: string;
  teacher_id: string | null;
  requestor_name: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  student_count: number;
  course_id: string | null;
  module_id: string | null;
  notes: string;
  created_at: string;
  room: { id: string; name: string; capacity: number };
  teacher: { id: string; full_name: string };
  course: { id: string; name: string };
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

interface Teacher {
  id: string;
  full_name: string;
}

export default function ManageRoomBookingsPage() {
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'trial_lesson' | 'event' | 'meeting' | 'activity'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed'>('all');
  const [selectedBooking, setSelectedBooking] = useState<RoomBooking | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load rooms and teachers
      const [roomsRes, teachersRes] = await Promise.all([
        supabase.from('rooms').select('id, name, capacity').eq('is_active', true).order('name'),
        supabase.from('users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).order('full_name'),
      ]);
      
      if (!roomsRes.error) setRooms(roomsRes.data || []);
      if (!teachersRes.error) setTeachers(teachersRes.data || []);

      // Load bookings
      const { data, error } = await supabase
        .from('room_bookings')
        .select(`
          *,
          room:room_id (id, name, capacity),
          teacher:teacher_id (id, full_name),
          course:course_id (id, name)
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setBookings(data || []);
    } catch (error: any) {
      console.error('Error loading room bookings:', error);
      alert('Failed to load room bookings: ' + error.message);
    }
    setLoading(false);
  }

  // ==========================================
  // DELETE BOOKING - FIXED
  // ==========================================
  async function handleDeleteBooking() {
    if (!selectedBooking) {
      alert('No booking selected to delete.');
      return;
    }

    console.log('🗑️ Delete initiated for:', {
      id: selectedBooking.id,
      title: selectedBooking.title,
      type: typeof selectedBooking.id,
      length: selectedBooking.id?.length,
      fullObject: JSON.stringify(selectedBooking, null, 2)
    });

    if (!selectedBooking.id || selectedBooking.id.length < 10) {
      alert('Invalid booking ID. Cannot delete.');
      console.error('Invalid ID:', selectedBooking.id);
      return;
    }

    setDeleting(true);
    try {
      // ✅ First verify the booking exists
      const { data: existing, error: findError } = await supabase
        .from('room_bookings')
        .select('id, title')
        .eq('id', selectedBooking.id);
      
      console.log('🔍 Existing booking check:', { 
        found: existing?.length || 0, 
        error: findError,
        id: selectedBooking.id
      });
      
      if (findError) {
        console.error('Error finding booking:', findError);
        throw findError;
      }
      
      if (!existing || existing.length === 0) {
        console.warn('⚠️ No booking found with ID:', selectedBooking.id);
        alert('Booking not found. It may have already been deleted.');
        setShowDeleteModal(false);
        setSelectedBooking(null);
        loadData();
        setDeleting(false);
        return;
      }
      
      console.log('✅ Found booking to delete:', existing[0]);
      
      // ✅ Perform the deletion
      const { error: deleteError } = await supabase
        .from('room_bookings')
        .delete()
        .eq('id', selectedBooking.id);

      if (deleteError) {
        console.error('❌ Delete error:', deleteError);
        throw deleteError;
      }

      console.log('✅ Room booking deleted successfully!');
      alert('✅ Room booking deleted successfully!');
      setShowDeleteModal(false);
      setSelectedBooking(null);
      loadData();
    } catch (error: any) {
      console.error('❌ Error deleting room booking:', error);
      alert('Failed to delete: ' + error.message);
    }
    setDeleting(false);
  }

  async function handleUpdateBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBooking) return;

    // Check for room conflicts (excluding current booking)
    setCheckingConflicts(true);
    try {
      const startDate = format(parseISO(selectedBooking.start_time), 'yyyy-MM-dd');
      const startTime = format(parseISO(selectedBooking.start_time), 'HH:mm');
      const endTime = format(parseISO(selectedBooking.end_time), 'HH:mm');

      const conflicts = await checkRoomConflicts({
        roomId: selectedBooking.room_id,
        date: startDate,
        startTime: startTime,
        endTime: endTime,
        excludeRoomBookingId: selectedBooking.id,
      });

      if (conflicts.length > 0) {
        const message = `⚠️ Room conflicts detected:\n${formatConflicts(conflicts)}\n\nPlease select a different time or room.`;
        alert(message);
        setCheckingConflicts(false);
        return;
      }
    } catch (error: any) {
      console.error('Error checking conflicts:', error);
      alert('Failed to check room availability: ' + error.message);
      setCheckingConflicts(false);
      return;
    }
    setCheckingConflicts(false);

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('room_bookings')
        .update({
          title: selectedBooking.title,
          booking_type: selectedBooking.booking_type,
          room_id: selectedBooking.room_id,
          teacher_id: selectedBooking.teacher_id,
          requestor_name: selectedBooking.requestor_name,
          start_time: selectedBooking.start_time,
          end_time: selectedBooking.end_time,
          student_count: selectedBooking.student_count,
          notes: selectedBooking.notes,
          status: selectedBooking.status,
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      alert('✅ Room booking updated successfully!');
      setShowEditModal(false);
      setSelectedBooking(null);
      loadData();
    } catch (error: any) {
      console.error('Error updating room booking:', error);
      alert('Failed to update: ' + error.message);
    }
    setUpdating(false);
  }

  const getBookingTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      trial_lesson: '🎯 Trial Lesson',
      event: '🎪 Event',
      meeting: '🤝 Meeting',
      activity: '🏃 Activity',
    };
    return labels[type] || type;
  };

  const getBookingTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      trial_lesson: 'bg-green-100 text-green-700',
      event: 'bg-purple-100 text-purple-700',
      meeting: 'bg-yellow-100 text-yellow-700',
      activity: 'bg-orange-100 text-orange-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '⏳ Pending',
      confirmed: '✅ Confirmed',
      cancelled: '❌ Cancelled',
      completed: '✔️ Completed',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      completed: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredBookings = bookings.filter(booking => {
    if (filterType !== 'all' && booking.booking_type !== filterType) return false;
    if (filterStatus !== 'all' && booking.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏠 Room Bookings</h1>
          <p className="text-sm text-gray-500">Manage all room bookings in the system</p>
        </div>
        <Link href="/dashboard/room-booking">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
            ➕ New Room Booking
          </button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Booking Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="trial_lesson">🎯 Trial Lesson</option>
              <option value="event">🎪 Event</option>
              <option value="meeting">🤝 Meeting</option>
              <option value="activity">🏃 Activity</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">⏳ Pending</option>
              <option value="confirmed">✅ Confirmed</option>
              <option value="cancelled">❌ Cancelled</option>
              <option value="completed">✔️ Completed</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFilterType('all'); setFilterStatus('all'); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requestor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No room bookings found.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getBookingTypeColor(booking.booking_type)}`}>
                        {getBookingTypeLabel(booking.booking_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {booking.title}
                      {booking.description && (
                        <div className="text-xs text-gray-500 truncate max-w-xs">{booking.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.room?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.requestor_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>{format(parseISO(booking.start_time), 'MMM d, yyyy')}</div>
                      <div className="text-xs text-gray-400">
                        {format(parseISO(booking.start_time), 'h:mm a')} - {format(parseISO(booking.end_time), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(booking.status)}`}>
                        {getStatusLabel(booking.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            console.log('📝 Edit clicked for booking:', booking.id, booking.title);
                            setSelectedBooking(booking);
                            setShowEditModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => {
                            console.log('🗑️ Delete clicked for booking:', booking.id, booking.title);
                            setSelectedBooking(booking);
                            setShowDeleteModal(true);
                          }}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">✏️ Edit Room Booking</h2>
              <button
                onClick={() => { setShowEditModal(false); setSelectedBooking(null); }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateBooking} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={selectedBooking.title}
                  onChange={(e) => setSelectedBooking({ ...selectedBooking, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking Type *</label>
                  <select
                    value={selectedBooking.booking_type}
                    onChange={(e) => setSelectedBooking({ ...selectedBooking, booking_type: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="trial_lesson">🎯 Trial Lesson</option>
                    <option value="event">🎪 Event</option>
                    <option value="meeting">🤝 Meeting</option>
                    <option value="activity">🏃 Activity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={selectedBooking.status}
                    onChange={(e) => setSelectedBooking({ ...selectedBooking, status: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">⏳ Pending</option>
                    <option value="confirmed">✅ Confirmed</option>
                    <option value="cancelled">❌ Cancelled</option>
                    <option value="completed">✔️ Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room *</label>
                  <select
                    value={selectedBooking.room_id}
                    onChange={(e) => setSelectedBooking({ ...selectedBooking, room_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} (Cap: {room.capacity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher (Optional)</label>
                  <select
                    value={selectedBooking.teacher_id || ''}
                    onChange={(e) => setSelectedBooking({ ...selectedBooking, teacher_id: e.target.value || null })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={format(parseISO(selectedBooking.start_time), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      const currentTime = format(parseISO(selectedBooking.start_time), 'HH:mm');
                      setSelectedBooking({
                        ...selectedBooking,
                        start_time: `${newDate}T${currentTime}:00`,
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={format(parseISO(selectedBooking.start_time), 'HH:mm')}
                    onChange={(e) => {
                      const currentDate = format(parseISO(selectedBooking.start_time), 'yyyy-MM-dd');
                      setSelectedBooking({
                        ...selectedBooking,
                        start_time: `${currentDate}T${e.target.value}:00`,
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={format(parseISO(selectedBooking.end_time), 'HH:mm')}
                    onChange={(e) => {
                      const currentDate = format(parseISO(selectedBooking.end_time), 'yyyy-MM-dd');
                      setSelectedBooking({
                        ...selectedBooking,
                        end_time: `${currentDate}T${e.target.value}:00`,
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requestor Name</label>
                <input
                  type="text"
                  value={selectedBooking.requestor_name || ''}
                  onChange={(e) => setSelectedBooking({ ...selectedBooking, requestor_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={selectedBooking.notes || ''}
                  onChange={(e) => setSelectedBooking({ ...selectedBooking, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedBooking(null); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating || checkingConflicts}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {checkingConflicts ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Checking availability...
                    </>
                  ) : updating ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ Delete Room Booking</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>"{selectedBooking.title}"</strong>?
              <br />
              <span className="text-sm text-red-500">
                This action cannot be undone.
              </span>
            </p>
            <div className="mb-2 text-xs text-gray-400">
              Booking ID: {selectedBooking.id}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { 
                  console.log('❌ Cancel delete');
                  setShowDeleteModal(false); 
                  setSelectedBooking(null); 
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBooking}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Deleting...
                  </>
                ) : (
                  '🗑️ Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}