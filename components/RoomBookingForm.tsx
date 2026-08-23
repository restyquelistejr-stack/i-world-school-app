'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RoomBookingService, RoomBooking } from '@/lib/roomBookingService';
import { format } from 'date-fns';

interface Room {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
}

interface Course {
  id: string;
  name: string;
}

interface Module {
  id: string;
  title: string;
  level: string;
}

type BookingType = 'trial_lesson' | 'event' | 'meeting' | 'activity';

export default function RoomBookingForm() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [findingRooms, setFindingRooms] = useState(false);

  const [formData, setFormData] = useState({
    booking_type: 'trial_lesson' as BookingType,
    title: '',
    description: '',
    room_id: '',
    teacher_id: '',
    requestor_name: '',
    start_time: '',
    end_time: '',
    student_count: 1,
    course_id: '',
    module_id: '',
    event_type: '',
    attendees: '',
    notes: '',
    is_recurring: false,
    recurrence_rule: '',
    recurrence_end_date: '',
  });

  useEffect(() => {
    loadFormData();
  }, []);

  useEffect(() => {
    if (formData.start_time && formData.end_time && formData.student_count > 0) {
      const timer = setTimeout(() => {
        findAvailableRooms();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setAvailableRooms([]);
    }
  }, [formData.start_time, formData.end_time, formData.student_count]);

  const loadFormData = async () => {
    setLoading(true);
    try {
      const [roomsRes, teachersRes, coursesRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('is_active', true).order('name'),
        supabase.from('users').select('id, full_name, email').eq('role', 'teacher').eq('is_active', true).order('full_name'),
        supabase.from('courses').select('id, name').eq('is_active', true).order('name'),
      ]);

      if (roomsRes.data) setRooms(roomsRes.data);
      if (teachersRes.data) setTeachers(teachersRes.data);
      if (coursesRes.data) setCourses(coursesRes.data);
    } catch (error) {
      console.error('Error loading form data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async (courseId: string) => {
    if (!courseId) {
      setModules([]);
      return;
    }
    const { data } = await supabase
      .from('course_modules')
      .select('id, title, level')
      .eq('course_id', courseId)
      .order('module_order');
    setModules(data || []);
  };

  const findAvailableRooms = async () => {
    if (!formData.start_time || !formData.end_time) {
      setAvailableRooms([]);
      return;
    }

    setFindingRooms(true);
    try {
      const startTime = new Date(formData.start_time);
      const endTime = new Date(formData.end_time);

      const { data: classBookings } = await supabase
        .from('bookings')
        .select('room_id, start_time, end_time')
        .eq('status', 'confirmed')
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      const { data: roomBookings } = await supabase
        .from('room_bookings')
        .select('room_id, start_time, end_time')
        .in('status', ['confirmed', 'pending'])
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      const bookedRoomIds = new Set<string>();
      
      if (classBookings) {
        classBookings.forEach((b: any) => {
          const bStart = new Date(b.start_time);
          const bEnd = new Date(b.end_time);
          if (bStart < endTime && bEnd > startTime) {
            bookedRoomIds.add(b.room_id);
          }
        });
      }

      if (roomBookings) {
        roomBookings.forEach((b: any) => {
          const bStart = new Date(b.start_time);
          const bEnd = new Date(b.end_time);
          if (bStart < endTime && bEnd > startTime) {
            bookedRoomIds.add(b.room_id);
          }
        });
      }

      const availabilityChecks = rooms.map((room) => {
        if (room.capacity < formData.student_count) {
          return { ...room, available: false, reason: 'Not enough capacity' };
        }
        const isBooked = bookedRoomIds.has(room.id);
        if (isBooked) {
          return { ...room, available: false, reason: 'Already booked' };
        }
        return { ...room, available: true, reason: 'Available' };
      });

      const available = availabilityChecks.filter(r => r.available);
      setAvailableRooms(available);

      if (available.length > 0 && !formData.room_id) {
        setFormData(prev => ({ ...prev, room_id: available[0].id }));
      } else if (available.length === 0) {
        setFormData(prev => ({ ...prev, room_id: '' }));
      }

    } catch (error) {
      console.error('Error finding available rooms:', error);
    } finally {
      setFindingRooms(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.booking_type === 'trial_lesson') {
      if (!formData.course_id) {
        alert('Please select a course for the trial lesson');
        return;
      }
    }

    if (!formData.room_id) {
      alert('Please select a room from the available list');
      return;
    }

    setSubmitting(true);

    try {
      // Parse attendees - explicitly type as string[]
      let attendeesList: string[] = [];
      if (formData.booking_type === 'meeting' && formData.attendees) {
        attendeesList = formData.attendees.split(',').map(a => a.trim()).filter(Boolean);
      }

      const bookingData: RoomBooking = {
        booking_type: formData.booking_type,
        title: formData.title,
        description: formData.description || undefined,
        room_id: formData.room_id,
        teacher_id: formData.teacher_id || undefined,
        requestor_name: formData.requestor_name || undefined,
        start_time: formData.start_time,
        end_time: formData.end_time,
        student_count: formData.student_count,
        course_id: formData.booking_type === 'trial_lesson' ? formData.course_id : undefined,
        module_id: formData.booking_type === 'trial_lesson' ? formData.module_id : undefined,
        event_type: formData.booking_type === 'event' ? formData.event_type : undefined,
        attendees: attendeesList.length > 0 ? attendeesList : undefined,
        notes: formData.notes || undefined,
        is_recurring: formData.is_recurring,
        recurrence_rule: formData.is_recurring ? formData.recurrence_rule : undefined,
        recurrence_end_date: formData.is_recurring ? formData.recurrence_end_date : undefined,
      };

      const result = await RoomBookingService.createBooking(bookingData);
      
      const roomName = rooms.find(r => r.id === formData.room_id)?.name || 'Unknown';
      alert(`✅ Room booked successfully!\n\n📋 ${bookingData.title}\n🏠 Room: ${roomName}\n🕐 ${format(new Date(bookingData.start_time), 'MMM d, h:mm a')} - ${format(new Date(bookingData.end_time), 'h:mm a')}`);
      
      setFormData({
        booking_type: formData.booking_type,
        title: '',
        description: '',
        room_id: '',
        teacher_id: '',
        requestor_name: '',
        start_time: '',
        end_time: '',
        student_count: 1,
        course_id: '',
        module_id: '',
        event_type: '',
        attendees: '',
        notes: '',
        is_recurring: false,
        recurrence_rule: '',
        recurrence_end_date: '',
      });
      setAvailableRooms([]);

    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderBookingTypeFields = () => {
    switch (formData.booking_type) {
      case 'trial_lesson':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Course *</label>
                <select
                  value={formData.course_id}
                  onChange={(e) => {
                    setFormData({ ...formData, course_id: e.target.value });
                    loadModules(e.target.value);
                  }}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select Course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Module</label>
                <select
                  value={formData.module_id}
                  onChange={(e) => setFormData({ ...formData, module_id: e.target.value })}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                >
                  <option value="">Select Module</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.title} ({module.level || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Number of Students</label>
              <input
                type="number"
                value={formData.student_count}
                onChange={(e) => setFormData({ ...formData, student_count: parseInt(e.target.value) || 1 })}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                min="1"
                required
              />
            </div>
          </div>
        );

      case 'event':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">Event Type *</label>
            <input
              type="text"
              value={formData.event_type}
              onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              placeholder="e.g., Workshop, Seminar, Graduation"
              required
            />
          </div>
        );

      case 'meeting':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">Attendees *</label>
            <input
              type="text"
              value={formData.attendees}
              onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              placeholder="John Doe, Jane Smith, Bob Johnson"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Separate names with commas</p>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📅 Book a Room</h1>
        <p className="text-sm text-gray-500">Schedule a room for trial lessons, events, meetings, or activities</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Booking Type *</label>
          <select
            value={formData.booking_type}
            onChange={(e) => setFormData({ ...formData, booking_type: e.target.value as BookingType })}
            className="mt-1 block w-full border rounded-md px-3 py-2"
            required
          >
            <option value="trial_lesson">🎯 Trial Lesson</option>
            <option value="event">🎪 Event</option>
            <option value="meeting">🤝 Meeting</option>
            <option value="activity">🏃 Activity</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              placeholder="e.g., Trial Lesson - John Doe"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Requestor Name</label>
            <input
              type="text"
              value={formData.requestor_name}
              onChange={(e) => setFormData({ ...formData, requestor_name: e.target.value })}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              placeholder="Your name"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            className="mt-1 block w-full border rounded-md px-3 py-2"
            placeholder="Additional details..."
          />
        </div>

        {renderBookingTypeFields()}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date & Time *</label>
            <input
              type="datetime-local"
              value={formData.start_time}
              onChange={(e) => {
                setFormData({ ...formData, start_time: e.target.value });
                setAvailableRooms([]);
              }}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date & Time *</label>
            <input
              type="datetime-local"
              value={formData.end_time}
              onChange={(e) => {
                setFormData({ ...formData, end_time: e.target.value });
                setAvailableRooms([]);
              }}
              className="mt-1 block w-full border rounded-md px-3 py-2"
              required
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-gray-700">🏠 Available Rooms</h3>
            {findingRooms && (
              <span className="text-sm text-gray-500">⏳ Finding rooms...</span>
            )}
            {!findingRooms && formData.start_time && formData.end_time && (
              <span className="text-sm text-gray-500">
                Found {availableRooms.length} available room{availableRooms.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!formData.start_time || !formData.end_time ? (
            <p className="text-sm text-gray-400">Please select date and time to find available rooms</p>
          ) : findingRooms ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-500">Checking room availability...</span>
            </div>
          ) : availableRooms.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-red-500">❌ No rooms available for this time slot</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting the time or date</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableRooms.map((room) => (
                <label
                  key={room.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition ${
                    formData.room_id === room.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="room"
                    value={room.id}
                    checked={formData.room_id === room.id}
                    onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                    className="mr-2"
                  />
                  <div>
                    <div className="font-medium text-sm">{room.name}</div>
                    <div className="text-xs text-gray-500">Capacity: {room.capacity}</div>
                    <div className="text-xs text-gray-400">{room.building} - Floor {room.floor}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Teacher (Optional)</label>
          <select
            value={formData.teacher_id}
            onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
            className="mt-1 block w-full border rounded-md px-3 py-2"
          >
            <option value="">Select Teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
            ))}
          </select>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={formData.is_recurring}
              onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
              className="h-4 w-4"
            />
            <label className="text-sm font-medium text-gray-700">Recurring Booking</label>
          </div>

          {formData.is_recurring && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Recurrence Rule</label>
                <select
                  value={formData.recurrence_rule}
                  onChange={(e) => setFormData({ ...formData, recurrence_rule: e.target.value })}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                >
                  <option value="FREQ=WEEKLY;BYDAY=MO,WE,FR">Weekly (Mon, Wed, Fri)</option>
                  <option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">Weekly (Mon-Fri)</option>
                  <option value="FREQ=WEEKLY;BYDAY=TU,TH">Weekly (Tue, Thu)</option>
                  <option value="FREQ=WEEKLY;BYDAY=SA">Weekly (Saturday)</option>
                  <option value="FREQ=WEEKLY;BYDAY=SU">Weekly (Sunday)</option>
                  <option value="FREQ=DAILY">Daily</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Recurrence End Date</label>
                <input
                  type="datetime-local"
                  value={formData.recurrence_end_date}
                  onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="mt-1 block w-full border rounded-md px-3 py-2"
            placeholder="Any additional notes..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={submitting || !formData.room_id}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Booking...' : '📅 Book Room'}
          </button>
        </div>
      </form>
    </div>
  );
}