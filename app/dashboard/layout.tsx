// app/dashboard/layout.tsx
// ⭐ M7: Added Substitutes link with live pending count badge
// ⭐ CHANGED: Removed header-level pending pill (now lives on dashboard page as a card)
// ⭐ v3.2: Added Rooms Needed link with distinct orange badge
// ⭐ v3.2: Widened layout — anchored left instead of centered
// ⭐ v3.2: Colored dot prefix on each "Needed" item (amber / orange)
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// ⭐ v3.2: Extended menu item type to support badge variants
interface MenuChild {
  title: string;
  href: string;
  showBadge?: boolean;        // amber (teacher substitutes)
  showRoomBadge?: boolean;    // orange (rooms needed)
}

interface MenuItem {
  title: string;
  icon: string;
  href?: string;
  children?: MenuChild[];
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: '📊' },
  {
    title: 'Academics',
    icon: '📚',
    children: [
      { title: 'Courses', href: '/dashboard/academics/courses' },
      { title: 'Inventory', href: '/dashboard/academics/inventory' },
    ]
  },
  {
    title: 'Students',
    icon: '👨‍🎓',
    children: [
      { title: 'Directory', href: '/dashboard/students/directory' },
      { title: 'Registration', href: '/dashboard/students/registration' },
    ]
  },
  {
    title: 'Staff',
    icon: '👨‍💼',
    children: [
     // { title: 'Dashboard', href: '/dashboard/staff' },
      { title: 'Directory', href: '/dashboard/staff/list' },
      { title: 'Teachers', href: '/dashboard/staff/teachers' },
     // { title: 'Teacher Matching', href: '/dashboard/staff/matching' },
     // { title: 'Attendance', href: '/dashboard/staff/attendance' },
    ]
  },
  {
    title: 'Classes',
    icon: '📅',
    children: [
      { title: 'Management', href: '/dashboard/classes/management' },
      { title: 'Calendar', href: '/dashboard/classes/calendar' },
      { title: 'New Booking', href: '/dashboard/classes/book' },
      { title: 'Group Class', href: '/dashboard/classes/group-class/create' },
      // ⭐ v3.2: Two distinct "Needed" queues
      { title: 'Teacher Subs', href: '/dashboard/substitutes/needed', showBadge: true },
      { title: 'Rooms Needed', href: '/dashboard/classes/rooms/needed', showRoomBadge: true },
      { title: 'Manage Room Bookings', href: '/dashboard/room-booking/manage' },
    ]
  },
  {
  title: 'Reports',
  icon: '📊' ,
  children: [
    { href: '/dashboard/reports',          title: 'All Reports'},
    { href: '/dashboard/reports/teachers', title: 'Teacher Hours'},
  ],
  },
  {
    title: 'Settings',
    icon: '⚙️',
    children: [
      { title: 'My Profile', href: '/dashboard/profile' },
      { title: 'Users', href: '/dashboard/users' },
    ]
  },
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
  // ⭐ M7: Live pending count for sidebar Substitutes badge
  const [pendingSubstitutes, setPendingSubstitutes] = useState<number>(0);
  // ⭐ v3.2: Live pending count for Rooms Needed badge
  const [roomNeededCount, setRoomNeededCount] = useState<number>(0);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  // ⭐ M7 + v3.2: Load + refresh both badges
  useEffect(() => {
    loadBadgeCounts();

    const interval = setInterval(loadBadgeCounts, 60000);
    return () => clearInterval(interval);
  }, [pathname]);

  async function loadBadgeCounts() {
    // Teacher substitutes — pending assignments
    try {
      const { count, error } = await supabase
        .from('substitute_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error && count !== null) {
        setPendingSubstitutes(count);
      }
    } catch (err) {
      console.warn('Could not load pending substitutes count:', err);
    }

    // ⭐ v3.2: Rooms needed — flagged room_unassigned sessions
    try {
      const { count, error } = await supabase
        .from('group_class_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('needs_attention', true)
        .eq('attention_reason', 'room_unassigned');

      if (!error && count !== null) {
        setRoomNeededCount(count);
      }
    } catch (err) {
      console.warn('Could not load rooms needed count:', err);
    }
  }

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
      {/* Top Header — full-width, anchored */}
      <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="px-6 h-16 flex justify-between items-center">
          <Link href="/dashboard" className="text-xl font-bold text-blue-600 hover:text-blue-700">
            🏫 School of Nation Learning Center
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

      {/* ⭐ v3.2: Anchored left layout — no more mx-auto centering */}
      <div className="flex px-4 py-6 gap-6 w-full">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0">
          <nav className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 space-y-0.5 sticky top-24">
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
                        <span className="text-base w-5 text-center">{item.icon}</span>
                        {item.title}
                      </span>
                      <span className={`text-xs text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </button>

                    {isOpen && (
                      <div className="ml-8 mt-0.5 space-y-0.5 border-l-2 border-gray-200 pl-2">
                        {item.children.map((child) => {
                          const isChildActive = isActive(child.href);
                          const showSubstituteBadge = child.showBadge && pendingSubstitutes > 0;
                          const showRoomBadge = child.showRoomBadge && roomNeededCount > 0;

                          // ⭐ v3.2: Distinguish room vs teacher entries via colored dot
                          const isRoomItem = !!child.showRoomBadge;
                          const isTeacherSubItem = !!child.showBadge;

                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition ${
                                isChildActive
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                              }`}
                            >
                              {/* ⭐ v3.2: Colored dot + label */}
                              <span className="flex items-center gap-2 truncate">
                                {isRoomItem && (
                                  <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                                )}
                                {isTeacherSubItem && (
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                )}
                                <span className="truncate">{child.title}</span>
                              </span>

                              {/* Amber badge — Teacher Substitutes */}
                              {showSubstituteBadge && (
                                <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center shrink-0">
                                  {pendingSubstitutes > 99 ? '99+' : pendingSubstitutes}
                                </span>
                              )}

                              {/* Orange badge — Rooms Needed */}
                              {showRoomBadge && (
                                <span className="ml-2 px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center shrink-0">
                                  {roomNeededCount > 99 ? '99+' : roomNeededCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
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
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content — no max-width constraint */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}