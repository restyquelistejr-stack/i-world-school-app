import { supabase } from './supabaseClient';

export type BookingType = 'trial_lesson' | 'event' | 'meeting' | 'activity';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface RoomBooking {
  id?: string;
  booking_type: BookingType;
  title: string;
  description?: string;
  room_id: string;
  teacher_id?: string;
  requestor_name?: string;
  start_time: string;
  end_time: string;
  status?: BookingStatus;
  student_count?: number;
  course_id?: string;
  module_id?: string;
  event_type?: string;
  attendees?: string[];
  attendee_count?: number;
  notes?: string;
  is_recurring?: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: string;
  created_at?: string;
}

export class RoomBookingService {
  // Get all bookings with details
  static async getBookings(startDate?: string, endDate?: string) {
    let query = supabase
      .from('room_bookings')
      .select(`
        *,
        room:room_id (id, name, capacity),
        teacher:teacher_id (id, full_name, email),
        course:course_id (id, name),
        module:module_id (id, title, level)
      `)
      .order('start_time', { ascending: true });

    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('end_time', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  // Get bookings for a specific room
  static async getBookingsByRoom(roomId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from('room_bookings')
      .select(`
        *,
        room:room_id (id, name, capacity),
        teacher:teacher_id (id, full_name, email)
      `)
      .eq('room_id', roomId)
      .in('status', ['confirmed', 'pending'])
      .order('start_time', { ascending: true });

    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('end_time', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  // Check if a room is available - checks both class bookings and room bookings
  static async checkAvailability(roomId: string, startTime: string, endTime: string) {
    try {
      // Check class bookings for overlap
      const { data: classBookings, error: classError } = await supabase
        .from('bookings')
        .select('id')
        .eq('room_id', roomId)
        .eq('status', 'confirmed')
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      if (classError) throw classError;

      // Check if any class booking overlaps
      if (classBookings && classBookings.length > 0) {
        // We need to check each booking for overlap
        const hasConflict = await this.checkOverlapWithBookings(classBookings, startTime, endTime);
        if (hasConflict) return false;
      }

      // Check room bookings for overlap
      const { data: roomBookings, error: roomError } = await supabase
        .from('room_bookings')
        .select('id, start_time, end_time')
        .eq('room_id', roomId)
        .in('status', ['confirmed', 'pending'])
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      if (roomError) throw roomError;

      // Check if any room booking overlaps
      if (roomBookings && roomBookings.length > 0) {
        const hasConflict = await this.checkOverlapWithBookings(roomBookings, startTime, endTime);
        if (hasConflict) return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking availability:', error);
      return false;
    }
  }

  // Helper to check overlap with a list of bookings
  private static async checkOverlapWithBookings(bookings: any[], startTime: string, endTime: string): Promise<boolean> {
    const start = new Date(startTime);
    const end = new Date(endTime);

    for (const booking of bookings) {
      const bStart = new Date(booking.start_time);
      const bEnd = new Date(booking.end_time);
      
      // Check if there's any overlap: booking starts before endTime AND booking ends after startTime
      if (bStart < end && bEnd > start) {
        return true;
      }
    }
    return false;
  }

  // Create a new booking
  static async createBooking(booking: RoomBooking) {
    // First check availability with proper overlap check
    const isAvailable = await this.checkAvailability(
      booking.room_id,
      booking.start_time,
      booking.end_time
    );

    if (!isAvailable) {
      throw new Error('Room is not available for the selected time slot');
    }

    // Prepare attendees if meeting
    let attendees = [];
    if (booking.booking_type === 'meeting' && booking.attendees) {
      attendees = booking.attendees;
    }

    const payload = {
      booking_type: booking.booking_type,
      title: booking.title,
      description: booking.description || null,
      room_id: booking.room_id,
      teacher_id: booking.teacher_id || null,
      requestor_name: booking.requestor_name || null,
      start_time: booking.start_time,
      end_time: booking.end_time,
      status: 'confirmed' as BookingStatus,
      student_count: booking.student_count || 0,
      course_id: booking.course_id || null,
      module_id: booking.module_id || null,
      event_type: booking.event_type || null,
      attendees: attendees,
      attendee_count: attendees.length,
      notes: booking.notes || null,
      is_recurring: booking.is_recurring || false,
      recurrence_rule: booking.recurrence_rule || null,
      recurrence_end_date: booking.recurrence_end_date || null,
    };

    const { data, error } = await supabase
      .from('room_bookings')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Send notification
    await this.sendNotification(data.id);

    return data;
  }

  // Update a booking
  static async updateBooking(id: string, updates: Partial<RoomBooking>) {
    const { data, error } = await supabase
      .from('room_bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Cancel a booking
  static async cancelBooking(id: string) {
    const { data, error } = await supabase
      .from('room_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Delete a booking
  static async deleteBooking(id: string) {
    const { error } = await supabase
      .from('room_bookings')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  // Send notification (calls API route)
  private static async sendNotification(bookingId: string) {
    try {
      await fetch('/api/room-booking/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}