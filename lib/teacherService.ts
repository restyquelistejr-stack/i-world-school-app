// lib/teacherService.ts
import { supabase } from './supabaseClient';

export interface TeacherDeleteResult {
  success: boolean;
  message: string;
  details: {  // ✅ Make it required instead of optional
    deletedTables: string[];
    errors: string[];
  };
}

export class TeacherService {
  /**
   * Delete a teacher and all related data
   * Handles all foreign key constraints in the correct order
   */
  static async deleteTeacher(teacherId: string): Promise<TeacherDeleteResult> {
    const result: TeacherDeleteResult = {
      success: false,
      message: '',
      details: {
        deletedTables: [],
        errors: []
      }
    };

    try {
      // 1. Get teacher info
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('id', teacherId)
        .single();

      if (userError || !user) {
        return {
          success: false,
          message: 'Teacher not found',
          details: { deletedTables: [], errors: [userError?.message || 'Not found'] }
        };
      }

      if (user.role !== 'teacher') {
        return {
          success: false,
          message: 'User is not a teacher',
          details: { deletedTables: [], errors: ['User is not a teacher'] }
        };
      }

      console.log(`🗑️ Deleting teacher: ${user.full_name} (${teacherId})`);

      // 2. Delete related records in order
      const deleteOperations = [
        { table: 'teacher_availability', field: 'teacher_id' },
        { table: 'staff_leaves', field: 'staff_id' },
        { table: 'teacher_modules', field: 'teacher_id' },
        { table: 'staff_courses', field: 'staff_id' },
        { table: 'class_options', field: 'teacher_id' },
        { table: 'bookings', field: 'teacher_id' },
        { table: 'classes', field: 'teacher_id' },
      ];

      for (const op of deleteOperations) {
        const { error } = await supabase
          .from(op.table)
          .delete()
          .eq(op.field, teacherId);
        
        if (error) {
          result.details.errors.push(`${op.table}: ${error.message}`);
          console.warn(`⚠️ Could not delete ${op.table}:`, error.message);
        } else {
          result.details.deletedTables.push(op.table);
        }
      }

      // 3. Update trial bookings (set teacher to NULL)
      const { error: trialUpdateError } = await supabase
        .from('trial_class_bookings')
        .update({ selected_teacher_id: null })
        .eq('selected_teacher_id', teacherId);
      
      if (trialUpdateError) {
        result.details.errors.push(`trial_class_bookings: ${trialUpdateError.message}`);
        console.warn('⚠️ Could not update trial bookings:', trialUpdateError.message);
      } else {
        result.details.deletedTables.push('trial_class_bookings (updated)');
      }

      // 4. Delete teacher profile
      const { error: teacherProfileError } = await supabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);
      
      if (teacherProfileError) {
        result.details.errors.push(`teachers: ${teacherProfileError.message}`);
        console.warn('⚠️ Could not delete teacher profile:', teacherProfileError.message);
      } else {
        result.details.deletedTables.push('teachers');
      }

      // 5. Finally delete the user
      const { error: userDeleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', teacherId);
      
      if (userDeleteError) {
        result.details.errors.push(`users: ${userDeleteError.message}`);
        console.warn('⚠️ Could not delete user:', userDeleteError.message);
        return {
          success: false,
          message: `Failed to delete user: ${userDeleteError.message}`,
          details: result.details
        };
      } else {
        result.details.deletedTables.push('users');
      }

      result.success = true;
      result.message = `✅ Teacher "${user.full_name}" deleted successfully!`;
      console.log('✅ Teacher deleted successfully');

      return result;

    } catch (error: any) {
      console.error('❌ Error deleting teacher:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        details: result.details
      };
    }
  }

  /**
   * Soft delete a teacher (set is_active to false)
   */
  static async softDeleteTeacher(teacherId: string): Promise<TeacherDeleteResult> {
    const result: TeacherDeleteResult = {
      success: false,
      message: '',
      details: {
        deletedTables: [],
        errors: []
      }
    };

    try {
      // Get teacher name first
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', teacherId)
        .single();

      if (userError) {
        result.message = `Teacher not found: ${userError.message}`;
        result.details.errors.push(userError.message);
        return result;
      }

      // Soft delete user
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', teacherId);

      if (updateError) {
        result.message = `Failed to deactivate: ${updateError.message}`;
        result.details.errors.push(updateError.message);
        return result;
      }

      // Also update teachers table
      await supabase
        .from('teachers')
        .update({ is_active: false })
        .eq('id', teacherId);

      result.success = true;
      result.message = `✅ Teacher "${user.full_name}" has been deactivated`;
      result.details.deletedTables.push('users (deactivated)');

      return result;

    } catch (error: any) {
      result.message = `Error: ${error.message}`;
      result.details.errors.push(error.message);
      return result;
    }
  }
}