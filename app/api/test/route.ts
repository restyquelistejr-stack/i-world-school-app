import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('✅ API route hit!');
  
  // Get environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Return simple response
  return NextResponse.json({
    status: 'API working!',
    timestamp: new Date().toISOString(),
    env: {
      url: supabaseUrl ? '✅ Present' : '❌ Missing',
      key: supabaseKey ? '✅ Present' : '❌ Missing',
      urlPreview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : null
    }
  });
}