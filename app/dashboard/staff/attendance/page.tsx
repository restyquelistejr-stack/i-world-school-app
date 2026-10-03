// app/dashboard/staff/attendance/page.tsx
// ⭐ v3.20 — Suspense wrapper for useSearchParams
import { Suspense } from 'react';
import AttendanceClient from './AttendanceClient';

export default function AttendancePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <AttendanceClient />
    </Suspense>
  );
}