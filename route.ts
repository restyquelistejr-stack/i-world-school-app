import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  return NextResponse.json({
    urlExists: !!url,
    urlValue: url ? url.substring(0, 20) + '...' : 'missing',
    keyExists: !!key,
    keyValue: key ? key.substring(0, 20) + '...' : 'missing',
    message: url && key ? '✅ Environment variables found!' : '❌ Missing environment variables'
  });
}