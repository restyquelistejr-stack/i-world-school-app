'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      console.log('1. Starting registration for:', email);

      // Step 1: Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'student',
          },
        },
      });

      console.log('2. Auth response:', { authData, authError });

      if (authError) {
        console.error('Auth error:', authError);
        setError('Auth error: ' + authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        console.error('No user returned from auth');
        setError('Failed to create user account');
        setLoading(false);
        return;
      }

      console.log('3. User created with ID:', authData.user.id);

      // Step 2: Try to insert into users table
      try {
        const { data: insertData, error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: email,
            full_name: fullName,
            role: 'student',
          })
          .select();

        console.log('4. Insert response:', { insertData, insertError });

        if (insertError) {
          console.error('Insert error details:', {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
          });
          
          // If insert fails, we still have auth user
          setError('Account created but profile could not be saved. You can still log in.');
          // Don't set loading to false yet, let the user know they can still login
        } else {
          console.log('5. User profile saved successfully!');
          setSuccess(true);
        }
      } catch (insertErr) {
        console.error('6. Insert exception:', insertErr);
        setError('Account created but profile save failed. You can still log in.');
      }

      // Always show success if auth worked (even if profile save failed)
      if (authData.user) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }

    } catch (error: any) {
      console.error('Registration error:', error);
      setError('An unexpected error occurred: ' + (error.message || 'Unknown error'));
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-6">School Management System</h1>
        <h2 className="text-xl font-semibold text-center mb-6">Register</h2>

        {success && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
            ✅ Registration successful! Redirecting to login...
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 text-yellow-700 p-3 rounded-lg mb-4 text-sm border border-yellow-200">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
            <p className="text-gray-500 text-xs mt-1">
              Password must be at least 6 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-sm mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}