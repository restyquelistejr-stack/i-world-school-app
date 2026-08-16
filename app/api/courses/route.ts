import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title, 
      subject_id, 
      scheduling_preference, 
      modules, 
      // Add any other fields from your form like age_group, description, etc.
      ...courseMeta 
    } = body;

    // 1. Start by inserting the main Course
    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .insert({
        name: title,
        subject_id: subject_id,
        scheduling_preference: scheduling_preference,
        ...courseMeta // This spreads in age_group, description, pricing, etc.
      })
      .select()
      .single();

    if (courseError) throw courseError;
    const courseId = courseData.id;

    // 2. Loop through Modules
    if (modules && modules.length > 0) {
      for (const module of modules) {
        const { data: moduleData, error: moduleError } = await supabase
          .from('course_modules')
          .insert({
            course_id: courseId,
            title: module.title,
            module_order: module.module_order,
          })
          .select()
          .single();

        if (moduleError) throw moduleError;
        const moduleId = moduleData.id;

        // 3. Loop through Delivery Units inside the Module
        if (module.delivery_units && module.delivery_units.length > 0) {
          const { error: unitsError } = await supabase
            .from('course_delivery_units')
            .insert(
              module.delivery_units.map((unit: any) => ({
                module_id: moduleId,
                title: unit.title,
                unit_type: unit.unit_type,
                duration_minutes: unit.duration_minutes,
                unit_order: unit.unit_order,
              }))
            );

          if (unitsError) throw unitsError;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Course created successfully', 
      courseId 
    });

  } catch (error: any) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create course' },
      { status: 500 }
    );
  }
}