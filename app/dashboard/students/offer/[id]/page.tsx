'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import OfferDetailContent from './OfferDetailContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

function OfferPageContent({ params }: PageProps) {
  const { id } = use(params);
  
  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">No Student Selected</h2>
          <p className="text-gray-600 mb-4">
            Please select a student first before creating or editing an offer.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard/students/directory">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Go to Student Directory
              </button>
            </Link>
            <Link href="/dashboard/offer">
              <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">
                Back to Offers
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <OfferDetailContent studentId={id} />;
}

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading offer details...</p>
        </div>
      </div>
    }>
      <OfferPageContent {...props} />
    </Suspense>
  );
}