'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';

export default function ClassDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  // Modal State
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [submittingStudents, setSubmittingStudents] = useState(false);

  // Group Registration State (Array of new students)
  const [newStudents, setNewStudents] = useState<any[]>([
    {
      full_name: '',
      email: '',
      phone: '',
      gender: '',
      nationality: '',
      date_of_birth: '',
      educational_background: '', // Updated to match your CSV schema
      emergency_contact: '',
      emergency_phone: '',
    }
  ]);

  useEffect(() => {
    if (classId) loadClassDetails();
  }, [classId]);

  async function loadClassDetails() {
    setLoading(true);
    try {
      // 1. Load Class Info (including Teacher, Course, and Room)
      const { data: classInfo, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          teacher:teacher_id (id, full_name),
          room:room_id (id, name),
          course:course_id (id, name)
        `)
        .eq('id', classId)
        .single();
      if (classError) throw classError;
      setClassData(classInfo);

      // 2. Load Class Options (The Proposed Schedule)
      const { data: optionsData, error: optionsError } = await supabase
        .from('class_options')
        .select('*')
        .eq('class_id', classId)
        .order('session_index', { ascending: true });
      if (optionsError) throw optionsError;
      setSlots(optionsData || []);

      // 3. Load Enrolled Students (via class_enrollments)
      const { data: enrollData, error: enrollError } = await supabase
        .from('class_enrollments')
        .select(`
          student_id,
          student:student_id (id, full_name, email, phone)
        `)
        .eq('class_id', classId)
        .eq('status', 'active');
      if (enrollError) throw enrollError;
      setStudents(enrollData?.map((e: any) => e.student) || []);

    } catch (error) {
      console.error('Error loading class:', error);
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // GROUP REGISTRATION LOGIC
  // ==========================================================
  const addStudentRow = () => {
    setNewStudents([
      ...newStudents,
      {
        full_name: '',
        email: '',
        phone: '',
        gender: '',
        nationality: '',
        date_of_birth: '',
        educational_background: '',
        emergency_contact: '',
        emergency_phone: '',
      }
    ]);
  };

  const removeStudentRow = (index: number) => {
    if (newStudents.length <= 1) {
      alert('You must have at least one student.');
      return;
    }
    const updated = newStudents.filter((_, i) => i !== index);
    setNewStudents(updated);
  };

  const updateStudentRow = (index: number, field: string, value: any) => {
    const updated = [...newStudents];
    updated[index] = { ...updated[index], [field]: value };
    setNewStudents(updated);
  };

  const handleBulkRegister = async () => {
    // 1. Basic Validation
    const invalidRows = newStudents.filter(s => !s.full_name.trim() || !s.email.trim());
    if (invalidRows.length > 0) {
      alert('Please ensure all students have a Name and Email.');
      return;
    }

    setSubmittingStudents(true);
    try {
      // 2. Batch Insert all students into 'users' table
      const usersToInsert = newStudents.map(s => ({
        full_name: s.full_name.trim(),
        email: s.email.trim(),
        phone: s.phone || null,
        gender: s.gender || null,
        nationality: s.nationality || null,
        date_of_birth: s.date_of_birth || null,
        educational_background: s.educational_background || null, // ✅ Matches your CSV
        emergency_contact: s.emergency_contact || null,
        emergency_phone: s.emergency_phone || null,
        role: 'student',
        is_active: true,
      }));

      const { data: createdUsers, error: createError } = await supabase
        .from('users')
        .insert(usersToInsert)
        .select('id');
      
      if (createError) throw createError;
      if (!createdUsers) throw new Error('Failed to create users.');

      // 3. Batch Enroll them into the class
      const enrollmentsToInsert = createdUsers.map((user: any) => ({
        class_id: classId,
        student_id: user.id,
        status: 'active',
      }));

      const { error: enrollError } = await supabase
        .from('class_enrollments')
        .insert(enrollmentsToInsert);
      
      if (enrollError) throw enrollError;

      // 4. Success State
      alert(`✅ Successfully registered and enrolled ${createdUsers.length} student(s)!`);
      setShowAddStudentModal(false);
      setNewStudents([{ full_name: '', email: '', phone: '', gender: '', nationality: '', date_of_birth: '', educational_background: '', emergency_contact: '', emergency_phone: '' }]);
      loadClassDetails(); // Refresh the student list

    } catch (error: any) {
      console.error('Bulk Registration Error:', error);
      alert('Error: ' + error.message);
    } finally {
      setSubmittingStudents(false);
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto relative">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/dashboard/classes/management" className="text-blue-600 hover:underline text-sm mb-2 inline-block">← Back to Management</Link>
          <h1 className="text-2xl font-bold text-gray-900">📋 Class Details</h1>
        </div>
        <div className="flex gap-3">
          {/* NEW: Add Students Button */}
          <button 
            onClick={() => setShowAddStudentModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2"
          >
            ➕ Add Students
          </button>
          <Link href={`/dashboard/classes/${classId}/edit`}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm">✏️ Edit Class</button>
          </Link>
        </div>
      </div>

      {/* Class Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Status & Teacher</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Status</span><span className="font-medium text-blue-600">{classData?.status}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Teacher</span><span className="font-medium">{classData?.teacher?.full_name || 'TBD'}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Room</span><span className="font-medium">{classData?.room?.name || 'TBD'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Max Students</span><span className="font-medium">{classData?.max_students}</span></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Course & Duration</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Course</span><span className="font-medium">{classData?.course?.name || 'N/A'}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Total Sessions</span><span className="font-medium">{classData?.total_sessions}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Hours/Session</span><span className="font-medium">{classData?.hours_per_session}h</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-medium">{classData?.requested_duration_days} days</span></div>
          </div>
        </div>
      </div>

      {/* Proposed Schedule Grid */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-8">
        <h3 className="font-bold text-gray-800 mb-4">🗓️ Proposed Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {slots.map((slot, idx) => (
            <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm flex justify-between items-center">
              <span className="text-blue-800 font-medium">Session {slot.session_index}</span>
              <span className="text-gray-600">
                {format(parseISO(slot.start_time), 'MMM d, yyyy')} 
                <span className="mx-1 text-gray-400">|</span> 
                {slot.start_time.split('T')[1].slice(0,5)} - {slot.end_time.split('T')[1].slice(0,5)}
              </span>
              <span className="text-blue-600 text-xs font-medium px-2 py-1 bg-white rounded border border-blue-200">
                {slot.room_id ? 'Room Booked' : 'TBD'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Enrolled Students List */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="font-bold text-gray-800 mb-4">👨‍🎓 Enrolled Students ({students.length})</h3>
        {students.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No students enrolled yet. Click "Add Students" above to get started.</p>
        ) : (
          <div className="space-y-2">
            {students.map((student) => (
              <div key={student.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <span className="font-medium text-gray-800">{student.full_name}</span>
                  <span className="ml-4 text-sm text-gray-500">{student.email}</span>
                </div>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Active</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* GROUP REGISTRATION MODAL */}
      {/* ========================================================== */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Group Registration</h2>
                <p className="text-sm text-gray-500">Add multiple students to this class at once.</p>
              </div>
              <button 
                onClick={() => setShowAddStudentModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable Table) */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-gray-100 text-gray-600 uppercase text-[10px] leading-tight sticky top-0 z-10">
                    <tr>
                      <th className="p-2 border-b border-gray-200 min-w-[140px]">Full Name *</th>
                      <th className="p-2 border-b border-gray-200 min-w-[160px]">Email *</th>
                      <th className="p-2 border-b border-gray-200 min-w-[120px]">Phone</th>
                      <th className="p-2 border-b border-gray-200 min-w-[100px]">Gender</th>
                      <th className="p-2 border-b border-gray-200 min-w-[120px]">Nationality</th>
                      <th className="p-2 border-b border-gray-200 min-w-[110px]">DOB</th>
                      <th className="p-2 border-b border-gray-200 min-w-[130px]">Education Level</th>
                      <th className="p-2 border-b border-gray-200 min-w-[130px]">Emerg. Contact</th>
                      <th className="p-2 border-b border-gray-200 min-w-[130px]">Emerg. Phone</th>
                      <th className="p-2 border-b border-gray-200 w-10 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {newStudents.map((student, index) => (
                      <tr key={index} className="hover:bg-gray-50/50">
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.full_name} 
                            onChange={(e) => updateStudentRow(index, 'full_name', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                            placeholder="John Doe"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="email" 
                            value={student.email} 
                            onChange={(e) => updateStudentRow(index, 'email', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                            placeholder="john@email.com"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.phone} 
                            onChange={(e) => updateStudentRow(index, 'phone', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <select 
                            value={student.gender} 
                            onChange={(e) => updateStudentRow(index, 'gender', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white"
                          >
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.nationality} 
                            onChange={(e) => updateStudentRow(index, 'nationality', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="date" 
                            value={student.date_of_birth} 
                            onChange={(e) => updateStudentRow(index, 'date_of_birth', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.educational_background} 
                            onChange={(e) => updateStudentRow(index, 'educational_background', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.emergency_contact} 
                            onChange={(e) => updateStudentRow(index, 'emergency_contact', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={student.emergency_phone} 
                            onChange={(e) => updateStudentRow(index, 'emergency_phone', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button 
                            onClick={() => removeStudentRow(index)}
                            className="text-red-400 hover:text-red-600 text-lg font-bold leading-none"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Row Button */}
              <button 
                onClick={addStudentRow}
                className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-500 hover:text-blue-600 transition"
              >
                ➕ Add Another Student
              </button>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button 
                onClick={() => setShowAddStudentModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkRegister}
                disabled={submittingStudents}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {submittingStudents ? 'Saving...' : '✅ Register & Enroll All'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}