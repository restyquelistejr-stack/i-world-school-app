// lib/teacher-matching.ts

interface TeacherMatch {
  teacher_id: string;
  full_name: string;
  score: number;
  availability: {
    sessions: number;
    total: number;
    match_percentage: number;
  };
  experience: number;
  current_load: number;
  qualifications: string[];
  conflicts: string[];
  available_sessions: any[];
}

export async function findQualifiedTeachers(
  subjectId: string,
  sessions: any[],
  schedulePreference: string
): Promise<TeacherMatch[]> {
  
  // 1. Get all teachers who can teach this subject
  const { data: qualifiedTeachers } = await supabase
    .from('teacher_subjects')
    .select(`
      teacher_id,
      teachers:teacher_id (
        id,
        full_name,
        years_of_experience,
        is_active
      ),
      rate,
      years_of_experience as subject_experience
    `)
    .eq('subject_id', subjectId)
    .eq('is_active', true);

  if (!qualifiedTeachers || qualifiedTeachers.length === 0) {
    return [];
  }

  const teacherIds = qualifiedTeachers.map(t => t.teacher_id);

  // 2. Get teacher availability for the requested schedule
  const daysNeeded = [...new Set(sessions.map(s => new Date(s.session_date).getDay()))];
  
  const { data: availabilityData } = await supabase
    .from('teacher_availability')
    .select('*')
    .in('teacher_id', teacherIds)
    .in('day_of_week', daysNeeded)
    .eq('is_active', true);

  // 3. Get existing class schedules (to check conflicts)
  const sessionDates = sessions.map(s => s.session_date);
  const { data: existingSessions } = await supabase
    .from('class_sessions')
    .select(`
      *,
      classes!inner (teacher_id)
    `)
    .in('session_date', sessionDates)
    .in('teacher_id', teacherIds)
    .eq('is_cancelled', false);

  // 4. Calculate match scores
  const matches: TeacherMatch[] = qualifiedTeachers.map((teacher: any) => {
    const teacherId = teacher.teacher_id;
    
    // Calculate availability match
    const availableDays = availabilityData?.filter(a => a.teacher_id === teacherId) || [];
    const sessionMatches = sessions.filter(s => {
      const dayOfWeek = new Date(s.session_date).getDay();
      const timeMatch = availableDays.some(a => 
        a.day_of_week === dayOfWeek &&
        a.start_time <= s.start_time &&
        a.end_time >= s.end_time
      );
      return timeMatch;
    });

    // Calculate conflicts
    const conflicts = existingSessions?.filter(s => 
      s.teacher_id === teacherId && 
      s.session_date === s.session_date
    ) || [];

    // Calculate score (0-100)
    const availabilityScore = (sessionMatches.length / sessions.length) * 100;
    const experienceScore = Math.min((teacher.subject_experience || 0) * 10, 30);
    const loadScore = Math.max(0, 100 - ((teacher.current_load || 0) * 10));
    
    const totalScore = (availabilityScore * 0.6) + (experienceScore * 0.3) + (loadScore * 0.1);

    return {
      teacher_id: teacherId,
      full_name: teacher.teachers?.full_name || 'Unknown',
      score: Math.round(totalScore),
      availability: {
        sessions: sessionMatches.length,
        total: sessions.length,
        match_percentage: Math.round(availabilityScore),
      },
      experience: teacher.subject_experience || 0,
      current_load: teacher.current_load || 0,
      qualifications: [teacher.teachers?.specialization].filter(Boolean),
      conflicts: conflicts.map(c => c.id),
      available_sessions: sessionMatches,
    };
  });

  // Sort by score (highest first)
  return matches.sort((a, b) => b.score - a.score);
}