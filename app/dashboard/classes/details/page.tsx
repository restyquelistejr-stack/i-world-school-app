'use client';

import { useSearchParams } from 'next/navigation';
import ClassDetailsClient from './ClassDetailsClient';

export default function ClassDetailsPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get('id') as string;

  return <ClassDetailsClient classId={classId} />;
}