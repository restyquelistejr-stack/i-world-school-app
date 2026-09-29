// app/dashboard/classes/book/components/StudentSelection.tsx
// ⭐ v3.14b: Quick-add student button (name-only)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';
import QuickAddStudentModal from '@/components/QuickAddStudentModal';
import type { Student, Inquiry, Course, Module } from '../types';

interface StudentSelectionProps {
  onSelect: (inquiry: Inquiry) => void;
  onBack: () => void;
  onSkip?: () => void;
}

export default function StudentSelection({ onSelect, onBack, onSkip }: StudentSelectionProps) {
  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    email: '',
    phone: '',
  });
  const [creating, setCreating] = useState(false);

  // ⭐ v3.14b: quick-add modal
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await loadStudents();
      await loadInquiries();
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  async function loadStudents() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'student')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('full_name');

      if (error) throw error;
      setExistingStudents(data || []);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  }

  async function loadInquiries() {
    try {
      let inquiriesData: any[] = [];

      const { data: inquiriesTableData, error: inquiriesError } = await supabase
        .from('inquiries')
        .select(`
          id,
          student_id,
          course_id,
          module_id,
          status,
          created_at,
          student:student_id (id, full_name, email, phone),
          course:course_id (id, name),
          module:module_id (id, title, level, course_id)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!inquiriesError && inquiriesTableData && inquiriesTableData.length > 0) {
        inquiriesData = inquiriesTableData;
      } else {
        const { data: inquiryTableData, error: inquiryError } = await supabase
          .from('inquiry')
          .select(`
            id,
            student_id,
            course_id,
            module_id,
            status,
            created_at,
            student:student_id (id, full_name, email, phone),
            course:course_id (id, name),
            module:module_id (id, title, level, course_id)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (!inquiryError && inquiryTableData) {
          inquiriesData = inquiryTableData;
        }
      }

      const mappedInquiries: Inquiry[] = (inquiriesData || []).map((item: any) => {
        const studentData = item.student || null;
        const student: Student | null = studentData ? {
          id: studentData.id || '',
          full_name: studentData.full_name || '',
          email: studentData.email || '',
          phone: studentData.phone || null,
        } : null;

        const courseData = item.course || null;
        const course: Course | null = courseData ? {
          id: courseData.id || '',
          name: courseData.name || '',
        } : null;

        const moduleData = item.module || null;
        const module: Module | null = moduleData ? {
          id: moduleData.id || '',
          title: moduleData.title || '',
          level: moduleData.level || '',
          course_id: moduleData.course_id || '',
        } : null;

        return {
          id: item.id || '',
          student_id: item.student_id || '',
          course_id: item.course_id || '',
          module_id: item.module_id || '',
          status: item.status || 'pending',
          created_at: item.created_at || new Date().toISOString(),
          student,
          course,
          module,
        };
      });

      setInquiries(mappedInquiries);
    } catch (error) {
      console.error('Error loading inquiries:', error);
      const fallbackInquiries: Inquiry[] = existingStudents.slice(0, 10).map((student) => ({
        id: `student-${student.id}`,
        student_id: student.id,
        course_id: '',
        module_id: '',
        status: 'pending',
        created_at: new Date().toISOString(),
        student: student,
        course: null,
        module: null,
      }));
      setInquiries(fallbackInquiries);
    }
  }

  const filteredStudents = existingStudents.filter((s) => {
    const name = s.full_name?.toLowerCase() || '';
    const email = s.email?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  const filteredInquiries = inquiries.filter((inq) => {
    const name = inq.student?.full_name?.toLowerCase() || '';
    const course = inq.course?.name?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return name.includes(search) || course.includes(search);
  });

  const handleCreateStudent = async () => {
    if (!newStudent.full_name) {
      alert('Please enter at least the name');
      return;
    }

    setCreating(true);
    try {
      let userId: string;

      // If email provided, check for existing
      if (newStudent.email) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, full_name, email')
          .eq('email', newStudent.email)
          .maybeSingle();

        if (existingUser) {
          userId = existingUser.id;
          alert(`✅ Student "${existingUser.full_name}" already exists. Using existing account.`);
        } else {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
              full_name: newStudent.full_name,
              email: newStudent.email,
              phone: newStudent.phone || null,
              role: 'student',
              is_active: true,
            })
            .select()
            .single();

          if (userError) throw userError;
          userId = userData.id;
        }
      } else {
        // No email — create lightweight student
        const { data: userData, error: userError } = await supabase
          .from('users')
          .insert({
            full_name: newStudent.full_name,
            email: null,
            phone: newStudent.phone || null,
            role: 'student',
            is_active: true,
          })
          .select()
          .single();

        if (userError) throw userError;
        userId = userData.id;
      }

      const mockInquiry: Inquiry = {
        id: `direct-${Date.now()}`,
        student_id: userId,
        course_id: '',
        module_id: '',
        status: 'pending',
        created_at: new Date().toISOString(),
        student: {
          id: userId,
          full_name: newStudent.full_name,
          email: newStudent.email || '',
          phone: newStudent.phone || null,
        },
        course: null,
        module: null,
      };

      setShowNewStudent(false);
      setNewStudent({ full_name: '', email: '', phone: '' });
      onSelect(mockInquiry);
    } catch (error: any) {
      console.error('Error creating student:', error);
      alert('Error: ' + error.message);
    }
    setCreating(false);
  };

  const handleSelectStudent = (student: Student) => {
    const mockInquiry: Inquiry = {
      id: `direct-${student.id}`,
      student_id: student.id,
      course_id: '',
      module_id: '',
      status: 'pending',
      created_at: new Date().toISOString(),
      student: student,
      course: null,
      module: null,
    };
    onSelect(mockInquiry);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {onSkip && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-blue-700 font-medium">Don't have an inquiry?</p>
            <p className="text-xs text-blue-600">Skip this step and book directly</p>
          </div>
          <button
            onClick={onSkip}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            Skip →
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Search for a student
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowAllStudents(!showAllStudents)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition whitespace-nowrap"
          >
            {showAllStudents ? 'Hide Students' : 'All Students'}
          </button>
          {/* ⭐ v3.14b: quick-add student */}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition whitespace-nowrap flex items-center gap-1"
            title="Add a new student (name only)"
          >
            ⚡ Quick Add
          </button>
        </div>
      </div>

      {!showAllStudents && (
        <div>
          <p className="text-xs text-gray-400 mb-2">📋 Pending Inquiries</p>
          {filteredInquiries.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No inquiries found</p>
              <p className="text-sm text-gray-400 mt-1">
                {searchTerm ? 'Try a different search term' : 'Click "All Students" to browse all students'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInquiries.map((inquiry) => (
                <button
                  key={inquiry.id}
                  onClick={() => onSelect(inquiry)}
                  className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow transition group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {inquiry.student?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">
                          {inquiry.student?.full_name || 'Unknown Student'}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{inquiry.course?.name || 'No course'}</span>
                          <span>•</span>
                          <span>{inquiry.module?.level || 'N/A'}</span>
                          <span>•</span>
                          <span className="text-xs">
                            {format(new Date(inquiry.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-blue-600 group-hover:underline text-sm font-medium">
                      Select →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showAllStudents && (
        <div>
          <p className="text-xs text-gray-400 mb-2">👤 All Students ({filteredStudents.length})</p>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No students found</p>
              <p className="text-sm text-gray-400 mt-1">
                {searchTerm ? 'Try a different search term' : 'Create a new student'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleSelectStudent(student)}
                  className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow transition group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {student.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{student.full_name}</p>
                        <p className="text-sm text-gray-500">{student.email || '—'}</p>
                      </div>
                    </div>
                    <div className="text-blue-600 group-hover:underline text-sm font-medium">
                      Select →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showNewStudent ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h4 className="font-medium text-gray-800">Create New Student</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Full Name *"
              value={newStudent.full_name}
              onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={newStudent.email}
              onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Phone"
              value={newStudent.phone}
              onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateStudent}
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create & Continue'}
            </button>
            <button
              onClick={() => setShowNewStudent(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewStudent(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
        >
          + New Student (full form)
        </button>
      )}

      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          ← Back
        </button>
      </div>

      {/* ⭐ v3.14b: quick-add modal */}
      <QuickAddStudentModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onCreated={(student) => {
          const mockInquiry: Inquiry = {
            id: `direct-${student.id}`,
            student_id: student.id,
            course_id: '',
            module_id: '',
            status: 'pending',
            created_at: new Date().toISOString(),
            student: {
              id: student.id,
              full_name: student.full_name,
              email: student.email || '',
              phone: student.phone || null,
            },
            course: null,
            module: null,
          };
          onSelect(mockInquiry);
        }}
      />
    </div>
  );
}