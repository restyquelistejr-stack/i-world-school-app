'use client';

import { useSearchParams } from 'next/navigation';
import CourseDetailsClient from './CourseDetailsClient';

export default function CourseDetailsPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('id') as string;

  return <CourseDetailsClient courseId={courseId} />;
}