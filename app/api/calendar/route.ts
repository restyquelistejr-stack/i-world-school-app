// ============================================
// CALENDAR API ENDPOINTS
// ============================================

// app/api/calendar/route.ts
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const view = searchParams.get('view') || 'week';
    const teacherId = searchParams.get('teacher');
    const roomId = searchParams.get('room');
    
    // Get events
    const { data: events } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', startOfWeek)
        .lte('end_time', endOfWeek)
        .eq('is_active', true);
    
    // Get conflicts
    const conflicts = await detectConflicts(events);
    
    // Get teacher availability
    const { data: teachers } = await supabase
        .from('mv_teacher_schedule')
        .select('*')
        .gte('start_time', startOfWeek)
        .lte('end_time', endOfWeek);
    
    return Response.json({
        events,
        conflicts,
        teachers,
        rooms: await getRooms(),
    });
}

// app/api/calendar/event/route.ts
export async function POST(request: Request) {
    const body = await request.json();
    
    // Validate no conflicts
    const conflicts = await detectConflicts(body);
    if (conflicts.length > 0) {
        return Response.json({ 
            error: 'Conflict detected', 
            conflicts 
        }, { status: 409 });
    }
    
    // Create event
    const { data, error } = await supabase
        .from('events')
        .insert([body])
        .select()
        .single();
    
    // Send notifications
    await sendNotifications(data);
    
    return Response.json(data);
}

// app/api/calendar/event/[id]/route.ts
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    const body = await request.json();
    
    // Update event
    const { data, error } = await supabase
        .from('events')
        .update(body)
        .eq('id', params.id)
        .select()
        .single();
    
    return Response.json(data);
}