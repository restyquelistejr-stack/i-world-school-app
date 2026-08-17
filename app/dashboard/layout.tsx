'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const menuItems = [
  { title: 'Dashboard', href: '/dashboard', icon: '📊' },
  { 
    title: 'Academics', 
    icon: '📚',
    children: [
      { title: 'Courses', href: '/dashboard/academics/courses' },
      // { title: 'Class Schedule', href: '/dashboard/classes/calendar' },
    ]
  },
  { 
    title: 'Students', 
    icon: '👨‍🎓',
    children: [
      { title: 'Directory', href: '/dashboard/students/directory' },
      { title: 'Registration', href: '/dashboard/students/registration' },
      // { title: 'Enrollments', href: '/dashboard/students/enrollments' },
    ]
  },
  { 
    title: 'Staff', 
    icon: '👨‍💼',
    children: [
      { title: 'Dashboard', href: '/dashboard/staff/dashboard' },
      { title: 'Directory', href: '/dashboard/staff/directory' },
      { title: 'Attendance', href: '/dashboard/staff/attendance' },
    ]
  },
  { 
    title: 'Classes', 
    icon: '📅',
    children: [
      { title: 'Management', href: '/dashboard/classes/management' },
      { title: 'Calendar', href: '/dashboard/classes/calendar' },
      { title: 'Inquire Class', href: '/dashboard/classes/inquire' },
    ]
  },
  { title: 'Reports', href: '/dashboard/reports', icon: '📊' },
  { title: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
  { title: 'My Profile', href: '/dashboard/profile', icon: '👤' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  useEffect(() => {
    // Auto-expand menu items that have active children
    const newOpenMenus: Record<string, boolean> = {};
    menuItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => 
          pathname === child.href || pathname?.startsWith(child.href + '/')
        );
        if (hasActiveChild) {
          newOpenMenus[item.title] = true;
        }
      }
    });
    setOpenMenus(prev => ({ ...prev, ...newOpenMenus }));
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const toggleMenu = (title: string) => {
    setOpenMenus(prev => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <Link href="/dashboard" className="text-xl font-bold text-blue-600 hover:text-blue-700">
            🏫 iWorld Learning Center
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
                {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <span className="max-w-[120px] truncate">
                {user?.user_metadata?.full_name || user?.email}
              </span>
            </div>
            
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto px-4 py-6 gap-6">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0">
          <nav className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-0.5 sticky top-24">
            {menuItems.map((item) => {
              if (item.children) {
                const isOpen = openMenus[item.title] || false;
                const hasActiveChild = item.children.some(child => isActive(child.href));
                
                return (
                  <div key={item.title} className="mb-0.5">
                    <button
                      onClick={() => toggleMenu(item.title)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${
                        hasActiveChild
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-base w-6 text-center">{item.icon}</span>
                        {item.title}
                      </span>
                      <span className={`text-xs text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </button>
                    
                    {isOpen && (
                      <div className="ml-9 mt-0.5 space-y-0.5 border-l-2 border-gray-200 pl-2">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-3 py-1.5 rounded-lg text-sm transition ${
                              isActive(child.href)
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            {child.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive(item.href!)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base w-6 text-center">{item.icon}</span>
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}