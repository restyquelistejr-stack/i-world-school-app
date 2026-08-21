'use client';

import { useSearchParams } from 'next/navigation';
import EditCourseClient from './EditCourseClient';

export default function EditCoursePage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('id') as string;

  return <EditCourseClient courseId={courseId} />;
}