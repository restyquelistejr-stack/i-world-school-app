'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface TeacherProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  profile_headline: string;
  about: string;
  profile_picture_url: string;
  years_experience: number;
  education: string;
  certifications: string[];
  teaching_style: string;
  availability_notes: string;
  social_links: {
    linkedin?: string;
    twitter?: string;
    website?: string;
    youtube?: string;
  };
  created_at: string;
}

interface WorkExperience {
  id: string;
  company_name: string;
  position: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string;
  location: string;
  industry: string;
}

interface Project {
  id: string;
  project_name: string;
  role: string;
  description: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  project_url: string;
  technologies: string[];
  image_url: string;
}

interface Testimonial {
  id: string;
  student_id: string;
  student_name: string;
  rating: number;
  testimonial: string;
  class_id: string;
  class_name: string;
  created_at: string;
}

interface Skill {
  id: string;
  skill_name: string;
  proficiency_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export default function TeacherProfilePage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('about');
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (teacherId) {
      loadProfileData();
    }
  }, [teacherId]);

  async function loadProfileData() {
    setLoading(true);
    try {
      // Load teacher profile - using only existing columns
      const { data: teacherData, error: teacherError } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          phone,
          gender,
          created_at,
          teachers (
            specialization,
            bio,
            hourly_rate,
            is_active
          )
        `)
        .eq('id', teacherId)
        .single();

      if (teacherError) throw teacherError;

      // Handle the data safely with proper type checking
      if (teacherData) {
        // Use 'any' for the nested teachers data to avoid TypeScript errors
        const teachersData = (teacherData as any).teachers || {};
        
        setProfile({
          id: teacherData.id,
          full_name: teacherData.full_name,
          email: teacherData.email,
          phone: teacherData.phone || '',
          gender: teacherData.gender || '',
          profile_headline: teachersData.specialization || 'Teacher',
          about: teachersData.bio || '',
          profile_picture_url: '',
          years_experience: 0,
          education: '',
          certifications: [],
          teaching_style: '',
          availability_notes: '',
          social_links: {},
          created_at: teacherData.created_at,
        });
      }

      // Try loading experience if table exists
      try {
        const { data: expData, error: expError } = await supabase
          .from('teacher_experience')
          .select('*')
          .eq('teacher_id', teacherId)
          .order('start_date', { ascending: false });

        if (!expError) {
          setExperience(expData || []);
        }
      } catch (e) {
        console.log('Experience table not available');
        setExperience([]);
      }

      // Try loading projects if table exists
      try {
        const { data: projData, error: projError } = await supabase
          .from('teacher_projects')
          .select('*')
          .eq('teacher_id', teacherId)
          .order('start_date', { ascending: false });

        if (!projError) {
          setProjects(projData || []);
        }
      } catch (e) {
        console.log('Projects table not available');
        setProjects([]);
      }

      // Try loading testimonials if table exists
      try {
        const { data: testData, error: testError } = await supabase
          .from('teacher_testimonials')
          .select(`
            *,
            student:student_id (full_name)
          `)
          .eq('teacher_id', teacherId)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (!testError && testData) {
          const formattedTestimonials = testData.map((t: any) => ({
            id: t.id,
            student_id: t.student_id,
            student_name: t.student?.full_name || 'Anonymous',
            rating: t.rating,
            testimonial: t.testimonial,
            class_id: t.class_id,
            class_name: 'Class',
            created_at: t.created_at,
          }));
          setTestimonials(formattedTestimonials);
        }
      } catch (e) {
        console.log('Testimonials table not available');
        setTestimonials([]);
      }

      // Try loading skills if table exists
      try {
        const { data: skillData, error: skillError } = await supabase
          .from('teacher_skills')
          .select('*')
          .eq('teacher_id', teacherId)
          .order('skill_name');

        if (!skillError) {
          setSkills(skillData || []);
        }
      } catch (e) {
        console.log('Skills table not available');
        setSkills([]);
      }

    } catch (error) {
      console.error('Error loading profile:', error);
      alert('Error loading teacher profile');
    }
    setLoading(false);
  }

  function getProficiencyColor(level: string) {
    const colors = {
      beginner: 'bg-blue-100 text-blue-800',
      intermediate: 'bg-yellow-100 text-yellow-800',
      advanced: 'bg-orange-100 text-orange-800',
      expert: 'bg-purple-100 text-purple-800',
    };
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const renderStarRating = (rating: number) => {
    return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const renderAbout = () => (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start gap-6">
          <div className="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center text-4xl font-bold text-blue-600 overflow-hidden">
            {profile?.profile_picture_url ? (
              <img 
                src={profile.profile_picture_url} 
                alt={profile.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              getInitials(profile?.full_name || '')
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold">{profile?.full_name}</h1>
                <p className="text-lg text-gray-600">{profile?.profile_headline}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-800">
                    {profile?.years_experience} years experience
                  </span>
                  {profile?.gender && (
                    <span className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-800">
                      {profile.gender}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">About</h2>
        {profile?.about ? (
          <p className="text-gray-700 whitespace-pre-line">{profile.about}</p>
        ) : (
          <p className="text-gray-500 italic">No about information provided.</p>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Skills & Expertise</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill.id}
                className={`px-3 py-1 rounded-full text-sm ${getProficiencyColor(skill.proficiency_level)}`}
              >
                {skill.skill_name} ({skill.proficiency_level})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {profile?.certifications && profile.certifications.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Certifications</h2>
          <ul className="list-disc list-inside space-y-1">
            {profile.certifications.map((cert, index) => (
              <li key={index} className="text-gray-700">{cert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Education */}
      {profile?.education && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Education</h2>
          <p className="text-gray-700 whitespace-pre-line">{profile.education}</p>
        </div>
      )}
    </div>
  );

  const renderExperience = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Work Experience</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Experience
        </button>
      </div>

      {experience.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <p className="text-gray-500">No work experience added yet.</p>
        </div>
      ) : (
        experience.map((exp) => (
          <div key={exp.id} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold">{exp.position}</h3>
                <p className="text-lg text-gray-700">{exp.company_name}</p>
                <p className="text-sm text-gray-500">
                  {exp.start_date} - {exp.is_current ? 'Present' : exp.end_date}
                  {exp.is_current && ' (Current)'}
                </p>
                {exp.location && (
                  <p className="text-sm text-gray-500">{exp.location}</p>
                )}
                {exp.industry && (
                  <p className="text-sm text-gray-500">Industry: {exp.industry}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                <button className="text-red-600 hover:text-red-800 text-sm">Delete</button>
              </div>
            </div>
            {exp.description && (
              <p className="mt-3 text-gray-700 whitespace-pre-line">{exp.description}</p>
            )}
          </div>
        ))
      )}
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Projects</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <p className="text-gray-500">No projects added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-lg shadow-lg p-6">
              {project.image_url && (
                <img 
                  src={project.image_url} 
                  alt={project.project_name}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              )}
              <h3 className="text-xl font-semibold">{project.project_name}</h3>
              <p className="text-gray-600">{project.role}</p>
              <p className="text-sm text-gray-500">
                {project.start_date} - {project.is_current ? 'Present' : project.end_date}
              </p>
              {project.technologies && project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {project.technologies.map((tech, index) => (
                    <span key={index} className="px-2 py-1 bg-gray-100 rounded text-xs">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
              {project.description && (
                <p className="mt-3 text-gray-700 text-sm">{project.description}</p>
              )}
              {project.project_url && (
                <a 
                  href={project.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-blue-600 hover:underline text-sm inline-block"
                >
                  View Project →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTestimonials = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Testimonials</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Testimonial
        </button>
      </div>

      {testimonials.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <p className="text-gray-500">No testimonials yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl mb-1">{renderStarRating(testimonial.rating)}</div>
                  <p className="text-gray-700 italic">"{testimonial.testimonial}"</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="font-semibold">{testimonial.student_name}</p>
                <p className="text-sm text-gray-500">
                  {testimonial.class_name} • {new Date(testimonial.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading teacher profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Teacher not found</p>
          <Link href="/dashboard/teachers">
            <button className="mt-4 text-blue-600 hover:text-blue-800">Back to Teachers</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/teachers">
            <button className="text-gray-600 hover:text-gray-900">← Back to Teachers</button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Teacher Profile</h1>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 bg-white rounded-lg shadow-lg p-2">
          {['about', 'experience', 'projects', 'testimonials'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg transition capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'about' && renderAbout()}
        {activeTab === 'experience' && renderExperience()}
        {activeTab === 'projects' && renderProjects()}
        {activeTab === 'testimonials' && renderTestimonials()}
      </div>
    </div>
  );
}