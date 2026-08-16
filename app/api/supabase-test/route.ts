import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        error: '❌ Missing environment variables',
        url: supabaseUrl ? 'exists' : 'missing',
        key: supabaseKey ? 'exists' : 'missing'
      }, { status: 500 });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test auth first (this doesn't require tables)
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
      return NextResponse.json({
        error: 'Auth error: ' + authError.message,
        auth: 'Failed'
      }, { status: 500 });
    }

    // Try to get the current user (if logged in)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    return NextResponse.json({
      success: true,
      message: '✅ Connected to Supabase Auth!',
      isLoggedIn: !!user,
      userEmail: user?.email || 'Not logged in',
      sessionActive: !!session,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Supabase test error:', error);
    return NextResponse.json({
      error: 'Caught error: ' + error.message,
      stack: error.stack
    }, { status: 500 });
  }
}