'use client';

import { useRouter } from 'next/navigation';

interface BackButtonProps {
  label?: string;
  fallbackUrl?: string;
}

export default function BackButton({ label = '← Back', fallbackUrl = '/dashboard' }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
    >
      {label}
    </button>
  );
}