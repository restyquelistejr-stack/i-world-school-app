'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requiredRole?: 'admin' | 'teacher' | 'staff' | 'student';
}

export function ProtectedRoute({ 
  children, 
  redirectTo = '/login',
  requiredRole
}: ProtectedRouteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if user is logged in
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.push(`${redirectTo}?redirectTo=${window.location.pathname}`);
          return;
        }

        // If a specific role is required, check it
        if (requiredRole) {
          // Get user profile from users table
          const { data: userData, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (error || !userData) {
            setAuthorized(false);
            router.push('/dashboard');
            return;
          }

          // Check if user has the required role
          const roleHierarchy: Record<string, number> = {
            'admin': 4,
            'teacher': 3,
            'staff': 2,
            'student': 1,
          };

          const userRoleLevel = roleHierarchy[userData.role] || 0;
          const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

          if (userRoleLevel < requiredRoleLevel) {
            setAuthorized(false);
            router.push('/dashboard');
            return;
          }
        }

        setAuthorized(true);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push(redirectTo);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router, redirectTo, requiredRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}