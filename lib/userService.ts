import { supabase } from './supabaseClient';

export type UserRole = 'admin' | 'teacher' | 'staff' | 'student';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface UserInvite {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export class UserService {
  // Get all users (admin only)
  static async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at, created_by')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Get users by role
  static async getUsersByRole(role: UserRole): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('role', role)
      .eq('is_active', true)
      .order('full_name');

    if (error) throw error;
    return data || [];
  }

  // Get current user
  static async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }

  // Check if user has permission
  static async hasPermission(requiredRole: UserRole): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    const roleHierarchy: Record<UserRole, number> = {
      'admin': 4,
      'teacher': 3,
      'staff': 2,
      'student': 1,
    };

    return roleHierarchy[user.role as UserRole] >= roleHierarchy[requiredRole];
  }

  // Create user invite (admin only)
  static async createInvite(email: string, role: UserRole): Promise<UserInvite> {
    // Generate a random token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hours expiration

    const { data, error } = await supabase
      .from('user_invites')
      .insert({
        email,
        role,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Verify invite token
  static async verifyInvite(token: string): Promise<UserInvite | null> {
    const { data, error } = await supabase
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) return null;
    return data;
  }

  // Complete registration with invite token
  static async completeRegistration(
    token: string,
    password: string,
    fullName: string
  ): Promise<{ user: User; session: any }> {
    // Verify invite
    const invite = await this.verifyInvite(token);
    if (!invite) {
      throw new Error('Invalid or expired invite token');
    }

    // Create user in auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invite.email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          role: invite.role,
        },
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    // Create user in users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: invite.email,
        full_name: fullName,
        role: invite.role,
        is_active: true,
        created_by: invite.invited_by,
      })
      .select()
      .single();

    if (userError) throw userError;

    // Mark invite as used
    await supabase
      .from('user_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    return { user: userData, session: authData.session };
  }

  // Update user role (admin only)
  static async updateUserRole(userId: string, role: UserRole): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Deactivate user (admin only)
  static async deactivateUser(userId: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) throw error;
  }

  // Activate user (admin only)
  static async activateUser(userId: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', userId);

    if (error) throw error;
  }

  // Request password reset
  static async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  }

  // Update password with reset token
  static async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }
}