'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

interface Subject {
  id: string;
  name: string;
  category: string;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  specialization: string;
  hourly_rate: number;
  availability_count: number;
  active_classes: number;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
}

export default function BookingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    student_id: '',
    subject_id: '',
    class_type: 'group', // 'group' or 'private'
    level: 'beginner',
    max_students: 10,
    day_of_week: 'Monday',
    start_time: '09:00',
    end_time: '10:00',
    duration_hours: 1,
    teacher_id: '',
    room_id: '',
    notes: '',
  });

  // Data from database
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const CLASS_TYPES = ['group', 'private'];
  const LEVELS = ['beginner', 'intermediate', 'advanced'];

  useEffect(() => {
    loadInitialData();
  }, []);

  // Auto-search when date/time changes
  useEffect(() => {
    if (formData.day_of_week && formData.start_time && formData.end_time) {
      findAvailableTeachersAndRooms();
    }
  }, [formData.day_of_week, formData.start_time, formData.end_time]);

  async function loadInitialData() {
    setLoading(true);
    try {
      // Load students
      const { data: studentsData } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'student')
        .eq('is_active', true)
        .order('full_name');
      setStudents(studentsData || []);

      // Load subjects
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id, name, category')
        .eq('is_active', true)
        .order('name');
      setSubjects(subjectsData || []);

      // Load teachers
      const { data: teachersData } = await supabase
        .from('teachers')
        .select('*')
        .eq('is_active', true);
      setTeachers(teachersData || []);

      // Load rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setRooms(roomsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  async function findAvailableTeachersAndRooms() {
    if (!formData.day_of_week || !formData.start_time) return;

    // Find available teachers
    const { data: availTeachers } = await supabase
      .from('teacher_availability')
      .select(`
        teacher_id,
        teachers:teacher_id (id, full_name, specialization, hourly_rate, is_active)
      `)
      .eq('day_of_week', getDayNumber(formData.day_of_week))
      .eq('is_available', true)
      .lte('start_time', formData.start_time)
      .gte('end_time', formData.end_time);

    const teacherIds = availTeachers?.map((t: any) => t.teacher_id) || [];
    const available = teachers.filter(t => teacherIds.includes(t.id));
    setAvailableTeachers(available);

    // Find available rooms (simplified - check if room is free at that time)
    // For now, show all rooms
    setAvailableRooms(rooms);
  }

  function getDayNumber(day: string): number {
    const map: Record<string, number> = {
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
      'Sunday': 0,
    };
    return map[day] || 0;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // 1. Create the class
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);

      const classData = {
        title: `${subjects.find(s => s.id === formData.subject_id)?.name || 'Class'}`,
        subject_id: formData.subject_id,
        teacher_id: formData.teacher_id,
        room_id: formData.room_id || null,
        type: formData.class_type,
        level: formData.level,
        max_students: formData.max_students,
        current_students: 1, // Start with 1 (the enrolling student)
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'confirmed',
        created_at: new Date().toISOString(),
      };

      const { data: classSession, error: classError } = await supabase
        .from('class_sessions')
        .insert(classData)
        .select()
        .single();

      if (classError) throw classError;

      // 2. Enroll the student
      const enrollmentData = {
        student_id: formData.student_id,
        class_id: classSession.id,
        enrollment_date: new Date().toISOString(),
        payment_status: 'pending',
        attendance_count: 0,
        created_at: new Date().toISOString(),
      };

      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .insert(enrollmentData);

      if (enrollmentError) throw enrollmentError;

      // 3. Update teacher's max classes (optional - increment current classes)
      // 4. Send notifications (coming later)

      alert('✅ Booking completed successfully!\n\n' +
        `Class created and student enrolled.\n` +
        `Teacher: ${teachers.find(t => t.id === formData.teacher_id)?.full_name}\n` +
        `Subject: ${subjects.find(s => s.id === formData.subject_id)?.name}\n` +
        `Schedule: ${formData.day_of_week} ${formData.start_time} - ${formData.end_time}`);

      router.push('/dashboard/classes/calendar');
    } catch (error: any) {
      console.error('Error creating booking:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/classes">
          <button className="text-gray-600 hover:text-gray-900">← Back</button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">📚 New Booking</h1>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-8">
        {[
          { number: 1, label: 'Student & Subject' },
          { number: 2, label: 'Schedule' },
          { number: 3, label: 'Match & Confirm' },
        ].map((stepInfo) => (
          <div key={stepInfo.number} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= stepInfo.number
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {stepInfo.number}
            </div>
            <span className={`ml-2 text-sm ${
              step >= stepInfo.number ? 'text-gray-900 font-medium' : 'text-gray-400'
            }`}>
              {stepInfo.label}
            </span>
            {stepInfo.number < 3 && (
              <span className="mx-4 text-gray-300">→</span>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Step 1: Student & Subject */}
        <div className={`space-y-4 ${step > 1 ? 'opacity-50' : ''}`}>
          <h2 className="text-lg font-bold text-gray-900">1. Student & Subject</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Student *</label>
              <select
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name} ({student.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Subject *</label>
              <select
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} {subject.category ? `(${subject.category})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Class Type</label>
              <select
                value={formData.class_type}
                onChange={(e) => setFormData({ ...formData, class_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {CLASS_TYPES.map((type) => (
                  <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!formData.student_id || !formData.subject_id}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Next →
          </button>
        </div>

        {/* Step 2: Schedule */}
        {step >= 2 && (
          <div className="border-t pt-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">2. Schedule</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Day *</label>
                <select
                  value={formData.day_of_week}
                  onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {DAYS.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Time *</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time *</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Duration (hours)</label>
                <input
                  type="number"
                  value={formData.duration_hours}
                  onChange={(e) => setFormData({ ...formData, duration_hours: parseFloat(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min={0.5}
                  step={0.5}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Students</label>
                <input
                  type="number"
                  value={formData.max_students}
                  onChange={(e) => setFormData({ ...formData, max_students: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min={1}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Find Available Teachers →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Match & Confirm */}
        {step >= 3 && (
          <div className="border-t pt-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">3. Match & Confirm</h2>

            {/* Available Teachers */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">👨‍🏫 Available Teachers</h3>
              {availableTeachers.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
                  ⚠️ No teachers available at this time. Try adjusting the schedule.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableTeachers.map((teacher) => (
                    <div
                      key={teacher.id}
                      className={`border rounded-lg p-3 cursor-pointer transition ${
                        formData.teacher_id === teacher.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setFormData({ ...formData, teacher_id: teacher.id })}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{teacher.full_name}</div>
                          <div className="text-sm text-gray-500">{teacher.specialization}</div>
                        </div>
                        {formData.teacher_id === teacher.id && (
                          <span className="text-blue-500 text-lg">✓</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {teacher.hourly_rate ? `$${teacher.hourly_rate}/hr` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Rooms */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">🏠 Available Rooms</h3>
              <select
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No room needed</option>
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} (Capacity: {room.capacity})
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Any special instructions..."
              />
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">📋 Booking Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Student:</span>
                  <span className="font-medium">{students.find(s => s.id === formData.student_id)?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject:</span>
                  <span className="font-medium">{subjects.find(s => s.id === formData.subject_id)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Schedule:</span>
                  <span className="font-medium">{formData.day_of_week} {formData.start_time} - {formData.end_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Teacher:</span>
                  <span className="font-medium text-green-600">
                    {teachers.find(t => t.id === formData.teacher_id)?.full_name || 'Not selected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Room:</span>
                  <span className="font-medium">{rooms.find(r => r.id === formData.room_id)?.name || 'None'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.teacher_id}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {submitting ? 'Creating...' : '✅ Confirm Booking'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}