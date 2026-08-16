'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

interface Offer {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  student_id: string;
  student: {
    id: string;
    full_name: string;
    email: string;
  };
  item_count: number;
}

interface Student {
  id: string;
  full_name: string;
  email: string;
  student_no: string;
}

export default function OffersPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showStudentSelect, setShowStudentSelect] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchStudent, setSearchStudent] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadOffers();
    loadStudents();
  }, []);

  async function loadOffers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_offers')
        .select(`
          *,
          student:student_id (id, full_name, email),
          items:offer_items (count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedOffers = data.map((offer: any) => ({
        ...offer,
        item_count: offer.items?.[0]?.count || 0,
      }));

      console.log('✅ Loaded offers:', formattedOffers.length);
      setOffers(formattedOffers);
    } catch (error) {
      console.error('Error loading offers:', error);
      alert('Failed to load offers');
    }
    setLoading(false);
  }

  async function loadStudents() {
    setLoadingStudents(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, is_active')
        .eq('role', 'student')
        .eq('is_active', true)
        .order('full_name');

      if (usersError) throw usersError;

      if (!usersData || usersData.length === 0) {
        setStudents([]);
        setLoadingStudents(false);
        return;
      }

      const userIds = usersData.map((u: any) => u.id);
      const { data: profilesData } = await supabase
        .from('students')
        .select('id, student_no')
        .in('id', userIds);

      const studentNoMap: Record<string, string> = {};
      (profilesData || []).forEach((profile: any) => {
        studentNoMap[profile.id] = profile.student_no;
      });

      const formattedStudents = usersData.map((user: any) => ({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        student_no: studentNoMap[user.id] || `STU-${String(user.id).slice(0, 8).toUpperCase()}`,
      }));

      setStudents(formattedStudents);
    } catch (error) {
      console.error('Error loading students:', error);
      setStudents([]);
    }
    setLoadingStudents(false);
  }

  async function createNewOffer() {
    if (!selectedStudentId) {
      alert('Please select a student first');
      return;
    }

    setCreatingOffer(true);
    try {
      const { data, error } = await supabase
        .from('student_offers')
        .insert({
          student_id: selectedStudentId,
          title: 'Program Offer',
          description: 'Program offer based on student interests',
          status: 'draft',
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      setShowStudentSelect(false);
      setSelectedStudentId('');
      setSearchStudent('');
      
      router.push(`/dashboard/students/offer/${selectedStudentId}`);
    } catch (error: any) {
      console.error('Error creating offer:', error);
      alert('Error: ' + error.message);
    }
    setCreatingOffer(false);
  }

  async function deleteOffer(offerId: string) {
    setDeleting(true);
    try {
      // First, get the offer to get student_id for navigation
      const { data: offer } = await supabase
        .from('student_offers')
        .select('student_id')
        .eq('id', offerId)
        .single();

      // Delete offer items first (if any)
      await supabase
        .from('offer_items')
        .delete()
        .eq('offer_id', offerId);

      // Delete the offer
      const { error } = await supabase
        .from('student_offers')
        .delete()
        .eq('id', offerId);

      if (error) throw error;

      alert('✅ Offer deleted successfully!');
      setShowDeleteModal(null);
      loadOffers();
    } catch (error: any) {
      console.error('Error deleting offer:', error);
      alert('Error: ' + error.message);
    }
    setDeleting(false);
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-purple-100 text-purple-800',
      sent: 'bg-blue-100 text-blue-800',
      reviewed: 'bg-indigo-100 text-indigo-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      enrolled: 'bg-teal-100 text-teal-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return '📝';
      case 'pending': return '⏳';
      case 'sent': return '📤';
      case 'reviewed': return '👀';
      case 'accepted': return '✅';
      case 'rejected': return '❌';
      case 'enrolled': return '🎓';
      default: return '📋';
    }
  };

  const handleOfferClick = (offer: Offer) => {
    router.push(`/dashboard/students/offer/${offer.student_id}`);
  };

  const handleEditClick = (e: React.MouseEvent, offer: Offer) => {
    e.stopPropagation(); // Prevent triggering the card click
    router.push(`/dashboard/students/offer/${offer.student_id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, offerId: string) => {
    e.stopPropagation(); // Prevent triggering the card click
    setShowDeleteModal(offerId);
  };

  const filteredOffers = filter === 'all' 
    ? offers 
    : offers.filter(o => o.status === filter);

  const filteredStudents = students.filter(student =>
    student.full_name.toLowerCase().includes(searchStudent.toLowerCase()) ||
    student.student_no.toLowerCase().includes(searchStudent.toLowerCase()) ||
    student.email.toLowerCase().includes(searchStudent.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Student Offers</h1>
            <p className="text-gray-500 text-sm">Create and manage program offers for students</p>
          </div>
          <button
            onClick={() => setShowStudentSelect(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            ➕ New Offer
          </button>
        </div>

        {/* Student Selection Modal */}
        {showStudentSelect && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Select Student</h2>
                <button
                  onClick={() => {
                    setShowStudentSelect(false);
                    setSelectedStudentId('');
                    setSearchStudent('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by name, email, or student ID..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {loadingStudents && (
                  <div className="text-sm text-gray-500 mt-1">Loading students...</div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {loadingStudents ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Loading students...</p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No students found</p>
                    {searchStudent && (
                      <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
                    )}
                    <button
                      onClick={loadStudents}
                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Refresh list
                    </button>
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition ${
                        selectedStudentId === student.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{student.full_name}</p>
                          <p className="text-sm text-gray-500">
                            {student.student_no} • {student.email}
                          </p>
                        </div>
                        {selectedStudentId === student.id && (
                          <span className="text-blue-500 text-lg">✓</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 pt-4 border-t flex gap-2">
                <button
                  onClick={() => {
                    setShowStudentSelect(false);
                    setSelectedStudentId('');
                    setSearchStudent('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={createNewOffer}
                  disabled={!selectedStudentId || creatingOffer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingOffer ? 'Creating...' : 'Create Offer'}
                </button>
              </div>
              {!selectedStudentId && (
                <p className="text-xs text-yellow-600 mt-2 text-center">
                  Please select a student to enable the Create Offer button
                </p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['all', 'draft', 'pending', 'sent', 'reviewed', 'accepted', 'rejected', 'enrolled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1 rounded-full text-sm transition ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : filteredOffers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <p className="text-gray-600">No offers found. Create a new offer to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOffers.map((offer) => (
              <div
                key={offer.id}
                onClick={() => handleOfferClick(offer)}
                className="bg-white rounded-lg shadow-lg p-6 border border-gray-100 hover:shadow-xl transition cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{offer.title}</h3>
                    <p className="text-sm text-gray-500">{offer.student?.full_name || 'Unknown Student'}</p>
                  </div>
                  <span className={`ml-2 px-2 py-1 text-xs rounded-full whitespace-nowrap ${getStatusColor(offer.status)}`}>
                    {getStatusIcon(offer.status)} {offer.status}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{offer.description}</p>
                
                <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
                  <span>📚 {offer.item_count || 0} items</span>
                  <span>📅 {new Date(offer.created_at).toLocaleDateString()}</span>
                </div>

                <div className="mt-2 text-xs text-gray-400 flex items-center justify-between">
                  <span>Student ID: {offer.student_id?.slice(0, 8) || 'N/A'}</span>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => handleEditClick(e, offer)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1 rounded hover:bg-blue-50 transition"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, offer.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 transition"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Delete Offer</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this offer? This action cannot be undone.
              All associated items will also be removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteOffer(showDeleteModal)}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}