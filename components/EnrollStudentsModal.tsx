// components/EnrollStudentsModal.tsx
// ⭐ Unified enrollment modal for BOTH private and group classes
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ==========================================
// CONSTANTS
// ==========================================
const GENDERS = ['Male', 'Female', 'Other'];
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
  "Bachelor's Degree",
  "Master's Degree",
  'Doctorate / PhD',
  'Professional Certification',
  'Other'
];
const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

// ==========================================
// TYPES
// ==========================================
interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface NewStudentRow {
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  nationality: string;
  date_of_birth: string;
  educational_background: string;
  emergency_contact: string;
  emergency_phone: string;
  availabilitySlots: AvailabilitySlot[];
}

interface ClassContext {
  type: 'private' | 'group';
  classId: string;              // classes.id OR scheduled_group_classes.id
  className?: string;           // For display: "PL-xxx" or "MSE Intro 2H26"
  courseName?: string;          // For display
  moduleName?: string;          // For display
  maxStudents?: number;         // For capacity check
  currentStudents?: number;     // For capacity check
  // Optional schedule info for conflict checking (private classes only)
  scheduleSlots?: Array<{ start_time: string; end_time: string }>;
}

interface EnrollStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  classContext: ClassContext;
  defaultTab?: 'new' | 'existing';
}

// ==========================================
// CONFLICT TYPE
// ==========================================
interface ConflictInfo {
  studentId: string;
  studentName: string;
  conflicts: Array<{
    type: 'private' | 'group' | 'trial';
    description: string;
    class_code?: string;
    time: string;
  }>;
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function EnrollStudentsModal({
  isOpen,
  onClose,
  onSuccess,
  classContext,
  defaultTab = 'existing',
}: EnrollStudentsModalProps) {
  const [modalMode, setModalMode] = useState<'new' | 'existing'>(defaultTab);
  const [submitting, setSubmitting] = useState(false);

  // New students state
  const [newStudents, setNewStudents] = useState<NewStudentRow[]>([
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
      availabilitySlots: [],
    },
  ]);

  // Existing students state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setModalMode(defaultTab);
      setNewStudents([{
        full_name: '',
        email: '',
        phone: '',
        gender: '',
        nationality: '',
        date_of_birth: '',
        educational_background: '',
        emergency_contact: '',
        emergency_phone: '',
        availabilitySlots: [],
      }]);
      setSearchTerm('');
      setSearchResults([]);
      setSelectedExistingIds([]);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  // ==========================================
  // NEW STUDENTS HANDLERS
  // ==========================================
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
        availabilitySlots: [],
      },
    ]);
  };

  const removeStudentRow = (index: number) => {
    if (newStudents.length <= 1) {
      alert('You must have at least one student.');
      return;
    }
    setNewStudents(newStudents.filter((_, i) => i !== index));
  };

  const updateStudentRow = (index: number, field: keyof NewStudentRow, value: any) => {
    const updated = [...newStudents];
    updated[index] = { ...updated[index], [field]: value };
    setNewStudents(updated);
  };

  // ==========================================
  // EXISTING STUDENTS HANDLERS
  // ==========================================
  const searchExistingStudents = async () => {
    if (!searchTerm.trim()) return;

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'student')
      .eq('is_active', true)
      .ilike('full_name', `%${searchTerm}%`)
      .limit(15);

    if (!error) setSearchResults(data || []);
  };

  const toggleExistingSelection = (id: string) => {
    setSelectedExistingIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ==========================================
  // ⭐ CONFLICT DETECTION (checks BOTH private and group)
  // ==========================================
  async function detectStudentConflicts(
    studentId: string
  ): Promise<ConflictInfo | null> {
    // For group classes, we need to get the group's schedule to check overlap
    if (classContext.type === 'group') {
      // Get the group's schedule
      const { data: gc } = await supabase
        .from('scheduled_group_classes')
        .select('schedule_days, start_time, end_time, start_date, end_date')
        .eq('id', classContext.classId)
        .single();

      if (!gc) return null;

      // 1. Check existing group class enrollments for conflicts
      const { data: existingGroupEnrolls } = await supabase
        .from('group_class_enrollments')
        .select(`
          group_class_id,
          scheduled_group_classes:group_class_id (
            id,
            class_name,
            schedule_days,
            start_time,
            end_time,
            start_date,
            end_date
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active');

      // 2. Check existing private class enrollments for conflicts
      const { data: existingPrivateEnrolls } = await supabase
        .from('class_enrollments')
        .select(`
          class_id,
          classes:class_id (
            id,
            class_code,
            start_date,
            end_date
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active');

      // Get schedule for private classes
      const privateClassIds = (existingPrivateEnrolls || [])
        .map((e: any) => e.class_id)
        .filter(Boolean);

      let privateClassSchedules: any[] = [];
      if (privateClassIds.length > 0) {
        const { data: classOpts } = await supabase
          .from('class_options')
          .select('class_id, start_time, end_time')
          .in('class_id', privateClassIds);
        privateClassSchedules = classOpts || [];
      }

      // Build list of conflicts
      const conflicts: ConflictInfo['conflicts'] = [];

      // Check group conflicts
      for (const enroll of existingGroupEnrolls || []) {
        const existing = Array.isArray(enroll.scheduled_group_classes)
          ? enroll.scheduled_group_classes[0]
          : enroll.scheduled_group_classes;
        if (!existing) continue;

        // Skip if it's the same class
        if (existing.id === classContext.classId) continue;

        // Check day overlap + time overlap + date range overlap
        const dayOverlap = (gc.schedule_days || []).some((d: number) =>
          (existing.schedule_days || []).includes(d)
        );
        if (!dayOverlap) continue;

        // Time overlap
        const timeOverlap = gc.start_time < existing.end_time && existing.start_time < gc.end_time;
        if (!timeOverlap) continue;

        // Date range overlap
        const dateOverlap = gc.start_date <= existing.end_date && existing.start_date <= gc.end_date;
        if (!dateOverlap) continue;

        conflicts.push({
          type: 'group',
          description: `Already enrolled in "${existing.class_name}"`,
          class_code: existing.class_name,
          time: `${gc.start_time?.slice(0,5)} – ${gc.end_time?.slice(0,5)}`,
        });
      }

      // Check private conflicts
      for (const enroll of existingPrivateEnrolls || []) {
        const cls = Array.isArray(enroll.classes) ? enroll.classes[0] : enroll.classes;
        if (!cls) continue;

        // Get this class's schedule slots
        const classSlots = privateClassSchedules.filter(s => s.class_id === cls.id);

        for (const slot of classSlots) {
          const slotStart = new Date(slot.start_time);
          const slotEnd = new Date(slot.end_time);
          const slotDay = slotStart.getDay();
          const slotDateStr = slotStart.toISOString().split('T')[0];

          // Skip if day doesn't match
          if (!(gc.schedule_days || []).includes(slotDay)) continue;

          // Skip if date is outside our range
          if (slotDateStr < gc.start_date || slotDateStr > gc.end_date) continue;

          // Check time overlap
          const slotTimeStart = slotStart.toTimeString().slice(0, 8);
          const slotTimeEnd = slotEnd.toTimeString().slice(0, 8);
          const timeOverlap = gc.start_time < slotTimeEnd && slotTimeStart < gc.end_time;
          if (!timeOverlap) continue;

          conflicts.push({
            type: 'private',
            description: `Already enrolled in private class "${cls.class_code}"`,
            class_code: cls.class_code,
            time: `${slotTimeStart.slice(0,5)} – ${slotTimeEnd.slice(0,5)}`,
          });
        }
      }

      if (conflicts.length === 0) return null;

      // Get student name
      const { data: studentData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', studentId)
        .single();

      return {
        studentId,
        studentName: studentData?.full_name || 'Student',
        conflicts,
      };
    }

    // For private classes, we could add similar logic — for now, return null
    return null;
  }

  // ==========================================
  // ENROLL EXISTING STUDENTS
  // ==========================================
  async function enrollExistingStudents() {
    if (selectedExistingIds.length === 0) {
      alert('Please select at least one student.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Check for conflicts
      const conflictResults: ConflictInfo[] = [];
      for (const studentId of selectedExistingIds) {
        const conflict = await detectStudentConflicts(studentId);
        if (conflict) conflictResults.push(conflict);
      }

      // If conflicts found, show admin decision dialog
      if (conflictResults.length > 0) {
        let message = '⚠️ Conflicts detected:\n\n';
        conflictResults.forEach(c => {
          message += `👤 ${c.studentName}:\n`;
          c.conflicts.forEach(cf => {
            message += `   • ${cf.description} (${cf.time})\n`;
          });
          message += '\n';
        });

        message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        message += `How would you like to proceed?\n\n`;
        message += `OK = Enroll only NON-conflicting students\n`;
        message += `Cancel = Review and adjust manually`;

        const proceed = confirm(message);

        if (!proceed) {
          setSubmitting(false);
          return;
        }

        // Filter out conflicting students
        const conflictingIds = new Set(conflictResults.map(c => c.studentId));
        const cleanStudentIds = selectedExistingIds.filter(id => !conflictingIds.has(id));

        if (cleanStudentIds.length === 0) {
          alert('⚠️ All selected students have conflicts. Nothing to enroll.');
          setSubmitting(false);
          return;
        }

        // Continue with clean students only
        await enrollStudentsToClass(cleanStudentIds);

        alert(`✅ Enrolled ${cleanStudentIds.length} student(s). Skipped ${conflictingIds.size} with conflicts.`);
      } else {
        // No conflicts — enroll all
        await enrollStudentsToClass(selectedExistingIds);
        alert(`✅ Successfully enrolled ${selectedExistingIds.length} student(s)!`);
      }

      // Reset & close
      setSelectedExistingIds([]);
      setSearchResults([]);
      setSearchTerm('');
      onSuccess();
      onClose();

    } catch (err: any) {
      console.error('Enrollment error:', err);
      alert('Error enrolling students: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // ⭐ HELPER: Enroll students to the correct table based on class type
  // ==========================================
  async function enrollStudentsToClass(studentIds: string[]) {
    if (classContext.type === 'group') {
      // Check capacity (warn, not block)
      if (classContext.maxStudents && classContext.currentStudents !== undefined) {
        const available = classContext.maxStudents - classContext.currentStudents;
        if (studentIds.length > available) {
          const proceed = confirm(
            `⚠️ Class capacity warning\n\n` +
            `This class has ${available} spot(s) remaining but you're trying to enroll ${studentIds.length} student(s).\n\n` +
            `Proceed anyway? (Class will exceed max capacity)`
          );
          if (!proceed) {
            throw new Error('Enrollment cancelled due to capacity');
          }
        }
      }

      // Insert into group_class_enrollments
      const rows = studentIds.map(id => ({
        group_class_id: classContext.classId,
        student_id: id,
        status: 'active',
      }));

      const { error } = await supabase
        .from('group_class_enrollments')
        .insert(rows);

      if (error) throw error;

      // Update current_students counter
      const { data: currentGc } = await supabase
        .from('scheduled_group_classes')
        .select('current_students')
        .eq('id', classContext.classId)
        .single();

      await supabase
        .from('scheduled_group_classes')
        .update({
          current_students: (currentGc?.current_students || 0) + studentIds.length,
        })
        .eq('id', classContext.classId);

    } else {
      // Private class → class_enrollments
      const rows = studentIds.map(id => ({
        class_id: classContext.classId,
        student_id: id,
        status: 'active',
      }));

      const { error } = await supabase
        .from('class_enrollments')
        .insert(rows);

      if (error) throw error;
    }
  }

  // ==========================================
  // REGISTER + ENROLL NEW STUDENTS
  // ==========================================
  async function handleBulkRegister() {
    const validRows = newStudents.filter(s => s.full_name.trim() && s.email.trim());

    if (validRows.length === 0) {
      alert('Please ensure at least one student has a Name and Email.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create user records
      const usersToInsert = validRows.map(s => ({
        full_name: s.full_name.trim(),
        email: s.email.trim(),
        phone: s.phone || null,
        gender: s.gender || null,
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
      if (!createdUsers) throw new Error('Failed to create users');

      const newStudentIds = createdUsers.map((u: any) => u.id);

      // 2. Insert availability slots (if any)
      for (let i = 0; i < createdUsers.length; i++) {
        const student = validRows[i];
        const userId = createdUsers[i].id;

        if (student.availabilitySlots && student.availabilitySlots.length > 0) {
          const slotsToInsert = student.availabilitySlots.map((slot: any) => ({
            student_id: userId,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: true,
          }));

          await supabase.from('student_availability').insert(slotsToInsert);
        }
      }

      // 3. Enroll students to the class (respecting capacity warning)
      await enrollStudentsToClass(newStudentIds);

      alert(`✅ Successfully registered and enrolled ${createdUsers.length} new student(s)!`);
      onSuccess();
      onClose();

    } catch (err: any) {
      console.error('Bulk registration error:', err);
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // AVAILABILITY HELPERS
  // ==========================================
  const addAvailabilitySlot = (studentIndex: number, day: number, start: string, end: string) => {
    const updated = [...newStudents];
    const exists = updated[studentIndex].availabilitySlots.some(
      s => s.day_of_week === day && s.start_time === start
    );
    if (!exists) {
      updated[studentIndex].availabilitySlots.push({
        day_of_week: day,
        start_time: start,
        end_time: end,
      });
      setNewStudents(updated);
    }
  };

  const removeAvailabilitySlot = (studentIndex: number, slotIndex: number) => {
    const updated = [...newStudents];
    updated[studentIndex].availabilitySlots.splice(slotIndex, 1);
    setNewStudents(updated);
  };

  // ==========================================
  // RENDER
  // ==========================================
  const isGroup = classContext.type === 'group';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isGroup ? '👥 Enroll Students' : '📚 Enroll Students'}
            </h2>
            <p className="text-sm text-gray-500">
              {classContext.className && (
                <span className="font-medium">{classContext.className}</span>
              )}
              {classContext.courseName && (
                <span className="ml-2">• {classContext.courseName}</span>
              )}
              {classContext.maxStudents !== undefined && classContext.currentStudents !== undefined && (
                <span className="ml-2 text-xs">
                  ({classContext.currentStudents}/{classContext.maxStudents} enrolled)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {/* Tabs */}
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

          {/* NEW STUDENTS TAB */}
          {modalMode === 'new' && (
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={student.full_name}
                        onChange={(e) => updateStudentRow(index, 'full_name', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="Enter student's full name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                      <input
                        type="email"
                        value={student.email}
                        onChange={(e) => updateStudentRow(index, 'email', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="student@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                      <input
                        type="text"
                        value={student.phone}
                        onChange={(e) => updateStudentRow(index, 'phone', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="+1234567890"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                      <select
                        value={student.gender}
                        onChange={(e) => updateStudentRow(index, 'gender', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      >
                        <option value="">Select</option>
                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nationality</label>
                      <select
                        value={student.nationality}
                        onChange={(e) => updateStudentRow(index, 'nationality', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      >
                        <option value="">Select</option>
                        {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={student.date_of_birth}
                        onChange={(e) => updateStudentRow(index, 'date_of_birth', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Education</label>
                      <select
                        value={student.educational_background}
                        onChange={(e) => updateStudentRow(index, 'educational_background', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      >
                        <option value="">Select</option>
                        {EDUCATION_LEVELS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Emergency Contact</label>
                      <input
                        type="text"
                        value={student.emergency_contact}
                        onChange={(e) => updateStudentRow(index, 'emergency_contact', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Emergency Phone</label>
                      <input
                        type="text"
                        value={student.emergency_phone}
                        onChange={(e) => updateStudentRow(index, 'emergency_phone', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="border-t pt-4 mt-2">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-700">📅 Availability Preferences</span>
                      <button
                        onClick={() => {
                          [1, 2, 3, 4, 5].forEach(day => {
                            addAvailabilitySlot(index, day, '09:00', '17:00');
                          });
                        }}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
                      >
                        Bulk Apply (Mon-Fri 9-5)
                      </button>
                    </div>
                    {student.availabilitySlots.length > 0 ? (
                      <div className="space-y-1">
                        {student.availabilitySlots.map((slot: any, slotIdx: number) => (
                          <div key={slotIdx} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
                            <span>{DAYS_OF_WEEK.find(d => d.value === slot.day_of_week)?.label}: {slot.start_time} - {slot.end_time}</span>
                            <button
                              onClick={() => removeAvailabilitySlot(index, slotIdx)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No availability set. Click "Bulk Apply" to add.</p>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={addStudentRow}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition text-sm font-medium"
              >
                ➕ Add Another Student
              </button>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkRegister}
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {submitting ? 'Registering...' : 'Register & Enroll All'}
                </button>
              </div>
            </div>
          )}

          {/* EXISTING STUDENTS TAB */}
          {modalMode === 'existing' && (
            <div>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchExistingStudents()}
                  className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Search by student name..."
                />
                <button
                  onClick={searchExistingStudents}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Search
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 mb-4 max-h-72 overflow-y-auto border rounded-md p-2">
                  {searchResults.map(student => (
                    <div
                      key={student.id}
                      onClick={() => toggleExistingSelection(student.id)}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer border transition ${
                        selectedExistingIds.includes(student.id)
                          ? 'bg-blue-50 border-blue-300'
                          : 'hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExistingIds.includes(student.id)}
                        onChange={() => {}}
                        className="w-4 h-4"
                      />
                      <div>
                        <div className="font-medium">{student.full_name}</div>
                        <div className="text-sm text-gray-500">{student.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchTerm && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No students found. Try a different search.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={enrollExistingStudents}
                  disabled={submitting || selectedExistingIds.length === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {submitting ? 'Enrolling...' : `Enroll Selected (${selectedExistingIds.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}