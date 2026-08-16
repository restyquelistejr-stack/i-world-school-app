'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  full_name: string;
  email: string;
  student_no: string;
  interests: {
    id: string;
    name: string;
    category: string;
    level: string;
    description: string;
  }[];
  availability: any[];
}

interface Program {
  id: string;
  name: string;
  code: string;
  description: string;
  duration: string;
  category: { id: string; name: string };
}

interface Course {
  id: string;
  name: string;
  code: string;
  description: string;
  duration: number;
  program_id: string;
  program?: { id: string; name: string };
}

interface Subject {
  id: string;
  name: string;
  category: string;
  level: string;
  description: string;
  duration_hours: number;
  course_id?: string;
}

export default function CreateOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('student');

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  
  // Offer items
  const [offerItems, setOfferItems] = useState<any[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<'program' | 'course' | 'subject'>('subject');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtered lists
  const [filteredPrograms, setFilteredPrograms] = useState<Program[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    if (studentId) {
      loadData();
    } else {
      router.push('/dashboard/students/offer');
    }
  }, [studentId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load student
      const { data: studentData, error: studentError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;

      // Load student number
      const { data: profileData } = await supabase
        .from('students')
        .select('student_no')
        .eq('id', studentId)
        .single();

      // Load student interests
      const { data: interestsData } = await supabase
        .from('student_interests')
        .select(`
          subject_id,
          subject:subject_id (id, name, category, level, description)
        `)
        .eq('student_id', studentId);

      // Load student availability
      const { data: availabilityData } = await supabase
        .from('student_availability')
        .select('day_of_week, start_time, end_time')
        .eq('student_id', studentId)
        .order('day_of_week')
        .order('start_time');

      setStudent({
        id: studentData.id,
        full_name: studentData.full_name,
        email: studentData.email,
        student_no: profileData?.student_no || `STU-${String(studentId).slice(0, 8).toUpperCase()}`,
        interests: interestsData?.map((i: any) => i.subject) || [],
        availability: availabilityData || [],
      });

      // Load all programs, courses, subjects
      const { data: programsData } = await supabase
        .from('programs')
        .select(`
          *,
          category:category_id (id, name)
        `)
        .eq('is_active', true)
        .order('name');

      const { data: coursesData } = await supabase
        .from('courses')
        .select(`
          *,
          program:program_id (id, name)
        `)
        .eq('is_active', true)
        .order('name');

      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('*')
        .order('name');

      setAllPrograms(programsData || []);
      setAllCourses(coursesData || []);
      setAllSubjects(subjectsData || []);

    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    }
    setLoading(false);
  }

  function addItemToOffer() {
    if (!selectedItemId) {
      alert('Please select an item to add');
      return;
    }

    let itemName = '';
    let itemDetails = null;

    if (selectedItemType === 'program') {
      const program = allPrograms.find(p => p.id === selectedItemId);
      itemName = program?.name || 'Program';
      itemDetails = program;
    } else if (selectedItemType === 'course') {
      const course = allCourses.find(c => c.id === selectedItemId);
      itemName = course?.name || 'Course';
      itemDetails = course;
    } else {
      const subject = allSubjects.find(s => s.id === selectedItemId);
      itemName = subject?.name || 'Subject';
      itemDetails = subject;
    }

    // Check if already added
    if (offerItems.some(item => item.item_id === selectedItemId && item.item_type === selectedItemType)) {
      alert('This item is already in the offer');
      return;
    }

    setOfferItems([
      ...offerItems,
      {
        id: `temp-${Date.now()}`,
        item_type: selectedItemType,
        item_id: selectedItemId,
        item_name: itemName,
        item_details: itemDetails,
        teacher_id: null,
        notes: '',
        schedule_suggestions: [],
      }
    ]);

    setSelectedItemId('');
    setSearchTerm('');
  }

  function removeItemFromOffer(index: number) {
    setOfferItems(offerItems.filter((_, i) => i !== index));
  }

  async function createOffer() {
    if (offerItems.length === 0) {
      alert('Please add at least one item to the offer');
      return;
    }

    setSubmitting(true);
    try {
      // Create the offer
      const { data: offerData, error: offerError } = await supabase
        .from('student_offers')
        .insert({
          student_id: studentId,
          title: `${student?.full_name}'s Program Offer`,
          description: `Personalized offer based on ${student?.full_name}'s interests`,
          status: 'draft',
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (offerError) throw offerError;

      // Add items to the offer
      const itemsToInsert = offerItems.map(item => ({
        offer_id: offerData.id,
        item_type: item.item_type,
        item_id: item.item_id,
        teacher_id: null,
        priority: 0,
        notes: '',
      }));

      const { error: itemsError } = await supabase
        .from('offer_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      alert('✅ Offer created successfully!');
      router.push(`/dashboard/students/offer/${offerData.id}`);

    } catch (error: any) {
      console.error('Error creating offer:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  const getFilteredItems = () => {
    if (selectedItemType === 'program') {
      return allPrograms.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else if (selectedItemType === 'course') {
      return allCourses.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      return allSubjects.filter(s => 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Student not found</p>
          <Link href="/dashboard/students/offer">
            <button className="mt-4 text-blue-600 hover:text-blue-800">Back to Offers</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/students/offer">
            <button className="text-gray-600 hover:text-gray-900">← Back to Offers</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create Program Offer</h1>
        </div>

        {/* Student Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600">
              {student.full_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold">{student.full_name}</h2>
              <p className="text-sm text-gray-500">
                {student.student_no} • {student.email}
              </p>
            </div>
          </div>

          {/* Student Interests */}
          {student.interests.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="font-medium text-gray-700 mb-2">📚 Student's Interests</h3>
              <div className="flex flex-wrap gap-2">
                {student.interests.map((interest) => (
                  <span
                    key={interest.id}
                    className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm flex items-center gap-2"
                  >
                    {interest.name}
                    <span className="text-xs text-blue-400">
                      ({interest.level || 'N/A'})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Student Availability */}
          {student.availability.length > 0 && (
            <div className="mt-3">
              <h3 className="font-medium text-gray-700 mb-1">🕐 Availability</h3>
              <div className="flex flex-wrap gap-2">
                {student.availability.map((slot, idx) => (
                  <span key={idx} className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">
                    {slot.day_of_week} {slot.start_time}-{slot.end_time}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add Items to Offer */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4">Add Items to Offer</h3>
          <p className="text-sm text-gray-600 mb-4">
            Select programs, courses, or subjects to offer to the student.
            Items matching the student's interests are highlighted.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={selectedItemType}
                onChange={(e) => {
                  setSelectedItemType(e.target.value as any);
                  setSelectedItemId('');
                  setSearchTerm('');
                }}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="subject">Subject</option>
                <option value="course">Course</option>
                <option value="program">Program</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Search</label>
              <input
                type="text"
                placeholder={`Search ${selectedItemType}s...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={addItemToOffer}
                disabled={!selectedItemId}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                + Add to Offer
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-48 overflow-y-auto border rounded-lg">
            {getFilteredItems().length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No {selectedItemType}s found
              </div>
            ) : (
              getFilteredItems().map((item: any) => {
                const isInterest = student.interests.some(
                  (i: any) => i.id === item.id
                );
                const isSelected = selectedItemId === item.id;
                
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`flex items-center justify-between p-3 cursor-pointer transition ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' :
                      isInterest ? 'bg-green-50 hover:bg-green-100' :
                      'hover:bg-gray-50'
                    } border-b border-gray-100`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {isInterest && (
                          <span className="px-2 py-0.5 text-xs bg-green-200 text-green-800 rounded-full">
                            Interest
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {item.code || item.category || 'No description'}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-blue-500 text-lg">✓</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Offer Items List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">
              Offer Items ({offerItems.length})
            </h3>
            {offerItems.length > 0 && (
              <button
                onClick={createOffer}
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Offer'}
              </button>
            )}
          </div>

          {offerItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No items added yet. Search and add items above.
            </div>
          ) : (
            <div className="space-y-2">
              {offerItems.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      item.item_type === 'program' ? 'bg-purple-100 text-purple-800' :
                      item.item_type === 'course' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {item.item_type.toUpperCase()}
                    </span>
                    <span className="font-medium">{item.item_name}</span>
                    {student.interests.some((i: any) => i.id === item.item_id) && (
                      <span className="text-xs text-green-600">⭐ Interest</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeItemFromOffer(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}