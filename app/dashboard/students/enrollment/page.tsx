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
}

interface Course {
  id: string;
  name: string;
  age_group: string;
  course_type: string;
  level: string;
  description: string;
  duration_hours: number;
  price_per_hour: number;
  includes_exam_prep: boolean;
  exam_types: string[];
}

interface ClassSession {
  id: string;
  course_id: string;
  teacher_id: string;
  room_id: string;
  time_slot_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_students: number;
  current_students: number;
  delivery_mode: string;
  package_type: string;
  status: string;
  course?: Course;
  teacher?: {
    id: string;
    full_name: string;
    email: string;
  };
  room?: {
    id: string;
    name: string;
  };
  time_slot?: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
  };
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  specializations: string[];
}

const DELIVERY_MODES = [
  { value: 'on_site', label: '🏫 On-Site', icon: '🏫' },
  { value: 'online', label: '💻 Online', icon: '💻' },
  { value: 'hybrid', label: '🔄 Hybrid', icon: '🔄' },
];

const PACKAGE_TYPES = [
  { value: 'basic', label: 'Basic', hours: 20, discount: 0 },
  { value: 'standard', label: 'Standard', hours: 40, discount: 10 },
  { value: 'premium', label: 'Premium', hours: 60, discount: 15 },
];

export default function StudentEnrollmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('student');

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // New course-based data
  const [availableClasses, setAvailableClasses] = useState<ClassSession[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedPackage, setSelectedPackage] = useState<string>('standard');
  const [selectedDelivery, setSelectedDelivery] = useState<string>('on_site');
  const [filterAgeGroup, setFilterAgeGroup] = useState<string>('all');
  const [filterDelivery, setFilterDelivery] = useState<string>('all');
  
  const [existingEnrollments, setExistingEnrollments] = useState<any[]>([]);

  useEffect(() => {
    if (!studentId) {
      router.push('/dashboard/students/directory');
      return;
    }
    loadData();
  }, [studentId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Load student
      const { data: studentData, error: studentError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;

      const { data: profileData } = await supabase
        .from('students')
        .select('student_no')
        .eq('id', studentId)
        .single();

      setStudent({
        id: studentData.id,
        full_name: studentData.full_name,
        email: studentData.email,
        student_no: profileData?.student_no || `STU-${String(studentId).slice(0, 8).toUpperCase()}`,
      });

      // 2. Load available classes with course info
      const { data: classesData, error: classesError } = await supabase
        .from('class_sessions')
        .select(`
          *,
          course:course_id (*),
          teacher:teacher_id (id, full_name, email),
          room:room_id (id, name),
          time_slot:time_slot_id (id, name, start_time, end_time)
        `)
        .eq('status', 'open')
        .order('day_of_week')
        .order('start_time');

      if (classesError) throw classesError;
      setAvailableClasses(classesData || []);

      // 3. Load existing enrollments
      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('*')
        .eq('student_id', studentId);
      setExistingEnrollments(enrollmentsData || []);

    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message || 'Failed to load data');
    }
    setLoading(false);
  }

  const getDeliveryLabel = (mode: string) => {
    const found = DELIVERY_MODES.find(d => d.value === mode);
    return found?.label || mode;
  };

  const getPackageLabel = (pkg: string) => {
    const found = PACKAGE_TYPES.find(p => p.value === pkg);
    return found?.label || pkg;
  };

  const getPackageHours = (pkg: string) => {
    const found = PACKAGE_TYPES.find(p => p.value === pkg);
    return found?.hours || 40;
  };

  const getPackageDiscount = (pkg: string) => {
    const found = PACKAGE_TYPES.find(p => p.value === pkg);
    return found?.discount || 0;
  };

  const calculatePrice = (course: Course, packageType: string) => {
    const hours = getPackageHours(packageType);
    const discount = getPackageDiscount(packageType);
    const basePrice = course.price_per_hour * hours;
    const discountedPrice = basePrice * (1 - discount / 100);
    return {
      base: basePrice,
      discounted: discountedPrice,
      savings: basePrice - discountedPrice,
    };
  };

  const isStudentEnrolled = (classId: string) => {
    return existingEnrollments.some(e => e.class_id === classId);
  };

  const filteredClasses = availableClasses.filter(cls => {
    const ageMatch = filterAgeGroup === 'all' || cls.course?.age_group === filterAgeGroup;
    const deliveryMatch = filterDelivery === 'all' || cls.delivery_mode === filterDelivery;
    return ageMatch && deliveryMatch;
  });

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId) {
      alert('Please select a class');
      return;
    }

    setSubmitting(true);
    try {
      const selectedClass = availableClasses.find(c => c.id === selectedClassId);
      if (!selectedClass) throw new Error('Class not found');

      // 1. Update class current_students
      await supabase
        .from('class_sessions')
        .update({ current_students: (selectedClass.current_students || 0) + 1 })
        .eq('id', selectedClassId);

      // 2. Create enrollment
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          student_id: studentId,
          class_id: selectedClassId,
          enrollment_date: new Date().toISOString(),
          payment_status: 'pending',
          attendance_count: 0,
        });

      if (enrollError) throw enrollError;

      alert('✅ Student enrolled successfully!');
      router.push('/dashboard/students/directory');
    } catch (error: any) {
      console.error('Error enrolling:', error);
      alert('Error: ' + error.message);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p>❌ {error}</p>
          <button onClick={loadData} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/students/directory">
            <button className="text-gray-600 hover:text-gray-900">← Back to Students</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Enroll Student</h1>
        </div>

        {/* Student Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600">
              {student?.full_name?.charAt(0) || 'S'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{student?.full_name}</h2>
              <p className="text-sm text-gray-500">
                {student?.student_no} • {student?.email}
              </p>
              {existingEnrollments.length > 0 && (
                <p className="text-sm text-green-600 mt-1">
                  ✅ Currently enrolled in {existingEnrollments.length} class{existingEnrollments.length > 1 ? 'es' : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleEnroll} className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="font-semibold text-gray-800 mb-4">🔍 Filter Available Classes</h3>
            <div className="flex flex-wrap gap-4">
              <select
                value={filterAgeGroup}
                onChange={(e) => setFilterAgeGroup(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Age Groups</option>
                <option value="adult">👨‍🎓 Adult</option>
                <option value="young_learner">🧒 Young Learner</option>
              </select>
              <select
                value={filterDelivery}
                onChange={(e) => setFilterDelivery(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Delivery Modes</option>
                {DELIVERY_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadData}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Available Classes */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="font-semibold text-gray-800 mb-4">📚 Available Classes</h3>
            <p className="text-sm text-gray-500 mb-4">
              {filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''} available
            </p>

            {filteredClasses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No classes available. Check back later!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClasses.map((cls) => {
                  const isEnrolled = isStudentEnrolled(cls.id);
                  const priceInfo = cls.course ? calculatePrice(cls.course, selectedPackage) : null;
                  
                  return (
                    <div
                      key={cls.id}
                      className={`border-2 rounded-lg p-4 transition ${
                        selectedClassId === cls.id
                          ? 'border-blue-500 bg-blue-50'
                          : isEnrolled
                          ? 'border-green-500 bg-green-50 opacity-75'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        if (!isEnrolled) setSelectedClassId(cls.id);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-900">
                            {cls.course?.name || 'Unknown Course'}
                          </h4>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              cls.course?.age_group === 'adult' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {cls.course?.age_group === 'adult' ? '👨‍🎓 Adult' : '🧒 Young Learner'}
                            </span>
                            {cls.course?.level && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">
                                {cls.course.level}
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">
                              {getDeliveryLabel(cls.delivery_mode)}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            <div>👨‍🏫 {cls.teacher?.full_name || 'No teacher assigned'}</div>
                            <div>📅 {cls.day_of_week} {cls.start_time} - {cls.end_time}</div>
                            <div>👥 {cls.current_students || 0} / {cls.max_students} students</div>
                            {cls.room?.name && <div>🏠 {cls.room.name}</div>}
                          </div>
                          {priceInfo && (
                            <div className="mt-2 text-sm">
                              <span className="text-gray-500 line-through">${priceInfo.base.toFixed(2)}</span>
                              <span className="ml-2 text-green-600 font-bold">${priceInfo.discounted.toFixed(2)}</span>
                              <span className="ml-2 text-xs text-green-500">Save ${priceInfo.savings.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="mt-1 text-xs text-gray-400">
                            Package: {getPackageLabel(cls.package_type || 'standard')}
                          </div>
                        </div>
                        <div className="text-right">
                          {isEnrolled ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                              ✅ Enrolled
                            </span>
                          ) : (
                            <input
                              type="radio"
                              name="class"
                              value={cls.id}
                              checked={selectedClassId === cls.id}
                              onChange={() => setSelectedClassId(cls.id)}
                              className="w-4 h-4 mt-1"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Class Details */}
          {selectedClassId && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="font-semibold text-gray-800 mb-4">📋 Enrollment Summary</h3>
              {(() => {
                const cls = availableClasses.find(c => c.id === selectedClassId);
                if (!cls) return <p className="text-gray-500">Select a class</p>;
                const priceInfo = cls.course ? calculatePrice(cls.course, selectedPackage) : null;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Course</p>
                        <p className="font-medium">{cls.course?.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Teacher</p>
                        <p className="font-medium">{cls.teacher?.full_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Schedule</p>
                        <p className="font-medium">{cls.day_of_week} {cls.start_time}-{cls.end_time}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Delivery</p>
                        <p className="font-medium">{getDeliveryLabel(cls.delivery_mode)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Package</p>
                        <select
                          value={selectedPackage}
                          onChange={(e) => setSelectedPackage(e.target.value)}
                          className="px-3 py-1 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          {PACKAGE_TYPES.map((pkg) => (
                            <option key={pkg.value} value={pkg.value}>
                              {pkg.label} ({pkg.hours}h) - {pkg.discount > 0 ? `Save ${pkg.discount}%` : 'No discount'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Price</p>
                        {priceInfo ? (
                          <div>
                            <span className="text-gray-500 line-through">${priceInfo.base.toFixed(2)}</span>
                            <span className="ml-2 text-green-600 font-bold">${priceInfo.discounted.toFixed(2)}</span>
                            {priceInfo.savings > 0 && (
                              <span className="ml-2 text-xs text-green-500">Save ${priceInfo.savings.toFixed(2)}</span>
                            )}
                          </div>
                        ) : (
                          <p className="font-medium">Contact for pricing</p>
                        )}
                      </div>
                    </div>
                    <div className="pt-4 border-t flex gap-3">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                      >
                        {submitting ? 'Enrolling...' : '✅ Confirm Enrollment'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedClassId('')}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}