import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyZWFsdHNybmt0YXJhZ3B1eWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTQwODMsImV4cCI6MjA5OTQzMDA4M30.zm70FD80eK7tq-KhsVGYAhrmtRaT-y58wgNcbfJB2vc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);