import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

// --- CONFIGURATION (Using your existing environment variable names) ---
const supabaseUrl = Deno.env.get("PROJECT_URL")!
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY")!
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID")

// --- HELPER: Send Telegram Message ---
async function sendTelegramMessage(chatId: string, text: string) {
  const token = TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.error('Telegram credentials not configured');
    return false;
  }
  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" })
    });
    const result = await response.json();
    if (result.ok) {
      console.log('✅ Telegram message sent');
      return true;
    } else {
      console.error('❌ Telegram error:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error);
    return false;
  }
}

// --- MAIN AGENT LOGIC ---
serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const classId = url.searchParams.get('classId');

    // Handle real-time status updates
    if (action === 'status_update' && classId) {
      const result = await handleStatusUpdate(supabase, classId);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle summary (every 30 minutes)
    if (action === 'summary') {
      const result = await generateSummary(supabase);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle test endpoint
    if (action === 'test') {
      const result = await sendTelegramMessage(ADMIN_CHAT_ID, "🔔 Test message from Class Guardian!");
      return new Response(
        JSON.stringify({ 
          success: result,
          message: result ? "✅ Test message sent to Telegram!" : "❌ Failed to send test message",
          botToken: TELEGRAM_BOT_TOKEN ? "✅ Set" : "❌ Not set",
          chatId: ADMIN_CHAT_ID ? "✅ Set" : "❌ Not set"
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Default response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Class Guardian is running. Try ?action=test, ?action=summary, or ?action=status_update&classId=xxx' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// Handle real-time status updates
async function handleStatusUpdate(supabase: any, classId: string) {
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select(`
      *,
      courses:course_id (name),
      teachers:teacher_id (full_name)
    `)
    .eq('id', classId)
    .single();

  if (classError) throw classError;

  const { count: studentCount } = await supabase
    .from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', 'active');

  const { data: moduleData } = await supabase
    .from('course_modules')
    .select('level')
    .eq('course_id', classData.course_id)
    .limit(1)
    .single();

  let notificationType = 'status_change';
  let message = '';
  let telegramMessage = '';

  const statusMap: Record<string, string> = {
    'pending_admin': '⏳ Pending Admin Approval',
    'pending_student': '👤 Pending Student Approval',
    'pending_enrollment': '📝 Pending Enrollment',
    'active': '✅ Enrolled'
  };

  if (classData.status === 'active') {
    notificationType = 'enrolled';
    message = `✅ Class Enrolled: ${classData.class_code} - ${classData.courses?.name || 'Unknown'}\n` +
              `👨‍🏫 Teacher: ${classData.teachers?.full_name || 'Not Assigned'}\n` +
              `📚 Level: ${moduleData?.level || 'N/A'}\n` +
              `📅 Sessions: ${classData.total_sessions || 0}\n` +
              `👥 Students: ${studentCount || 0}`;
    
    telegramMessage = `🎉 <b>CLASS ENROLLED!</b>\n\n` +
                      `📚 <b>${classData.courses?.name || 'Unknown'}</b>\n` +
                      `📋 Code: ${classData.class_code}\n` +
                      `👨‍🏫 Teacher: ${classData.teachers?.full_name || 'Not Assigned'}\n` +
                      `📚 Level: ${moduleData?.level || 'N/A'}\n` +
                      `📅 Sessions: ${classData.total_sessions || 0}\n` +
                      `👥 Students: ${studentCount || 0}`;
  } else if (['pending_admin', 'pending_student', 'pending_enrollment'].includes(classData.status)) {
    message = `📋 ${classData.class_code} - ${classData.courses?.name || 'Unknown'}\n` +
              `Status: ${statusMap[classData.status] || classData.status}\n` +
              `👨‍🏫 Teacher: ${classData.teachers?.full_name || 'Not Assigned'}\n` +
              `📚 Level: ${moduleData?.level || 'N/A'}`;
    
    telegramMessage = `📋 <b>Class Status Update</b>\n\n` +
                      `📚 <b>${classData.courses?.name || 'Unknown'}</b>\n` +
                      `📋 Code: ${classData.class_code}\n` +
                      `📌 Status: ${statusMap[classData.status] || classData.status}\n` +
                      `👨‍🏫 Teacher: ${classData.teachers?.full_name || 'Not Assigned'}\n` +
                      `📚 Level: ${moduleData?.level || 'N/A'}`;
  } else {
    return { success: true, message: 'Status not tracked' };
  }

  // Store in database
  const { error: notifError } = await supabase
    .from('class_notifications')
    .insert([{
      class_id: classData.id,
      class_code: classData.class_code,
      course_name: classData.courses?.name || 'Unknown',
      level: moduleData?.level || 'N/A',
      teacher_name: classData.teachers?.full_name || 'Not Assigned',
      total_sessions: classData.total_sessions || 0,
      student_count: studentCount || 0,
      status: classData.status,
      message: message,
      notification_type: notificationType,
      is_read: false,
    }]);

  if (notifError) throw notifError;

  // Send Telegram notification
  await sendTelegramMessage(ADMIN_CHAT_ID, telegramMessage);

  return { success: true, message: 'Status update notification sent' };
}

// Generate scheduled summary (called every 30 minutes)
async function generateSummary(supabase: any) {
  const pendingStatuses = ['pending_admin', 'pending_student', 'pending_enrollment'];
  
  const { data: pendingClasses, error: pendingError } = await supabase
    .from('classes')
    .select(`
      *,
      courses:course_id (name),
      teachers:teacher_id (full_name)
    `)
    .in('status', pendingStatuses)
    .order('created_at', { ascending: false });

  if (pendingError) throw pendingError;

  const { data: enrolledClasses, error: enrolledError } = await supabase
    .from('classes')
    .select(`
      *,
      courses:course_id (name),
      teachers:teacher_id (full_name)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (enrolledError) throw enrolledError;

  const classIds = [...(pendingClasses || []), ...(enrolledClasses || [])].map(c => c.id);
  let studentCounts: Record<string, number> = {};
  
  if (classIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .in('class_id', classIds)
      .eq('status', 'active');

    if (enrollments) {
      studentCounts = enrollments.reduce((acc: Record<string, number>, curr) => {
        acc[curr.class_id] = (acc[curr.class_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  let summaryMessage = `📊 <b>CLASS SUMMARY REPORT</b>\n`;
  summaryMessage += `${'='.repeat(40)}\n\n`;
  summaryMessage += `📅 ${new Date().toLocaleString()}\n\n`;

  summaryMessage += `📋 <b>PENDING CLASSES</b> (${pendingClasses?.length || 0})\n`;
  summaryMessage += `${'-'.repeat(30)}\n`;
  
  if (pendingClasses && pendingClasses.length > 0) {
    pendingClasses.forEach(cls => {
      const statusMap: Record<string, string> = {
        'pending_admin': '⏳ Pending Admin',
        'pending_student': '👤 Pending Student',
        'pending_enrollment': '📝 Pending Enrollment'
      };
      summaryMessage += `🔹 ${cls.class_code} - ${cls.courses?.name || 'Unknown'}\n`;
      summaryMessage += `   ${statusMap[cls.status] || cls.status}\n`;
      summaryMessage += `   Teacher: ${cls.teachers?.full_name || 'Not Assigned'}\n`;
      summaryMessage += `   Students: ${studentCounts[cls.id] || 0}\n\n`;
    });
  } else {
    summaryMessage += `✅ No pending classes\n\n`;
  }

  summaryMessage += `✅ <b>RECENTLY ENROLLED</b> (${enrolledClasses?.length || 0})\n`;
  summaryMessage += `${'-'.repeat(30)}\n`;
  
  if (enrolledClasses && enrolledClasses.length > 0) {
    enrolledClasses.forEach(cls => {
      summaryMessage += `🔹 ${cls.class_code} - ${cls.courses?.name || 'Unknown'}\n`;
      summaryMessage += `   Teacher: ${cls.teachers?.full_name || 'Not Assigned'}\n`;
      summaryMessage += `   Students: ${studentCounts[cls.id] || 0}\n`;
      summaryMessage += `   Enrolled: ${new Date(cls.created_at).toLocaleDateString()}\n\n`;
    });
  } else {
    summaryMessage += `📌 No recently enrolled classes\n\n`;
  }

  summaryMessage += `${'='.repeat(40)}\n`;
  summaryMessage += `📊 Total Pending: ${pendingClasses?.length || 0}\n`;
  summaryMessage += `✅ Total Enrolled: ${enrolledClasses?.length || 0}`;

  // Store in database
  const { error: notifError } = await supabase
    .from('class_notifications')
    .insert([{
      class_id: null,
      class_code: 'SUMMARY',
      course_name: 'Class Summary Report',
      level: 'N/A',
      teacher_name: 'System',
      total_sessions: 0,
      student_count: (pendingClasses?.length || 0) + (enrolledClasses?.length || 0),
      status: 'summary',
      message: summaryMessage.replace(/<[^>]*>/g, ''),
      notification_type: 'summary',
      is_read: false,
    }]);

  if (notifError) throw notifError;

  // Send Telegram summary
  await sendTelegramMessage(ADMIN_CHAT_ID, summaryMessage);

  return {
    success: true,
    pending_count: pendingClasses?.length || 0,
    enrolled_count: enrolledClasses?.length || 0,
    message: 'Summary generated and sent to Telegram'
  };
}