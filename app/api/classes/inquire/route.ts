import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      course_id,
      level,
      package_id,
      package_name,
      start_date,
      total_hours,
      num_sessions,
      hours_per_session,
      total_price,
      status
    } = body;

    // Insert into your Classes / Inquiries table
    // Note: You may need to create this table if it doesn't exist.
    const { data, error } = await supabase
      .from('inquiries') // Or 'classes', depending on your table name
      .insert({
        course_id,
        selected_level: level,
        package_id,
        package_name,
        start_date,
        total_hours,
        num_sessions,
        hours_per_session,
        total_price,
        status
      })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error submitting inquiry:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}