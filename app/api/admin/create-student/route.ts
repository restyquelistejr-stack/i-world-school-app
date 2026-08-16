import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  console.log('=== Create Student API ===');
  
  try {
    const body = await request.json();
    console.log('Request body:', body);
    
    const { email, full_name, phone } = body;

    if (!email || !full_name) {
      return NextResponse.json(
        { error: 'Email and full name are required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const defaultPassword = Math.random().toString(36).slice(-10) + '!A1';

    // Create user with admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: 'student',
      },
    });

    if (authError) {
      return NextResponse.json(
        { error: 'Failed to create student account: ' + authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 400 }
      );
    }

    // Insert into users table
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: email,
        full_name: full_name,
        role: 'student',
        phone: phone || '',
      });

    if (userError) {
      return NextResponse.json(
        { error: 'Failed to create user profile: ' + userError.message },
        { status: 400 }
      );
    }

    // Insert into students table with default values
    const { error: studentError } = await supabaseAdmin
      .from('students')
      .insert({
        id: authData.user.id,
        is_active: true,
        date_of_birth: null,
        address: '',
        nationality: '',
        emergency_contact: '',
        emergency_phone: '',
        education_level: '',
      });

    if (studentError) {
      console.error('Student insert error:', studentError);
      // Continue - the user is created, we can update profile later
    }

    return NextResponse.json({
      success: true,
      message: 'Student created successfully!',
      user: {
        id: authData.user.id,
        email: email,
        full_name: full_name,
      },
      password: defaultPassword,
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}