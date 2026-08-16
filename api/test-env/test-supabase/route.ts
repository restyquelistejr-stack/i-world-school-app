import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Try to fetch something simple
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      return NextResponse.json({ 
        connected: false, 
        error: error.message,
        hint: error.message.includes('relation') ? 'Users table might not exist yet - this is normal if you haven't created tables' : 'Connection failed'
      });
    }
    
    return NextResponse.json({ 
      connected: true, 
      message: '✅ Successfully connected to Supabase!',
      data: data
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      connected: false, 
      error: error.message 
    }, { status: 500 });
  }
}