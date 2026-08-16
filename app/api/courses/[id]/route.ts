import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id || id === 'undefined') {
      return NextResponse.json(
        { success: false, error: 'Invalid Course ID provided.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { 
      name, age_group, course_type, description, 
      duration_hours, delivery_mode, includes_exam_prep, exam_types,
      pricing_mode, price_per_hour_on_site, price_per_hour_online,
      price_20plus_on_site, price_20plus_online, 
      price_50plus_on_site, price_50plus_online,
      scheduling_preference, link_url, // ✅ Added link_url
      modules, packages
    } = body;

    // 1. Update the main Course
    const { error: courseError } = await supabase
      .from('courses')
      .update({
        name, age_group, course_type, description, 
        duration_hours, delivery_mode, includes_exam_prep, exam_types,
        pricing_mode, price_per_hour_on_site, price_per_hour_online,
        price_20plus_on_site, price_20plus_online, 
        price_50plus_on_site, price_50plus_online,
        scheduling_preference,
        link_url // ✅ Added link_url to update
      })
      .eq('id', id);

    if (courseError) throw courseError;

    // 2. Delete old modules and packages
    const { error: deleteModulesError } = await supabase
      .from('course_modules')
      .delete()
      .eq('course_id', id);
    if (deleteModulesError) throw deleteModulesError;

    const { error: deletePackagesError } = await supabase
      .from('course_packages')
      .delete()
      .eq('course_id', id);
    if (deletePackagesError) throw deletePackagesError;

    // 3. Insert incoming packages
    if (packages && packages.length > 0) {
      const packagesToInsert = packages.map((pkg: any) => ({
        course_id: id,
        name: pkg.name,
        sessions: pkg.sessions,
        amount: pkg.amount,
        description: pkg.description || null,
        is_active: pkg.is_active,
      }));
      
      const { error: packagesError } = await supabase
        .from('course_packages')
        .insert(packagesToInsert);
      
      if (packagesError) throw packagesError;
    }

    // 4. Insert incoming modules
    if (modules && modules.length > 0) {
      for (const module of modules) {
        const { data: moduleData, error: moduleError } = await supabase
          .from('course_modules')
          .insert({
            course_id: id,
            title: module.title,
            level: module.level || null,
            description: module.description || null,
            module_order: module.module_order,
          })
          .select()
          .single();

        if (moduleError) throw moduleError;
        const moduleId = moduleData.id;

        if (module.delivery_units && module.delivery_units.length > 0) {
          const unitsToInsert = module.delivery_units.map((unit: any) => ({
            module_id: moduleId,
            title: unit.title,
            unit_type: unit.unit_type,
            duration_minutes: unit.duration_minutes,
            unit_order: unit.unit_order,
          }));

          const { error: unitsError } = await supabase
            .from('course_delivery_units')
            .insert(unitsToInsert);

          if (unitsError) throw unitsError;
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Course updated successfully' });

  } catch (error: any) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update course' },
      { status: 500 }
    );
  }
}