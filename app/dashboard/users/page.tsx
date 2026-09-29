'use client';

import { useState, useEffect } from 'react';
import { UserService, User, UserRole } from '@/lib/userService';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('student');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await UserService.getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError('');
    setInviteLink('');

    try {
      const invite = await UserService.createInvite(inviteEmail, inviteRole);
      const link = `${window.location.origin}/register?token=${invite.token}`;
      setInviteLink(link);
      setInviteEmail('');
      await loadUsers();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Invite link copied to clipboard!');
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800',
      teacher: 'bg-blue-100 text-blue-800',
      staff: 'bg-green-100 text-green-800',
      student: 'bg-gray-100 text-gray-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!confirm(`Change this user's role to ${newRole}?`)) return;

    try {
      await UserService.updateUserRole(userId, newRole);
      await loadUsers();
    } catch (error: any) {
      alert('Failed to update role: ' + error.message);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      if (currentStatus) {
        await UserService.deactivateUser(userId);
      } else {
        await UserService.activateUser(userId);
      }
      await loadUsers();
    } catch (error: any) {
      alert('Failed to update user: ' + error.message);
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👥 User Management</h1>
            <p className="text-sm text-gray-500">Manage users and send invitations</p>
          </div>
        </div>

        {/* Invite Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Invite New User</h2>
          
          <form onSubmit={handleInvite} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                required
                placeholder="user@example.com"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="mt-1 block w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff</option>
                <option value="student">Student</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 text-red-500 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {inviteLink && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-medium">✅ Invite created!</p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-md text-sm bg-white"
                />
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
                >
                  📋 Copy
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">This link expires in 48 hours</p>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">No users found</td></tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 font-medium">{user.full_name}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className={`px-2 py-1 rounded-full text-xs font-medium border-0 ${getRoleBadgeColor(user.role)}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="teacher">Teacher</option>
                          <option value="staff">Staff</option>
                          <option value="student">Student</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          className={`text-xs px-2 py-1 rounded ${
                            user.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}