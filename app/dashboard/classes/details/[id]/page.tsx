'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Helper for dropdowns
const GENDERS = ['Male', 'Female', 'Other', 'prefer_not_to_say'];
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
  'Primary School',
  'Secondary / High School',
  'Diploma / Polytechnic',
  'Bachelor\'s Degree',
  'Master\'s Degree',
  'Doctorate / PhD',
  'Professional Certification',
  'Other'
];

export default function ClassDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [classData, setClassData] = useState<any>(null);
  const [classCode, setClassCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseLevel, setCourseLevel] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [lockedSchedules, setLockedSchedules] = useState<any[]>([]);
  const [inquiryPreferences, setInquiryPreferences] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);

  // --- Modal State ---
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [submittingStudents, setSubmittingStudents] = useState(false);
  const [modalMode, setModalMode] = useState<'new' | 'existing'>('new');

  // New Student State (Each row now has its own availabilitySlots)
  const [newStudents, setNewStudents] = useState<any[]>([
    {
      full_name: '',
      email: '',
      phone: '',
      gender: 'prefer_not_to_say',
      nationality: '',
      date_of_birth: '',
      educational_background: '',
      emergency_contact: '',
      emergency_phone: '',
      availabilitySlots: [] 
    }
  ]);

  // Existing Student State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);

  const loadDetails = async () => {
    try {
      const { id } = await params;
      
      const { data: c, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !c) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setClassData(c);
      setClassCode(c.class_code || 'N/A'); // ✅ Store the Class Code

      const [
        courseRes,
        modulesRes,
        teacherRes,
        roomsRes,
        scheduleRes,
        inquiryRes,
        studentRes
      ] = await Promise.all([
        supabase.from('courses').select('name').eq('id', c.course_id).single(),
        supabase.from('course_modules').select('level').eq('course_id', c.course_id).limit(1).single(),
        c.teacher_id ? supabase.from('users').select('full_name').eq('id', c.teacher_id).single() : Promise.resolve({ data: null }),
        supabase.from('rooms').select('id, name').eq('is_active', true),
        supabase.from('class_options').select('*').eq('class_id', id).order('session_index'),
        supabase.from('inquiry_availability').select('*').eq('class_id', id),
        supabase.from('class_enrollments').select('id, student_id, student:student_id(id, full_name, email)').eq('class_id', id).eq('status', 'active')
      ]);

      if (courseRes.data) setCourseName(courseRes.data.name);
      if (modulesRes.data) setCourseLevel(modulesRes.data.level || 'N/A');
      if (teacherRes.data) setTeacherName(teacherRes.data.full_name);
      if (scheduleRes.data) {
        const roomMap: Record<string, string> = {};
        (roomsRes.data || []).forEach((room: any) => {
          roomMap[room.id] = room.name;
        });
        const schedulesWithRoomNames = scheduleRes.data.map((s: any) => ({
          ...s,
          room_name: roomMap[s.room_id] || 'No Room'
        }));
        setLockedSchedules(schedulesWithRoomNames);
      }
      if (inquiryRes.data) setInquiryPreferences(inquiryRes.data || []);
      if (studentRes.data) setEnrolledStudents(studentRes.data);

    } catch (err) {
      console.error('Error loading details:', err);
      setNotFound(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDetails();
  }, []);

  // ==========================================================
  // NEW STUDENTS LOGIC
  // ==========================================================
  const addStudentRow = () => {
    setNewStudents([
      ...newStudents,
      {
        full_name: '',
        email: '',
        phone: '',
        gender: 'prefer_not_to_say',
        nationality: '',
        date_of_birth: '',
        educational_background: '',
        emergency_contact: '',
        emergency_phone: '',
        availabilitySlots: []
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

  // BULK AVAILABILITY INJECTOR
  const applyBulkAvailability = (days: number[], start: string, end: string) => {
    const slotsToApply = days.map(day => ({ day_of_week: day, start_time: start, end_time: end }));
    
    const updated = newStudents.map(student => ({
      ...student,
      availabilitySlots: slotsToApply
    }));
    setNewStudents(updated);
    alert(`✅ Applied availability to all ${updated.length} students!`);
  };

  const addAvailabilitySlotToRow = (studentIndex: number, slot: any) => {
    const updated = [...newStudents];
    const exists = updated[studentIndex].availabilitySlots.some(
      (s: any) => s.day_of_week === slot.day_of_week && s.start_time === slot.start_time
    );
    if (!exists) {
      updated[studentIndex].availabilitySlots.push(slot);
      setNewStudents(updated);
    }
  };

  const removeAvailabilitySlotFromRow = (studentIndex: number, slotIndex: number) => {
    const updated = [...newStudents];
    updated[studentIndex].availabilitySlots.splice(slotIndex, 1);
    setNewStudents(updated);
  };

  // ==========================================================
  // EXISTING STUDENTS LOGIC
  // ==========================================================
  const searchExistingStudents = async () => {
    if (!searchTerm.trim()) return;
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'student')
      .eq('is_active', true)
      .ilike('full_name', `%${searchTerm}%`)
      .limit(10);
    
    if (!error) setSearchResults(data || []);
  };

  const toggleExistingSelection = (id: string) => {
    setSelectedExistingIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ==========================================================
  // ENROLL EXISTING STUDENTS - OPTIMIZED FOR SPEED
  // ==========================================================
  const enrollExistingStudents = async () => {
    if (selectedExistingIds.length === 0) {
      alert('Please select at least one student.');
      return;
    }

    setSubmittingStudents(true);
    try {
      // 1. Fetch Schedule for the NEW class
      const { data: classSchedule, error: scheduleError } = await supabase
        .from('class_options')
        .select('start_time, end_time')
        .eq('class_id', classData.id);

      if (scheduleError || !classSchedule || classSchedule.length === 0) {
        alert('Error: This class has no scheduled times. Please set the schedule before enrolling students.');
        setSubmittingStudents(false);
        return;
      }

      // 2. Fetch existing enrollments for ALL selected students in one go
      const { data: allExistingEnrollments, error: enrollError } = await supabase
        .from('class_enrollments')
        .select('student_id, class_id')
        .eq('status', 'active')
        .in('student_id', selectedExistingIds);

      if (enrollError) throw enrollError;

      // 3. Extract unique existing class IDs
      const existingClassIds = [...new Set((allExistingEnrollments || []).map(e => e.class_id))];

      let existingSchedules: any[] = [];
      if (existingClassIds.length > 0) {
        // 4. Fetch schedules for ALL existing classes in one bulk query
        const { data: schedulesData, error: schError } = await supabase
          .from('class_options')
          .select('class_id, start_time, end_time')
          .in('class_id', existingClassIds);
        
        if (schError) throw schError;
        existingSchedules = schedulesData || [];
      }

      // 5. Check conflicts for each student
      for (const studentId of selectedExistingIds) {
        // Find which classes this specific student is enrolled in
        const studentClassIds = (allExistingEnrollments || [])
          .filter(e => e.student_id === studentId)
          .map(e => e.class_id);

        // Find the schedules for those specific classes
        const studentSchedules = existingSchedules.filter(s => studentClassIds.includes(s.class_id));

        // Check overlap
        let hasConflict = false;
        for (const newSlot of classSchedule) {
          const newStart = new Date(newSlot.start_time);
          const newEnd = new Date(newSlot.end_time);

          for (const oldSlot of studentSchedules) {
            const oldStart = new Date(oldSlot.start_time);
            const oldEnd = new Date(oldSlot.end_time);

            if (newStart < oldEnd && newEnd > oldStart) {
              hasConflict = true;
              break;
            }
          }
          if (hasConflict) break;
        }

        if (hasConflict) {
          const studentName = searchResults.find(s => s.id === studentId)?.full_name || 'Student';
              
          alert(`❌ Conflict detected! "${studentName}" is already enrolled in another class that overlaps with this schedule. They were not enrolled.`);
          setSubmittingStudents(false);
          return; 
        }
      }

      // 6. If all passed, insert enrollments
      const enrollmentsToInsert = selectedExistingIds.map(id => ({
        class_id: classData.id,
        student_id: id,
        status: 'active',
      }));

      const { error: enrollErrorFinal } = await supabase
        .from('class_enrollments')
        .insert(enrollmentsToInsert);

      if (enrollErrorFinal) throw enrollErrorFinal;

      alert(`✅ Successfully enrolled ${selectedExistingIds.length} existing student(s)!`);
      setSelectedExistingIds([]);
      setSearchResults([]);
      setSearchTerm('');
      loadDetails();
    } catch (error: any) {
      alert('Error enrolling students: ' + error.message);
    } finally {
      setSubmittingStudents(false);
    }
  };

  // ==========================================================
  // FINAL SUBMIT (NEW STUDENTS) - OPTIMIZED FOR SPEED
  // ==========================================================
  const handleBulkRegister = async () => {
    const validRows = newStudents.filter(s => s.full_name.trim() && s.email.trim());
    if (validRows.length === 0) {
      alert('Please ensure at least one student has a Name and Email.');
      return;
    }

    setSubmittingStudents(true);
    try {
      // 1. Fetch the Schedule for this class
      const { data: classSchedule, error: scheduleError } = await supabase
        .from('class_options')
        .select('start_time, end_time')
        .eq('class_id', classData.id);

      if (scheduleError) throw new Error('Failed to load class schedule for conflict check.');
      if (!classSchedule || classSchedule.length === 0) {
        alert('Error: This class has no scheduled times. Please set the schedule before enrolling students.');
        setSubmittingStudents(false);
        return;
      }

      // 2. Prepare user insert data
      const usersToInsert = validRows.map(s => ({
        full_name: s.full_name.trim(),
        email: s.email.trim(),
        phone: s.phone || null,
        gender: s.gender === '' || s.gender === 'prefer_not_to_say' ? null : s.gender,
        nationality: s.nationality || null,
        date_of_birth: s.date_of_birth || null,
        educational_background: s.educational_background || null,
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

      // 3. Check for SCHEDULE CONFLICTS for every new student
      for (let i = 0; i < createdUsers.length; i++) {
        const userId = createdUsers[i].id;
        const studentName = validRows[i].full_name;

        const { data: existingEnrollments, error: enrollError } = await supabase
          .from('class_enrollments')
          .select('class_id')
          .eq('student_id', userId)
          .eq('status', 'active');

        if (enrollError) throw enrollError;

        if (existingEnrollments && existingEnrollments.length > 0) {
          const existingClassIds = existingEnrollments.map(e => e.class_id);

          const { data: existingSchedules, error: existingSchError } = await supabase
            .from('class_options')
            .select('start_time, end_time')
            .in('class_id', existingClassIds);

          if (existingSchError) throw existingSchError;

          let hasConflict = false;
          for (const newSlot of classSchedule) {
            const newStart = new Date(newSlot.start_time);
            const newEnd = new Date(newSlot.end_time);

            for (const oldSlot of existingSchedules || []) {
              const oldStart = new Date(oldSlot.start_time);
              const oldEnd = new Date(oldSlot.end_time);

              if (newStart < oldEnd && newEnd > oldStart) {
                hasConflict = true;
                break;
              }
            }
            if (hasConflict) break;
          }

          if (hasConflict) {
            await supabase.from('users').delete().eq('id', userId);
            alert(`❌ Conflict detected! "${studentName}" is already enrolled in another class that overlaps with this schedule. They were not enrolled. Please resolve their schedule first.`);
            setSubmittingStudents(false);
            return; 
          }
        }
      }

      // 4. If NO conflicts found, proceed with Enrollment
      const enrollmentsToInsert = createdUsers.map((user: any) => ({
        class_id: classData.id,
        student_id: user.id,
        status: 'active',
      }));

      const { error: enrollError } = await supabase
        .from('class_enrollments')
        .insert(enrollmentsToInsert);
      
      if (enrollError) throw enrollError;

      // 5. Save Availability Slots
      for (let i = 0; i < createdUsers.length; i++) {
        const student = validRows[i];
        const userId = createdUsers[i].id;
        if (student.availabilitySlots && student.availabilitySlots.length > 0) {
          const slotsToInsert = student.availabilitySlots.map((slot: any) => ({
            student_id: userId,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: true
          }));
          await supabase.from('student_availability').insert(slotsToInsert);
        }
      }

      alert(`✅ Successfully registered and enrolled ${createdUsers.length} student(s)!`);
      setShowAddStudentModal(false);
      setNewStudents([{ full_name: '', email: '', phone: '', gender: 'prefer_not_to_say', nationality: '', date_of_birth: '', educational_background: '', emergency_contact: '', emergency_phone: '', availabilitySlots: [] }]);
      loadDetails();

    } catch (error: any) {
      console.error('Bulk Registration Error:', error);
      alert('Error: ' + error.message);
    } finally {
      setSubmittingStudents(false);
    }
  };

  // ==========================================================
  // UNENROLL STUDENT LOGIC
  // ==========================================================
  const handleUnenrollStudent = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to remove this student from the class? (The student account will NOT be deleted).')) return;

    try {
      const { error } = await supabase
        .from('class_enrollments')
        .delete()
        .eq('id', enrollmentId);

      if (error) throw error;

      alert('✅ Student removed from class successfully.');
      loadDetails();
    } catch (error: any) {
      alert('Error removing student: ' + error.message);
    }
  };

  // ==========================================================
  // STATUS & UI HELPERS
  // ==========================================================
  const updateStatus = async (newStatus: string) => {
    if (!classData) return;
    
    try {
      const { error } = await supabase
        .from('classes')
        .update({ status: newStatus })
        .eq('id', classData.id);

      if (error) {
        alert('Failed to update status: ' + error.message);
        return;
      }

      router.push('/dashboard/classes/management');
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!classData) return;
    
    if (confirm('Delete this class and all associated data? This action cannot be undone.')) {
      try {
        await supabase.from('class_options').delete().eq('class_id', classData.id);
        await supabase.from('inquiry_availability').delete().eq('class_id', classData.id);
        
        const { error } = await supabase
          .from('classes')
          .delete()
          .eq('id', classData.id);

        if (error) {
          alert('Failed to delete class: ' + error.message);
          return;
        }

        router.push('/dashboard/classes/management');
      } catch (err: any) {
        alert('Error deleting class: ' + err.message);
      }
    }
  };

  const handleFinalize = async () => {
    if (!classData) return;

    try {
      const { data: options, error: optionsError } = await supabase
        .from('class_options')
        .select('*')
        .eq('class_id', classData.id);

      if (optionsError) {
        alert('Failed to fetch class options: ' + optionsError.message);
        return;
      }

      if (!options || options.length === 0) {
        alert('No class options found to finalize.');
        return;
      }

      for (const opt of options) {
        const { data: teacherConflicts, error: teacherError } = await supabase
          .from('bookings')
          .select('*')
          .eq('teacher_id', opt.teacher_id)
          .eq('start_time', opt.start_time);

        if (teacherError) {
          alert('Failed to check teacher conflicts: ' + teacherError.message);
          return;
        }

        if (teacherConflicts && teacherConflicts.length > 0) {
          alert(`Conflict detected! Teacher is already booked for ${opt.start_time}`);
          return;
        }

        const { data: roomConflicts, error: roomError } = await supabase
          .from('bookings')
          .select('*')
          .eq('room_id', opt.room_id)
          .eq('start_time', opt.start_time);

        if (roomError) {
          alert('Failed to check room conflicts: ' + roomError.message);
          return;
        }

        if (roomConflicts && roomConflicts.length > 0) {
          alert(`Conflict detected! Room is already booked for ${opt.start_time}`);
          return;
        }
      }

      const { error: updateError } = await supabase
        .from('classes')
        .update({ status: 'active' })
        .eq('id', classData.id);

      if (updateError) {
        alert('Failed to update class status: ' + updateError.message);
        return;
      }

      const bookingInserts = options.map((opt) => ({
        room_id: opt.room_id,
        teacher_id: opt.teacher_id,
        course_id: classData.course_id,
        start_time: opt.start_time,
        end_time: opt.end_time,
        status: 'confirmed',
        class_id: classData.id
      }));

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert(bookingInserts)
        .select();

      if (bookingError) {
        console.error('Booking insert error:', bookingError);
        alert('Failed to create bookings: ' + bookingError.message);
        await supabase.from('classes').update({ status: 'pending_enrollment' }).eq('id', classData.id);
        return;
      }

      router.push('/dashboard/classes/management');

    } catch (err: any) {
      console.error('Error finalizing class:', err);
      alert('Error finalizing class: ' + err.message);
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'draft': 'Draft',
      'pending_admin': 'Pending Admin Approval',
      'pending_student': 'Pending Student Approval',
      'pending_enrollment': 'Pending Enrollment',
      'active': 'Active',
      'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      'draft': 'text-gray-600',
      'pending_admin': 'text-blue-600',
      'pending_student': 'text-yellow-600',
      'pending_enrollment': 'text-purple-600',
      'active': 'text-green-600',
      'cancelled': 'text-red-600'
    };
    return colorMap[status] || 'text-gray-600';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (notFound) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/classes/management">
          <button className="mb-6 text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          <h2 className="text-xl font-bold mb-2">Class Not Found</h2>
          <p>The class you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes/management">
          <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">📋 Class Details</h1>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/dashboard/classes/management">
            <button className="text-gray-600 hover:text-gray-900">← Back to Management</button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">📋 Class Details</h1>
        </div>
        <button 
          onClick={() => setShowAddStudentModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2"
        >
          ➕ Add Students
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6 border border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Status:</span> 
            <span className={`font-bold capitalize ${getStatusColor(classData.status)}`}>
              {getStatusDisplay(classData.status)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Class Code:</span> 
            <span className="font-mono font-bold text-blue-600">{classCode}</span>
          </div>
          <div>
            <span className="text-gray-500">Course:</span> 
            <span className="font-medium">{courseName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Teacher:</span> 
            <span className="font-medium">{teacherName || 'Not Assigned'}</span>
          </div>
          <div>
            <span className="text-gray-500">Level:</span> 
            <span className="font-medium">{courseLevel || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Max Students:</span> 
            <span className="font-medium">{classData.max_students}</span>
          </div>
          <div>
            <span className="text-gray-500">Total Sessions:</span> 
            <span className="font-medium">{classData.total_sessions}</span>
          </div>
          <div>
            <span className="text-gray-500">Start Date:</span> 
            <span className="font-medium">{classData.requested_start_date || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Duration:</span> 
            <span className="font-medium">{classData.requested_duration_days || 'N/A'} days</span>
          </div>
        </div>

        {inquiryPreferences.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📋 Student Preferences</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {inquiryPreferences.map((pref, idx) => (
                <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200">
                  <span className="font-medium">Day {pref.day_of_week}:</span> 
                  {pref.start_time} - {pref.end_time}
                </div>
              ))}
            </div>
          </div>
        )}

        {lockedSchedules.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 mb-2">📅 Proposed Schedule</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {lockedSchedules.map((s, idx) => (
                <div key={idx} className="p-2 bg-blue-50 rounded border border-blue-100 text-blue-800 flex gap-2">
                  <span className="font-medium">Session {idx + 1}:</span> 
                  <span className="text-gray-600">
                    {s.start_time} - {s.end_time}
                  </span>
                  <span className="ml-1 text-xs bg-white px-1 rounded text-gray-500">
                    {s.room_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-3 border-t pt-4">
          {classData.status === 'draft' && (
            <Link href={`/dashboard/classes/inquire/results?${new URLSearchParams({
              courseId: classData.course_id,
              packageId: classData.package_id || '',
              maxStudents: classData.max_students.toString(),
              startDate: classData.requested_start_date || '',
              duration: classData.requested_duration_days?.toString() || '30',
              availabilities: JSON.stringify(inquiryPreferences) 
            }).toString()}`}>
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                View Ranking Options
              </button>
            </Link>
          )}

          {classData.status === 'pending_admin' && (
            <button 
              onClick={() => updateStatus('pending_student')} 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Submit for Student Approval
            </button>
          )}

          {classData.status === 'pending_student' && (
            <>
              <button 
                onClick={() => updateStatus('pending_enrollment')} 
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Student Confirmed
              </button>
              <button 
                onClick={() => updateStatus('cancelled')} 
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancel (Student Rejected)
              </button>
            </>
          )}

          {classData.status === 'pending_enrollment' && (
            <button 
              onClick={handleFinalize} 
              className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
            >
              Confirm & Enroll (Lock Calendar)
            </button>
          )}

          {classData.status === 'active' && (
            <div className="text-sm text-green-600 bg-green-50 px-4 py-2 rounded border border-green-200">
              ✅ Class is active and scheduled
            </div>
          )}

          {classData.status === 'cancelled' && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded border border-red-200">
              ❌ Class has been cancelled
            </div>
          )}

          <button 
            onClick={handleDelete} 
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Delete Class
          </button>

          <button 
            onClick={() => setShowAddStudentModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2"
          >
            ➕ Add Students
          </button>
        </div>
      </div>

      {/* ========================================================== */}
      {/* ✅ ENROLLED STUDENTS SECTION */}
      {/* ========================================================== */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-8">
        <h3 className="font-bold text-gray-800 mb-4">👨‍🎓 Enrolled Students ({enrolledStudents.length})</h3>
        {enrolledStudents.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No students enrolled yet. Click <strong>"Add Students"</strong> above to get started.</p>
        ) : (
          <div className="space-y-2">
            {enrolledStudents.map((enrollment) => (
              <div key={enrollment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <span className="font-medium text-gray-800">
                    {enrollment.student?.full_name || 'Unknown Student'}
                  </span>
                  <span className="ml-4 text-sm text-gray-500">
                    {enrollment.student?.email || ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Active</span>
                  <button 
                    onClick={() => handleUnenrollStudent(enrollment.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* GROUP REGISTRATION MODAL (NEW & EXISTING) */}
      {/* ========================================================== */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Enroll Students</h2>
                <p className="text-sm text-gray-500">Add new or existing students to this class.</p>
              </div>
              <button 
                onClick={() => setShowAddStudentModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
              
              {/* MODE TOGGLE */}
              <div className="flex gap-4 bg-white p-1 rounded-lg border border-gray-200 shadow-sm mb-6">
                <button
                  onClick={() => setModalMode('new')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                    modalMode === 'new' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  ➕ New Students
                </button>
                <button
                  onClick={() => setModalMode('existing')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                    modalMode === 'existing' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  👤 Existing Students
                </button>
              </div>

              {/* ================================ */}
              {/* MODE: NEW STUDENTS */}
              {/* ================================ */}
              {modalMode === 'new' && (
                <div className="space-y-6">
                  
                  {/* BULK AVAILABILITY INJECTOR */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-blue-800 mb-1">⚡ Apply Availability to All Rows</label>
                      <div className="flex flex-wrap gap-2">
                        <select 
                          id="bulkDays"
                          className="px-3 py-1.5 border border-blue-300 rounded bg-white text-sm"
                        >
                          <option value="weekdays">Mon - Fri</option>
                          <option value="fullweek">Mon - Sun</option>
                        </select>
                        <input 
                          id="bulkStart"
                          type="time" 
                          defaultValue="09:00" 
                          className="px-2 py-1.5 border border-blue-300 rounded bg-white text-sm"
                        />
                        <span className="text-blue-800 text-sm font-medium">to</span>
                        <input 
                          id="bulkEnd"
                          type="time" 
                          defaultValue="17:00" 
                          className="px-2 py-1.5 border border-blue-300 rounded bg-white text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const days = (document.getElementById('bulkDays') as HTMLSelectElement).value === 'weekdays' 
                          ? [1,2,3,4,5] 
                          : [0,1,2,3,4,5,6];
                        const start = (document.getElementById('bulkStart') as HTMLInputElement).value;
                        const end = (document.getElementById('bulkEnd') as HTMLInputElement).value;
                        applyBulkAvailability(days, start, end);
                      }}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                    >
                      Apply to All
                    </button>
                  </div>

                  {/* NEW STUDENT ROWS */}
                  <div className="space-y-6">
                    {newStudents.map((student, index) => (
                      <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 relative">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                          <span className="font-bold text-gray-700 text-sm uppercase tracking-wider">
                            Student #{index + 1}
                          </span>
                          <button 
                            onClick={() => removeStudentRow(index)}
                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                            disabled={newStudents.length <= 1}
                          >
                            ✕ Remove
                          </button>
                        </div>

                        {/* Personal Info Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                            <input type="text" value={student.full_name} onChange={(e) => updateStudentRow(index, 'full_name', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Enter student's full name" />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                            <input type="email" value={student.email} onChange={(e) => updateStudentRow(index, 'email', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="student@email.com" />
                          </div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label><input type="text" value={student.phone} onChange={(e) => updateStudentRow(index, 'phone', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" /></div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                            <select value={student.gender} onChange={(e) => updateStudentRow(index, 'gender', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                              <option value="prefer_not_to_say">Prefer not to say</option>
                              {GENDERS.filter(g => g !== 'prefer_not_to_say').map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Nationality</label>
                            <select value={student.nationality} onChange={(e) => updateStudentRow(index, 'nationality', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                              <option value="">Select Nationality</option>
                              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">DOB</label><input type="date" value={student.date_of_birth} onChange={(e) => updateStudentRow(index, 'date_of_birth', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" /></div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">Education</label>
                            <select value={student.educational_background} onChange={(e) => updateStudentRow(index, 'educational_background', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                              <option value="">Select</option>
                              {EDUCATION_LEVELS.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-2 border-t border-gray-100 pt-3 mt-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><label className="block text-xs font-medium text-gray-500 mb-1">Emergency Contact</label><input type="text" value={student.emergency_contact} onChange={(e) => updateStudentRow(index, 'emergency_contact', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" /></div>
                              <div><label className="block text-xs font-medium text-gray-500 mb-1">Emergency Phone</label><input type="text" value={student.emergency_phone} onChange={(e) => updateStudentRow(index, 'emergency_phone', e.target.value)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" /></div>
                            </div>
                          </div>
                        </div>

                        {/* PER-STUDENT AVAILABILITY SECTION */}
                        <div className="border-t border-gray-200 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-gray-700">Availability Slots</h4>
                            <button 
                              type="button"
                              onClick={() => {
                                const day = prompt('Enter day (e.g., Monday, Tuesday):');
                                const start = prompt('Enter start time (HH:MM):');
                                const end = prompt('Enter end time (HH:MM):');
                                if (day && start && end) {
                                  const dayMap: Record<string, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
                                  const dayNum = dayMap[day];
                                  if (dayNum !== undefined) {
                                    addAvailabilitySlotToRow(index, { day_of_week: dayNum, start_time: start, end_time: end });
                                  } else {
                                    alert('Invalid day name.');
                                  }
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              + Add Slot
                            </button>
                          </div>
                          
                          {student.availabilitySlots && student.availabilitySlots.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {student.availabilitySlots.map((slot: any, sIndex: number) => (
                                <div key={sIndex} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs">
                                  <span className="text-blue-700 font-medium">
                                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][slot.day_of_week]}:
                                  </span>
                                  <span className="text-gray-600">{slot.start_time} - {slot.end_time}</span>
                                  <button 
                                    onClick={() => removeAvailabilitySlotFromRow(index, sIndex)}
                                    className="text-red-400 hover:text-red-600 ml-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No availability set for this student.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={addStudentRow} className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:border-blue-500 hover:text-blue-600 transition bg-white">
                    ➕ Add Another Student
                  </button>
                </div>
              )}

              {/* ================================ */}
              {/* MODE: EXISTING STUDENTS */}
              {/* ================================ */}
              {modalMode === 'existing' && (
                <div className="space-y-4 bg-white p-6 rounded-lg border border-gray-200">
                  <h3 className="font-medium text-gray-700 mb-2">Search & Select Existing Students</h3>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchExistingStudents()}
                      placeholder="Search by name..."
                      className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                    <button 
                      onClick={searchExistingStudents}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                    >
                      Search
                    </button>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
                      {searchResults.map((student) => (
                        <div key={student.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                          <div>
                            <div className="font-medium text-gray-800">{student.full_name}</div>
                            <div className="text-xs text-gray-500">{student.email}</div>
                          </div>
                          <button 
                            onClick={() => toggleExistingSelection(student.id)}
                            className={`px-3 py-1 text-xs rounded-full transition ${
                              selectedExistingIds.includes(student.id)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            {selectedExistingIds.includes(student.id) ? '✔ Selected' : 'Select'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : searchTerm && (
                    <p className="text-sm text-gray-400 text-center py-4">No students found.</p>
                  )}

                  <div className="flex justify-end pt-4 border-t mt-4">
                    <button 
                      onClick={enrollExistingStudents}
                      disabled={selectedExistingIds.length === 0 || submittingStudents}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm disabled:opacity-50"
                    >
                      Enroll Selected ({selectedExistingIds.length})
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-white shrink-0">
              <button onClick={() => setShowAddStudentModal(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Cancel</button>
              {modalMode === 'new' && (
                <button onClick={handleBulkRegister} disabled={submittingStudents} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
                  {submittingStudents ? 'Saving...' : '✅ Register & Enroll All'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}