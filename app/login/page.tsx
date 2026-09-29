'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { UserService } from '@/lib/userService';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError('');

    try {
      await UserService.requestPasswordReset(resetEmail);
      setResetSent(true);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">School of Nation Learning Center</h1>
          <p className="mt-2 text-sm text-gray-600">
            {showResetForm ? 'Reset Your Password' : 'Sign in to your account'}
          </p>
        </div>

        {message && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm text-center">
            {message}
          </div>
        )}

        {!showResetForm ? (
          // Login Form
          <form onSubmit={handleLogin} className="mt-8 space-y-6 bg-white p-8 rounded-lg shadow">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowResetForm(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="text-center text-sm text-gray-500">
              Don't have an account?{' '}
              <span className="text-gray-400">Contact your administrator for an invite</span>
            </div>
          </form>
        ) : (
          // Reset Password Form
          <form onSubmit={handleResetPassword} className="mt-8 space-y-6 bg-white p-8 rounded-lg shadow">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {resetSent ? (
              <div className="text-center">
                <div className="text-4xl mb-4">📧</div>
                <p className="text-gray-700">Password reset link sent!</p>
                <p className="text-sm text-gray-500 mt-2">
                  Check your email for instructions to reset your password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetForm(false);
                    setResetSent(false);
                  }}
                  className="mt-4 text-blue-600 hover:underline"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="Enter your email"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    We'll send you a link to reset your password
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowResetForm(false)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}