'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserService } from '@/lib/userService';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    password: '',
    confirm_password: '',
  });

  // Verify invite token on load
  useEffect(() => {
    if (token) {
      verifyInvite();
    }
  }, [token]);

  const verifyInvite = async () => {
    if (!token) return;

    try {
      const invite = await UserService.verifyInvite(token);
      if (invite) {
        setInviteValid(true);
        setInviteEmail(invite.email);
      } else {
        setInviteValid(false);
        setError('Invalid or expired invite link. Please contact your administrator.');
      }
    } catch (error) {
      setInviteValid(false);
      setError('Failed to verify invite. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate password
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (!token) {
      setError('Invalid registration link');
      setLoading(false);
      return;
    }

    try {
      const result = await UserService.completeRegistration(
        token,
        formData.password,
        formData.full_name
      );

      if (result.session) {
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        // User created but needs email confirmation
        router.push('/login?message=Please check your email to confirm your account');
      }
    } catch (error: any) {
      setError(error.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Invalid invite state
  if (inviteValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
          <div className="text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900">Invalid Invite</h1>
            <p className="mt-2 text-gray-600">{error}</p>
            <Link href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading invite verification
  if (inviteValid === null && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying your invite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Create Your Account</h1>
          <p className="mt-2 text-sm text-gray-600">
            You've been invited to join iWorld Learning Center
          </p>
          {inviteEmail && (
            <p className="mt-1 text-sm text-blue-600">
              Inviting: <span className="font-medium">{inviteEmail}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white p-8 rounded-lg shadow">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Min 6 characters"
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Confirm Password *
            </label>
            <input
              type="password"
              value={formData.confirm_password}
              onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}