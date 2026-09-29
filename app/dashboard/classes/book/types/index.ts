// app/dashboard/classes/book/types/index.ts
// ✅ ONE SOURCE OF TRUTH

export interface Student {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
}

export interface Course {
  id: string;
  name: string;
}

export interface Module {
  id: string;
  title: string;
  level: string;
  course_id: string;
}

export interface Inquiry {
  id: string;
  student_id: string;
  course_id: string;
  module_id: string;
  status: string;
  created_at: string;
  student: Student | null;
  course: Course | null;
  module: Module | null;
}

export interface GeneratedSession {
  session_number: number;
  date: string;
  start_time: string;
  end_time: string;
  teacher_id: string;
  teacher_name: string;
  room_id: string;
  room_name: string;
  match_score?: number;
}

// ⭐ v3.11: A specific future session picked from a group class for a trial
export interface TrialSession {
  id: string;                 // group_class_sessions.id
  date: string;               // session_date (YYYY-MM-DD)
  start_time: string;
  end_time: string;
  teacher_id: string | null;
  teacher_name?: string | null;
  room_id: string | null;
  room_name?: string | null;
  session_number: number;
}

export interface BookingData {
  student_id?: string;
  course_id?: string;
  module_id?: string;
  inquiry_id?: string;
  action?: 'trial' | 'register';
  format?: 'private' | 'group';
  hours_per_session?: number;
  number_of_sessions?: number;
  start_date?: string;
  preferred_days?: number[];
  start_time?: string;
  end_time?: string;
  teacher_id?: string | null;
  room_id?: string | null;
  group_class_id?: string;
  selected_group_class_id?: string;
  isGroupClassBooking?: boolean;
  trial_date?: string;
  notes?: string;
  agree_terms?: boolean;
  generated_sessions?: GeneratedSession[];
  trialId?: string;
  // ⭐ Trial conversion tracking
  session_type?: string;
  is_converted?: boolean;
  converted_class_id?: string;
  // ⭐ v3.11: trial group session picker
  trial_session?: TrialSession;
  group_class_data?: any;
}

export interface TrialRecord {
  id: string;
  student_id: string | null;
  course_id: string;
  module_id: string | null;
  session_type: 'private' | 'group';
  hours: number;
  start_date: string | null;
  selected_teacher_id: string | null;
  selected_group_class_id: string | null;
  selected_date: string | null;
  selected_time: string | null;
  room_id: string | null;
  status: string;
  is_converted: boolean;
  converted_at: string | null;
  converted_class_id: string | null;
  created_at: string;
}

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];