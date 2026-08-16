'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SupabaseInterest {
  id: string;
  subject_id: string;
  subjects: {
    id: string;
    name: string;
    category: string;
    level: string;
    description: string;
    duration_hours: number;
    learning_objectives: string[];
  } | null;
}

interface StudentAvailability {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface TeacherMatch {
  teacher_id: string;
  teacher_name: string;
  teacher_email: string;
  subject_name: string;
  subject_id: string;
  availability_match?: boolean;
  availability?: any[];
}

interface SubjectMatch {
  subject: any;
  matching_teachers: TeacherMatch[];
}

interface ScheduledSession {
  id: string;
  subject_id: string;
  subject_name: string;
  teacher_id: string;
  teacher_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: 'draft' | 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'enrolled';
}

interface OfferData {
  student_id: string | null;
  student_name?: string;
  student_email?: string;
  selected_subjects: string[];
  selected_subject_details?: any[];
  status: 'draft' | 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'enrolled';
  sent_at?: string;
  created_at?: string;
  updated_at?: string;
  schedule?: ScheduledSession[];
}

export default function OfferDetailContent({ studentId }: { studentId: string }) {
  const router = useRouter();
  
  const [student, setStudent] = useState<any>(null);
  const [interests, setInterests] = useState<SupabaseInterest[]>([]);
  const [availability, setAvailability] = useState<StudentAvailability[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchResults, setMatchResults] = useState<SubjectMatch[]>([]);
  const [sending, setSending] = useState(false);
  const [offerStatus, setOfferStatus] = useState<'draft' | 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'enrolled'>('draft');
  const [existingOffer, setExistingOffer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [schedule, setSchedule] = useState<ScheduledSession[]>([]);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayMap: Record<string, string> = {
    '0': 'Sunday',
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday'
  };

  useEffect(() => {
    if (studentId) {
      console.log('🔍 Offer Detail Page: ID received from URL:', studentId);
      setDebugInfo(`Loading student with ID: ${studentId}`);
      loadAllData(studentId);
    } else {
      setError('No student ID provided in the URL.');
      setLoading(false);
    }
  }, [studentId]);

  async function loadAllData(studentId: string) {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`📤 Attempting to load student with ID: ${studentId}`);
      setDebugInfo(`Querying database for student: ${studentId}`);
      
      const { data: studentData, error: studentError } = await supabase
        .from('users')
        .select('*')
        .eq('id', studentId)
        .single();

      if (studentError) {
        console.error(`❌ Student not found for ID: ${studentId}`, studentError);
        setError(`Student not found with ID: ${studentId}. Please check that you're using the correct student ID.`);
        setDebugInfo(`❌ Error: ${studentError.message}`);
        setLoading(false);
        return;
      }

      console.log('✅ Student found:', studentData.full_name);
      setDebugInfo(`✅ Found student: ${studentData.full_name}`);
      setStudent(studentData);

      const { data: offerData, error: offerError } = await supabase
        .from('student_offers')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (offerData && offerData.length > 0 && !offerError) {
        console.log('Found existing offer:', offerData[0]);
        setExistingOffer(offerData[0]);
        setOfferStatus(offerData[0].status);
        
        if (offerData[0].selected_subjects && offerData[0].selected_subjects.length > 0) {
          setSelectedSubjects(offerData[0].selected_subjects);
        }
        
        if (offerData[0].schedule) {
          setSchedule(offerData[0].schedule);
        }
      } else {
        console.log('No existing offer found for this student');
      }

      const { data: interestsData, error: interestsError } = await supabase
        .from('student_interests')
        .select(`
          id,
          subject_id,
          subjects (
            id,
            name,
            category,
            level,
            description,
            duration_hours,
            learning_objectives
          )
        `)
        .eq('student_id', studentId);

      if (interestsError) {
        console.error('Error loading interests:', interestsError);
      }

      console.log('Interests loaded:', interestsData?.length || 0, 'subjects');
      
      const typedInterests: SupabaseInterest[] = (interestsData || []).map((item: any) => ({
        id: item.id,
        subject_id: item.subject_id,
        subjects: item.subjects || null
      }));
      
      setInterests(typedInterests);
      
      if (selectedSubjects.length === 0 && typedInterests.length > 0) {
        const interestIds = typedInterests.map((i: SupabaseInterest) => i.subject_id);
        console.log('Auto-selecting subjects:', interestIds);
        setSelectedSubjects(interestIds);
      }

      const { data: availabilityData, error: availError } = await supabase
        .from('student_availability')
        .select('*')
        .eq('student_id', studentId)
        .order('day_of_week')
        .order('start_time');

      if (availError) {
        console.error('Error loading availability:', availError);
      }

      console.log('Availability loaded:', availabilityData?.length || 0, 'slots');
      setAvailability(availabilityData || []);

      const { data: teacherSubjectData, error: tsError } = await supabase
        .from('teacher_subjects')
        .select(`
          *,
          users:teacher_id (id, full_name, email)
        `);
      if (tsError) {
        console.error('Error loading teacher_subjects:', tsError);
      } else {
        console.log('📚 All teacher_subjects entries:', teacherSubjectData);
      }

      const { data: teacherAvailData, error: taError } = await supabase
        .from('teacher_availability')
        .select(`
          *,
          users:teacher_id (id, full_name, email)
        `);
      if (taError) {
        console.error('Error loading teacher_availability:', taError);
      } else {
        console.log('📅 All teacher_availability entries:', teacherAvailData);
      }

      const subjectsToMatch = selectedSubjects.length > 0 ? selectedSubjects : 
                             typedInterests.map((i: SupabaseInterest) => i.subject_id) || [];
      
      if (subjectsToMatch.length > 0 && availabilityData) {
        await findMatchingTeachers(subjectsToMatch, availabilityData);
      }

    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message || 'An error occurred while loading data');
    }
    
    setLoading(false);
  }

  async function findMatchingTeachers(subjectIds: string[], studentAvailability: StudentAvailability[]) {
    const matches: SubjectMatch[] = [];

    for (const subjectId of subjectIds) {
      const interest = interests.find(i => i.subject_id === subjectId);
      const subject = interest?.subjects;
      
      if (!subject) continue;
      
      const { data: teacherSubjects, error: tsError } = await supabase
        .from('teacher_subjects')
        .select(`
          teacher_id,
          users:teacher_id (
            id,
            full_name,
            email,
            role
          )
        `)
        .eq('subject_id', subjectId);

      if (tsError) {
        console.error('Error loading teacher subjects:', tsError);
      }

      const matchingTeachers: TeacherMatch[] = [];

      for (const ts of teacherSubjects || []) {
        const { data: teacherAvail, error: availError } = await supabase
          .from('teacher_availability')
          .select('*')
          .eq('teacher_id', ts.teacher_id);

        if (availError) {
          console.error('Error loading teacher availability:', availError);
        }

        const hasAvailability = teacherAvail && teacherAvail.length > 0;
        
        if (!hasAvailability) {
          console.log(`Teacher ${(ts.users as any)?.full_name || 'Unknown'} has no availability`);
          continue;
        }

        const userData = ts.users as any;
        matchingTeachers.push({
          teacher_id: ts.teacher_id,
          teacher_name: userData?.full_name || 'Unknown Teacher',
          teacher_email: userData?.email || '',
          subject_name: subject.name,
          subject_id: subjectId,
          availability_match: true,
          availability: teacherAvail
        });
      }

      matches.push({
        subject: subject,
        matching_teachers: matchingTeachers
      });
    }

    setMatchResults(matches);
  }

  const generateSchedule = () => {
    setGeneratingSchedule(true);
    
    const newSchedule: ScheduledSession[] = [];
    let globalSessionCounter = 0;
    
    for (const subjectId of selectedSubjects) {
      const interest = interests.find(i => i.subject_id === subjectId);
      const subject = interest?.subjects;
      
      if (!subject) continue;
      
      const match = matchResults.find(m => m.subject?.id === subjectId);
      if (!match || match.matching_teachers.length === 0) continue;
      
      const teacher = match.matching_teachers[0];
      const teacherAvail = teacher.availability || [];
      
      const sessionDuration = 2;
      const totalHours = subject.duration_hours || 40;
      const sessionsNeeded = Math.ceil(totalHours / sessionDuration);
      
      const overlappingSlots: { day: string, start: string, end: string }[] = [];
      
      for (const studentSlot of availability) {
        for (const teacherSlot of teacherAvail) {
          const teacherDay = dayMap[teacherSlot.day_of_week] || teacherSlot.day_of_week;
          if (studentSlot.day_of_week === teacherDay) {
            if (teacherSlot.start_time <= studentSlot.end_time && 
                teacherSlot.end_time >= studentSlot.start_time) {
              const start = teacherSlot.start_time > studentSlot.start_time ? 
                            teacherSlot.start_time : studentSlot.start_time;
              const end = teacherSlot.end_time < studentSlot.end_time ? 
                          teacherSlot.end_time : studentSlot.end_time;
              overlappingSlots.push({
                day: studentSlot.day_of_week,
                start: start,
                end: end
              });
            }
          }
        }
      }
      
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      overlappingSlots.sort((a, b) => {
        const dayA = dayOrder.indexOf(a.day);
        const dayB = dayOrder.indexOf(b.day);
        if (dayA !== dayB) return dayA - dayB;
        return a.start.localeCompare(b.start);
      });
      
      let sessionsCreated = 0;
      let currentSlotIndex = 0;
      
      while (sessionsCreated < sessionsNeeded && currentSlotIndex < overlappingSlots.length) {
        const slot = overlappingSlots[currentSlotIndex];
        
        const slotStart = new Date(`2000-01-01T${slot.start}`);
        const slotEnd = new Date(`2000-01-01T${slot.end}`);
        const slotDuration = (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60);
        
        const remainingHours = (sessionsNeeded - sessionsCreated) * sessionDuration;
        const hoursToSchedule = Math.min(sessionDuration, remainingHours, slotDuration);
        
        if (hoursToSchedule >= 1) {
          const sessionStart = slot.start;
          const sessionEnd = new Date(`2000-01-01T${slot.start}`);
          sessionEnd.setHours(sessionEnd.getHours() + hoursToSchedule);
          const sessionEndStr = sessionEnd.toTimeString().slice(0, 5);
          
          globalSessionCounter++;
          newSchedule.push({
            id: `session-${Date.now()}-${globalSessionCounter}`,
            subject_id: subjectId,
            subject_name: subject.name,
            teacher_id: teacher.teacher_id,
            teacher_name: teacher.teacher_name,
            day_of_week: slot.day,
            start_time: sessionStart,
            end_time: sessionEndStr,
            duration_hours: hoursToSchedule,
            status: 'draft'
          });
          
          sessionsCreated++;
          currentSlotIndex++;
        } else {
          currentSlotIndex++;
        }
      }
      
      console.log(`Generated ${sessionsCreated} sessions for ${subject.name} (${totalHours}h total)`);
    }
    
    setSchedule(newSchedule);
    setGeneratingSchedule(false);
  };

  const updateSessionTime = (index: number, field: 'start_time' | 'end_time', value: string) => {
    const updated = [...schedule];
    updated[index] = { ...updated[index], [field]: value };
    setSchedule(updated);
  };

  const removeSession = (index: number) => {
    const updated = schedule.filter((_, i) => i !== index);
    setSchedule(updated);
  };

  const saveScheduleToOffer = async () => {
    try {
      const now = new Date().toISOString();
      
      const offerData = {
        student_id: studentId,
        student_name: student?.full_name,
        student_email: student?.email,
        selected_subjects: selectedSubjects,
        schedule: schedule,
        status: 'draft',
        updated_at: now
      };

      let result;
      if (existingOffer) {
        const { data, error } = await supabase
          .from('student_offers')
          .update(offerData)
          .eq('id', existingOffer.id)
          .select();
        result = { data, error };
      } else {
        const newOfferData = {
          ...offerData,
          created_at: now
        };
        const { data, error } = await supabase
          .from('student_offers')
          .insert([newOfferData])
          .select();
        result = { data, error };
      }

      if (result?.error) throw result.error;
      
      setExistingOffer(result?.data?.[0] || existingOffer);
      alert('✅ Schedule saved successfully!');
      
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      alert('Failed to save schedule: ' + error.message);
    }
  };

  const handleSendOffer = async () => {
    if (schedule.length === 0) {
      alert('Please generate and review the schedule before sending.');
      return;
    }

    setSending(true);
    try {
      const now = new Date().toISOString();
      
      const offerData = {
        student_id: studentId,
        student_name: student?.full_name,
        student_email: student?.email,
        selected_subjects: selectedSubjects,
        schedule: schedule,
        status: 'pending',
        sent_at: now,
        updated_at: now
      };

      let result;
      if (existingOffer) {
        const { data, error } = await supabase
          .from('student_offers')
          .update(offerData)
          .eq('id', existingOffer.id)
          .select();
        result = { data, error };
      } else {
        const newOfferData = {
          ...offerData,
          created_at: now
        };
        const { data, error } = await supabase
          .from('student_offers')
          .insert([newOfferData])
          .select();
        result = { data, error };
      }

      if (result?.error) throw result.error;

      setOfferStatus('pending');
      alert('✅ Offer sent to student successfully!');
      router.push('/dashboard/offer');
      
    } catch (error: any) {
      console.error('Error sending offer:', error);
      alert('Failed to send offer: ' + error.message);
    }
    setSending(false);
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const selectAllSubjects = () => {
    setSelectedSubjects(interests.map(i => i.subject_id));
  };

  const deselectAllSubjects = () => {
    setSelectedSubjects([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading offer data...</p>
          <p className="mt-2 text-xs text-gray-400">{debugInfo}</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700">{error || 'Student not found'}</p>
          <div className="mt-2 text-sm text-gray-500">
            <p>Debug: {debugInfo}</p>
            <p className="mt-1">URL ID: {studentId}</p>
          </div>
          <div className="mt-4 flex gap-3 justify-center flex-wrap">
            <Link href="/dashboard/offer">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Back to Offers
              </button>
            </Link>
            <Link href="/dashboard/students/directory">
              <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">
                Go to Student Directory
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/dashboard/offer">
                <button className="text-gray-600 hover:text-gray-900 mb-2">← Back to Offers</button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Student Program Offer</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                offerStatus === 'pending' ? 'bg-blue-100 text-blue-800' :
                offerStatus === 'accepted' ? 'bg-green-100 text-green-800' :
                offerStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                offerStatus === 'reviewed' ? 'bg-indigo-100 text-indigo-800' :
                offerStatus === 'enrolled' ? 'bg-purple-100 text-purple-800' :
                offerStatus === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {offerStatus === 'pending' ? '📤 Pending' : 
                 offerStatus === 'accepted' ? '✅ Accepted' :
                 offerStatus === 'rejected' ? '❌ Rejected' :
                 offerStatus === 'reviewed' ? '👀 Reviewed' :
                 offerStatus === 'enrolled' ? '🎓 Enrolled' :
                 offerStatus === 'draft' ? '📝 Draft' : 
                 'New Offer'}
              </span>
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Student:</span> {student.full_name}
            </div>
            <div>
              <span className="font-medium">Email:</span> {student.email}
            </div>
            <div>
              <span className="font-medium">Created:</span> {new Date().toLocaleDateString()}
            </div>
            <div>
              <span className="font-medium">Interests:</span> {interests.length} subjects
            </div>
          </div>
        </div>

        {/* Student Interests Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Student Interests</h2>
            {interests.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllSubjects}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAllSubjects}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>
          
          {interests.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-700">
                ⚠️ No interests found for this student. 
                <Link href={`/dashboard/students/registration?student=${studentId}`}>
                  <span className="text-blue-600 hover:underline ml-1">Update student registration</span>
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {interests.map((interest) => (
                  <div
                    key={interest.id}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                      selectedSubjects.includes(interest.subject_id)
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => toggleSubject(interest.subject_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">
                          {interest.subjects?.name || 'Unknown Subject'}
                        </h4>
                        {interest.subjects?.category && (
                          <p className="text-xs text-gray-500 mt-1">{interest.subjects.category}</p>
                        )}
                        {interest.subjects?.level && (
                          <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                            interest.subjects.level === 'beginner' ? 'bg-green-100 text-green-800' :
                            interest.subjects.level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                            interest.subjects.level === 'advanced' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {interest.subjects.level}
                          </span>
                        )}
                        {interest.subjects?.duration_hours && (
                          <p className="text-xs text-gray-400 mt-1">⏱️ {interest.subjects.duration_hours}h</p>
                        )}
                      </div>
                      {selectedSubjects.includes(interest.subject_id) && (
                        <span className="text-blue-500 text-xl">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {selectedSubjects.length} of {interests.length} subjects selected
                </span>
              </div>
            </>
          )}
        </div>

        {/* Availability Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Student Availability</h2>
          
          {availability.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-700">
                ⚠️ No availability set for this student.
                <Link href={`/dashboard/students/registration?student=${studentId}`}>
                  <span className="text-blue-600 hover:underline ml-1">Update student registration</span>
                </Link>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {availability.map((slot, index) => (
                <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="font-medium w-24 text-gray-700">{slot.day_of_week}</span>
                  <span className="text-gray-600">
                    {slot.start_time} - {slot.end_time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teacher Match Results */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Teacher Match Results</h2>
          
          {matchResults.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-gray-500">No matching teachers found for selected subjects.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {matchResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">
                      {result.subject?.name}
                    </h4>
                    <span className="text-sm text-gray-500">
                      {result.matching_teachers.length} teacher(s) available
                    </span>
                  </div>
                  
                  {result.matching_teachers.length === 0 ? (
                    <p className="text-sm text-yellow-600">
                      ⚠️ No available teachers found for this subject
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {result.matching_teachers.map((teacher) => (
                        <div 
                          key={teacher.teacher_id} 
                          className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">👨‍🏫</span>
                            <div>
                              <p className="font-medium text-gray-900">{teacher.teacher_name}</p>
                              <p className="text-xs text-gray-500">{teacher.teacher_email}</p>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-green-200 text-green-800">
                            ✅ Available
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule Drafting Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">📅 Draft Schedule</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generateSchedule}
                disabled={generatingSchedule || selectedSubjects.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {generatingSchedule ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Generating...
                  </>
                ) : (
                  '🔄 Generate Schedule'
                )}
              </button>
            </div>
          </div>

          {schedule.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-gray-500">No schedule generated yet.</p>
              <p className="text-sm text-gray-400 mt-1">Click "Generate Schedule" to create a proposed schedule based on availability.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Subject</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Teacher</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Day</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Start</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">End</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Duration</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((session, index) => (
                      <tr key={session.id} className="border-b hover:bg-gray-50 transition">
                        <td className="p-3 text-sm">{session.subject_name}</td>
                        <td className="p-3 text-sm">{session.teacher_name}</td>
                        <td className="p-3 text-sm">
                          <select
                            value={session.day_of_week}
                            onChange={(e) => {
                              const updated = [...schedule];
                              updated[index] = { ...updated[index], day_of_week: e.target.value };
                              setSchedule(updated);
                            }}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            {dayOrder.map(day => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-sm">
                          <input
                            type="time"
                            value={session.start_time}
                            onChange={(e) => updateSessionTime(index, 'start_time', e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-24"
                          />
                        </td>
                        <td className="p-3 text-sm">
                          <input
                            type="time"
                            value={session.end_time}
                            onChange={(e) => updateSessionTime(index, 'end_time', e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-24"
                          />
                        </td>
                        <td className="p-3 text-sm">{session.duration_hours}h</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => removeSession(index)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-sm text-gray-500">
                  {schedule.length} session(s) planned
                </span>
                <button
                  type="button"
                  onClick={saveScheduleToOffer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  💾 Save Schedule
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-600">
                <span className="font-medium">{selectedSubjects.length}</span> subjects selected for this offer
                {schedule.length > 0 && (
                  <span className="ml-2 text-green-600">✓ {schedule.length} sessions scheduled</span>
                )}
                {offerStatus === 'pending' && (
                  <span className="ml-2 text-blue-600">⏳ Offer pending student response</span>
                )}
                {offerStatus === 'accepted' && (
                  <span className="ml-2 text-green-600">✓ Offer accepted by student</span>
                )}
                {offerStatus === 'rejected' && (
                  <span className="ml-2 text-red-600">✗ Offer rejected by student</span>
                )}
                {offerStatus === 'reviewed' && (
                  <span className="ml-2 text-indigo-600">👀 Offer reviewed</span>
                )}
                {offerStatus === 'enrolled' && (
                  <span className="ml-2 text-purple-600">🎓 Student enrolled</span>
                )}
              </p>
              {offerStatus === 'draft' && (
                <p className="text-xs text-yellow-600 mt-1">
                  This offer is in draft mode. Review the items and assign teachers before sending to student.
                </p>
              )}
              {offerStatus === 'pending' && (
                <p className="text-xs text-blue-600 mt-1">
                  Offer has been sent to the student. Waiting for their response.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {offerStatus === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={handleSendOffer}
                    disabled={schedule.length === 0 || sending}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {sending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Sending...
                      </>
                    ) : (
                      '📤 Send Offer to Student'
                    )}
                  </button>
                </>
              )}
              {(offerStatus === 'pending' || offerStatus === 'reviewed' || offerStatus === 'accepted' || offerStatus === 'rejected' || offerStatus === 'enrolled') && (
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/offer')}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  Back to Offers
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}