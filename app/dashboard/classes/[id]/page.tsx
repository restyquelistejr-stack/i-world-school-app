import { createClient } from '@/lib/supabaseServer';
import { notFound } from 'next/navigation';
import ClassDetailsClient from './ClassDetailsClient';

// ✅ THIS IS THE MAGIC FIX
// It forces Next.js to generate routes for ALL existing classes.
export async function generateStaticParams() {
  const supabase = (await createClient()) as any;
  const { data: classes } = await supabase.from('classes').select('id');

  if (!classes) return [];

  return classes.map((cls: { id: string }) => ({
    id: cls.id,
  }));
}

export default async function ClassDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  // ✅ Next.js 15 requires params to be awaited
  const { id } = await params;
  
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
    .eq('id', id)
    .single();

  if (error || !classData) {
    notFound();
  }

  // Pass the data down to the Client Component
  return <ClassDetailsClient initialClassData={classData} classId={id} />;
}