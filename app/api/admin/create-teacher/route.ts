import { createClient } from '@supabase/supabase-js';

// Helper function to generate random password
function generateDefaultPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function GET() {
  return new Response(
    JSON.stringify({ 
      message: 'API is working! Use POST to create a teacher.',
      status: 'ready' 
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function POST(request: Request) {
  console.log('=== POST request received ===');
  
  try {
    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing environment variables' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse the request body
    const body = await request.json();
    console.log('Request body:', body);
    
    const { email, full_name, phone, specialization, bio, hourly_rate } = body;

    // Validate required fields
    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ error: 'Email and full name are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase with service role
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

    // Generate a random default password
    const defaultPassword = generateDefaultPassword();

    // Step 1: Create user with admin API
    console.log('Creating user:', email);
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: 'teacher',
      },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to create teacher account: ' + authError.message }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!authData.user) {
      console.error('No user returned');
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('User created with ID:', authData.user.id);

    // Step 2: Insert into users table
    console.log('Inserting into users table...');
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: email,
        full_name: full_name,
        role: 'teacher',
        phone: phone || '',
      });

    if (userError) {
      console.error('User insert error:', userError);
      return new Response(
        JSON.stringify({ error: 'Failed to create user profile: ' + userError.message }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('User inserted successfully');

    // Step 3: Insert into teachers table
    console.log('Inserting into teachers table...');
    const { error: teacherError } = await supabaseAdmin
      .from('teachers')
      .insert({
        id: authData.user.id,
        specialization: specialization || '',
        bio: bio || '',
        hourly_rate: parseFloat(hourly_rate) || 0,
        is_active: true,
      });

    if (teacherError) {
      console.error('Teacher insert error:', teacherError);
      return new Response(
        JSON.stringify({ error: 'Failed to create teacher profile: ' + teacherError.message }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Teacher inserted successfully!');
    
    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Teacher created successfully!',
        user: {
          id: authData.user.id,
          email: email,
          full_name: full_name,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('=== Error in POST ===', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error: ' + (error.message || 'Unknown error') }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}