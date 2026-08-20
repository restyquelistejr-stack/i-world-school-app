import { createClient } from '@/lib/supabaseServer';
import { notFound } from 'next/navigation';
import ClassDetailsClient from './ClassDetailsClient';

// ✅ Next.js config to prevent static generation at build time
export const dynamic = 'force-dynamic';

export default async function ClassDetailsPage({ params }: { params: { id: string } }) {
  // ✅ FIX: Cast the awaited client so TypeScript knows it's not a Promise
  const supabase = (await createClient()) as any;
  
  // Fetch the class data on the server
  const { data: classData, error } = await supabase
    .from('classes')
    .select(`
      *,
      teacher:teacher_id (id, full_name),
      room:room_id (id, name),
      course:course_id (id, name)
    `)
    .eq('id', params.id)
    .single();

  if (error || !classData) {
    notFound();
  }

  // Pass the data down to the Client Component
  return <ClassDetailsClient initialClassData={classData} classId={params.id} />;
}