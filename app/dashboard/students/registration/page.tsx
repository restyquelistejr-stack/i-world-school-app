'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// ✅ Expanded Nationalities (Matches the Class Modal)
const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Argentine', 'Australian', 'Austrian', 
  'Bangladeshi', 'Belgian', 'Brazilian', 'British', 'Bulgarian', 'Canadian', 'Chilean', 
  'Chinese', 'Colombian', 'Croatian', 'Cuban', 'Czech', 'Danish', 'Dutch', 'Egyptian', 
  'English', 'Filipino', 'Finnish', 'French', 'German', 'Greek', 'Hong Konger', 
  'Hungarian', 'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish', 
  'Israeli', 'Italian', 'Jamaican', 'Japanese', 'Jordanian', 'Kenyan', 'Korean', 
  'Kuwaiti', 'Lebanese', 'Malaysian', 'Mexican', 'Moroccan', 'New Zealander', 
  'Nigerian', 'Norwegian', 'Pakistani', 'Peruvian', 'Polish', 'Portuguese', 
  'Romanian', 'Russian', 'Saudi', 'Scottish', 'Singaporean', 'Slovak', 'South African', 
  'Spanish', 'Swedish', 'Swiss', 'Taiwanese', 'Thai', 'Turkish', 'Ukrainian', 
  'Vietnamese', 'Welsh'
];

const EDUCATION_LEVELS = [
  { value: '', label: 'Select Education Level' },
  { value: 'Primary School', label: 'Primary School' },
  { value: 'Secondary / High School', label: 'Secondary / High School' },
  { value: 'Diploma / Polytechnic', label: 'Diploma / Polytechnic' },
  { value: 'Bachelor\'s Degree', label: "Bachelor's Degree" },
  { value: 'Master\'s Degree', label: "Master's Degree" },
  { value: 'Doctorate / PhD', label: 'Doctorate / PhD' },
  { value: 'Professional Certification', label: 'Professional Certification' },
  { value: 'Other', label: 'Other' },
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StudentRegistrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingStudentId = searchParams.get('student');
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);
  
  const [studentData, setStudentData] = useState({
    full_name: '',
    email: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    address: '',
    nationality: '',
    educational_background: '',
    emergency_contact: '',
    emergency_phone: '',
  });

  const [availabilitySlots, setAvailabilitySlots] = useState<any[]>([]);
  const [newAvailabilitySlot, setNewAvailabilitySlot] = useState({
    day_of_week: '',
    start_time: '09:00',
    end_time: '17:00',
  });

  useEffect(() => {
    if (existingStudentId) {
      loadExistingStudent(existingStudentId);
    }
  }, [existingStudentId]);

  async function loadExistingStudent(studentId: string) {
    setLoadingStudent(true);
    try {
      setIsExistingStudent(true);
      
      // 1. Fetch User Data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', studentId)
        .single();

      if (userError) throw userError;

      setStudentData({
        full_name: userData?.full_name || '',
        email: userData?.email || '',
        phone: userData?.phone || '',
        gender: userData?.gender || '',
        date_of_birth: userData?.date_of_birth || '',
        address: userData?.address || '',
        nationality: userData?.nationality || '',
        educational_background: userData?.educational_background || '',
        emergency_contact: userData?.emergency_contact || '',
        emergency_phone: userData?.emergency_phone || '',
      });

      // 2. ✅ Fetch existing Availability Slots
      const { data: availData, error: availError } = await supabase
        .from('student_availability')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_active', true);

      if (availError) {
        console.error('Error loading availability:', availError);
      } else {
        setAvailabilitySlots(availData || []);
      }

    } catch (error) {
      console.error('Error loading existing student:', error);
      alert('Error loading student data');
    }
    setLoadingStudent(false);
  }

  const addAvailabilitySlot = () => {
    if (!newAvailabilitySlot.day_of_week) {
      alert('Please select a day');
      return;
    }

    const duplicate = availabilitySlots.some(
      slot => slot.day_of_week === newAvailabilitySlot.day_of_week && 
              slot.start_time === newAvailabilitySlot.start_time &&
              slot.end_time === newAvailabilitySlot.end_time
    );

    if (duplicate) {
      alert('This availability slot already exists');
      return;
    }

    setAvailabilitySlots([...availabilitySlots, { ...newAvailabilitySlot }]);
    setNewAvailabilitySlot({
      day_of_week: '',
      start_time: '09:00',
      end_time: '17:00',
    });
  };

  const removeAvailabilitySlot = (index: number) => {
    setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      let studentId = existingStudentId;

      if (!isExistingStudent) {
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('email', studentData.email)
          .single();

        if (existing) {
          alert('❌ A user with this email already exists.');
          setSubmitting(false);
          return;
        }

        const defaultPassword = Math.random().toString(36).slice(-10) + '!A1';
        
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            full_name: studentData.full_name,
            email: studentData.email,
            phone: studentData.phone || '',
            gender: studentData.gender || '',
            date_of_birth: studentData.date_of_birth || null,
            address: studentData.address || '',
            nationality: studentData.nationality || '',
            educational_background: studentData.educational_background || '',
            emergency_contact: studentData.emergency_contact || '',
            emergency_phone: studentData.emergency_phone || '',
            role: 'student',
            is_active: true,
          })
          .select()
          .single();

        if (userError) throw userError;
        studentId = newUser.id;

        alert(`✅ Student registered!\nPassword: ${defaultPassword}`);
      } else {
        const { error: userError } = await supabase
          .from('users')
          .update({
            full_name: studentData.full_name,
            phone: studentData.phone,
            gender: studentData.gender,
            date_of_birth: studentData.date_of_birth || null,
            address: studentData.address || '',
            nationality: studentData.nationality || '',
            educational_background: studentData.educational_background || '',
            emergency_contact: studentData.emergency_contact || '',
            emergency_phone: studentData.emergency_phone || '',
          })
          .eq('id', studentId);

        if (userError) throw userError;
      }

      // Save student availability (Delete old ones, insert new ones)
      await supabase.from('student_availability').delete().eq('student_id', studentId);
      if (availabilitySlots.length > 0) {
        const availData = availabilitySlots.map(slot => ({
          student_id: studentId,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_active: true,
        }));
        await supabase.from('student_availability').insert(availData);
      }

      alert(isExistingStudent ? '✅ Student profile updated successfully!' : '✅ Student registered successfully!');
      router.push('/dashboard/students/directory');

    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  if (loadingStudent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading student data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard/students/directory">
              <button className="text-gray-600 hover:text-gray-900 mb-2">← Back to Students</button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              {isExistingStudent ? 'Update Student Profile' : 'Student Registration'}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-8">
          
          {/* SECTION 1: Personal Information */}
          <div>
            <h2 className="text-xl font-bold mb-4">
              {isExistingStudent ? 'Personal Information' : 'Personal Information'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={studentData.full_name}
                  onChange={(e) => setStudentData({ ...studentData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input
                  type="email"
                  value={studentData.email}
                  onChange={(e) => setStudentData({ ...studentData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={isExistingStudent}
                />
                {isExistingStudent && (
                  <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  value={studentData.phone}
                  onChange={(e) => setStudentData({ ...studentData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <select
                  value={studentData.gender}
                  onChange={(e) => setStudentData({ ...studentData, gender: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={studentData.date_of_birth}
                  onChange={(e) => setStudentData({ ...studentData, date_of_birth: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nationality</label>
                <select
                  value={studentData.nationality}
                  onChange={(e) => setStudentData({ ...studentData, nationality: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Nationality</option>
                  {NATIONALITIES.map((nat) => (
                    <option key={nat} value={nat}>{nat}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={studentData.address}
                  onChange={(e) => setStudentData({ ...studentData, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Education Level</label>
                <select
                  value={studentData.educational_background}
                  onChange={(e) => setStudentData({ ...studentData, educational_background: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={studentData.emergency_contact}
                  onChange={(e) => setStudentData({ ...studentData, emergency_contact: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Phone</label>
                <input
                  type="text"
                  value={studentData.emergency_phone}
                  onChange={(e) => setStudentData({ ...studentData, emergency_phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Availability */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-bold mb-4">Availability Preferences</h2>
            
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Day</label>
                  <select
                    value={newAvailabilitySlot.day_of_week}
                    onChange={(e) => setNewAvailabilitySlot({ ...newAvailabilitySlot, day_of_week: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Select Day</option>
                    {DAYS_OF_WEEK.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <input
                    type="time"
                    value={newAvailabilitySlot.start_time}
                    onChange={(e) => setNewAvailabilitySlot({ ...newAvailabilitySlot, start_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Time</label>
                  <input
                    type="time"
                    value={newAvailabilitySlot.end_time}
                    onChange={(e) => setNewAvailabilitySlot({ ...newAvailabilitySlot, end_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addAvailabilitySlot}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
              >
                + Add Time Slot
              </button>
            </div>

            {availabilitySlots.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center mt-4">
                <p className="text-yellow-700">⚠️ Please add at least one availability slot.</p>
              </div>
            ) : (
              <div className="space-y-2 mt-4">
                <h3 className="font-medium text-gray-700">Your Availability</h3>
                {availabilitySlots.map((slot, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                    <div>
                      <span className="font-medium">{slot.day_of_week}</span>
                      <span className="ml-3 text-gray-600">
                        {slot.start_time} - {slot.end_time}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAvailabilitySlot(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end pt-4 border-t mt-8">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : (isExistingStudent ? 'Update Profile' : 'Complete Registration')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}