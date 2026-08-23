import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bookingId } = body;

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    // Fetch booking details
    const { data: booking, error } = await supabase
      .from('room_bookings')
      .select(`
        *,
        room:room_id (id, name, capacity),
        teacher:teacher_id (id, full_name, email),
        course:course_id (id, name),
        module:module_id (id, title, level)
      `)
      .eq('id', bookingId)
      .single();

    if (error) throw error;
    if (!booking) throw new Error('Booking not found');

    // Build Telegram message
    const typeLabels: Record<string, string> = {
      trial_lesson: '🎯 Trial Lesson',
      event: '🎪 Event',
      meeting: '🤝 Meeting',
      activity: '🏃 Activity',
    };

    let message = `📋 <b>New Room Booking</b>\n\n`;
    message += `📌 <b>${typeLabels[booking.booking_type] || booking.booking_type}</b>\n`;
    message += `📚 <b>${booking.title}</b>\n`;
    message += `🏠 Room: ${booking.room?.name || 'N/A'}\n`;
    message += `🕐 ${formatDate(booking.start_time)} - ${formatTime(booking.end_time)}\n`;
    
    if (booking.teacher?.full_name) {
      message += `👨‍🏫 Teacher: ${booking.teacher.full_name}\n`;
    }
    
    if (booking.requestor_name) {
      message += `👤 Requestor: ${booking.requestor_name}\n`;
    }

    if (booking.booking_type === 'trial_lesson') {
      message += `👥 Students: ${booking.student_count || 0}\n`;
      if (booking.course?.name) {
        message += `📖 Course: ${booking.course.name}\n`;
      }
    }

    if (booking.booking_type === 'meeting' && booking.attendees?.length) {
      message += `👥 Attendees: ${booking.attendees.join(', ')}\n`;
    }

    if (booking.is_recurring) {
      message += `🔄 Recurring\n`;
    }

    if (booking.notes) {
      message += `\n📝 ${booking.notes}`;
    }

    // Send to Telegram via class-guardian edge function
    const edgeFunctionUrl = 'https://rrealtssnktaragpuyae.supabase.co/functions/v1/class-guardian';
    
    await fetch(`${edgeFunctionUrl}?action=room_booking&message=${encodeURIComponent(message)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}