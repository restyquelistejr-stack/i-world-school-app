import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    return NextResponse.json({
      isLoggedIn: !!session,
      user: session?.user?.email || null,
      error: error?.message || null
    });
  } catch (error: any) {
    return NextResponse.json({
      isLoggedIn: false,
      user: null,
      error: error.message
    }, { status: 500 });
  }
}
