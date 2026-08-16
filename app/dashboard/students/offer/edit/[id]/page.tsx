'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Offer {
  id: string;
  student_id: string;
  title: string;
  description: string;
  status: string;
  selected_subjects: string[];
  schedule: any;
  student?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export default function EditOfferPage() {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (offerId) {
      loadOffer();
    } else {
      setError('No offer ID provided');
      setLoading(false);
    }
  }, [offerId]);

  async function loadOffer() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('student_offers')
        .select(`
          *,
          student:student_id (id, full_name, email)
        `)
        .eq('id', offerId)
        .single();

      if (error) throw error;

      setOffer(data);
      setTitle(data.title || 'Program Offer');
      setDescription(data.description || 'Program offer based on student interests');
      setStatus(data.status || 'draft');
    } catch (error: any) {
      console.error('Error loading offer:', error);
      setError('Failed to load offer');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('student_offers')
        .update({
          title: title,
          description: description,
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', offerId);

      if (error) throw error;

      alert('✅ Offer updated successfully!');
      router.push('/dashboard/offer');
    } catch (error: any) {
      console.error('Error updating offer:', error);
      setError(error.message || 'Failed to update offer');
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading offer...</p>
        </div>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || 'Offer not found'}</p>
          <Link href="/dashboard/offer">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Back to Offers
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/offer">
            <button className="text-gray-600 hover:text-gray-900">← Back to Offers</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Offer</h1>
        </div>

        {/* Student Info Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600">
              {offer.student?.full_name?.charAt(0) || 'S'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{offer.student?.full_name || 'Unknown Student'}</h2>
              <p className="text-sm text-gray-500">{offer.student?.email || 'No email'}</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-medium">Offer ID</div>
              <div className="text-sm text-gray-500 font-mono">{offer.id.slice(0, 8)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">Offer Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">📝 Draft</option>
                <option value="pending">⏳ Pending</option>
                <option value="sent">📤 Sent</option>
                <option value="reviewed">👀 Reviewed</option>
                <option value="accepted">✅ Accepted</option>
                <option value="rejected">❌ Rejected</option>
                <option value="enrolled">🎓 Enrolled</option>
              </select>
            </div>

            {/* Offer Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-medium text-gray-700 mb-2">📋 Offer Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2">{new Date(offer.created_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Student:</span>
                  <span className="ml-2">{offer.student?.full_name}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Link href="/dashboard/offer">
                <button type="button" className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}