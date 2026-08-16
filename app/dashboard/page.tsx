'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Stats {
  students: number;
  teachers: number;
  classes: number;
  enrollments: number;
  offers: number;
  pendingEnrollments: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    students: 0,
    teachers: 0,
    classes: 0,
    enrollments: 0,
    offers: 0,
    pendingEnrollments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
      }
    };
    getUser();
    loadStats();

    const now = new Date();
    setCurrentDate(now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }));
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const { count: students } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student')
        .eq('is_active', true);

      const { count: teachers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'teacher')
        .eq('is_active', true);

      const { count: classes } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true });

      const { count: enrollments } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true });

      const { count: offers } = await supabase
        .from('student_offers')
        .select('*', { count: 'exact', head: true });

      const { count: pendingEnrollments } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'pending');

      setStats({
        students: students || 0,
        teachers: teachers || 0,
        classes: classes || 0,
        enrollments: enrollments || 0,
        offers: offers || 0,
        pendingEnrollments: pendingEnrollments || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
    setLoading(false);
  }

  const statCards = [
    { label: 'Students', value: stats.students, icon: '👨‍🎓', color: 'bg-blue-500', href: '/dashboard/students/directory' },
    { label: 'Teachers', value: stats.teachers, icon: '👨‍🏫', color: 'bg-green-500', href: '/dashboard/staff/directory' },
    { label: 'Classes', value: stats.classes, icon: '🏫', color: 'bg-purple-500', href: '/dashboard/classes' },
    { label: 'Enrollments', value: stats.enrollments, icon: '📋', color: 'bg-orange-500', href: '/dashboard/students/enrollments' },
    { label: 'Offers', value: stats.offers, icon: '🎯', color: 'bg-pink-500', href: '/dashboard/offer' },
    { label: 'Pending Payments', value: stats.pendingEnrollments, icon: '⏳', color: 'bg-red-500', href: '/dashboard/students/enrollments' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {userName || 'Admin'} 👋
            </h1>
            <p className="text-sm text-gray-500">{currentDate}</p>
          </div>
          <Link href="/dashboard/students/registration">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              + New Student
            </button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stat.icon}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${stat.color}`}>
                  {stat.value}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600 mt-2 truncate">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">⚡ Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard/students/registration">
              <button className="w-full px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-sm flex items-center justify-center gap-2">
                <span>📝</span> Register
              </button>
            </Link>
            <Link href="/dashboard/students/enrollment?student=">
              <button className="w-full px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-sm flex items-center justify-center gap-2">
                <span>📚</span> Enroll
              </button>
            </Link>
            <Link href="/dashboard/offer">
              <button className="w-full px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition text-sm flex items-center justify-center gap-2">
                <span>🎯</span> Offer
              </button>
            </Link>
            <Link href="/dashboard/classes/calendar">
              <button className="w-full px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition text-sm flex items-center justify-center gap-2">
                <span>📅</span> Calendar
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">📊 Quick Stats</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Students</span>
              <span className="text-sm font-bold text-gray-900">{stats.students}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Teachers</span>
              <span className="text-sm font-bold text-gray-900">{stats.teachers}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Active Classes</span>
              <span className="text-sm font-bold text-gray-900">{stats.classes}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Pending Payments</span>
              <span className="text-sm font-bold text-red-600">{stats.pendingEnrollments}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}