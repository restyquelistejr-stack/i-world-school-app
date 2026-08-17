// supabase/functions/send-daily-report/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// --- CONFIGURATION ---
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY")!

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID")

// --- HELPER: Format Time ---
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

// --- FETCH HELPER ---
async function runSupabaseQuery(query: string) {
  const url = `${supabaseUrl}/rest/v1/${query}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase API error: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// --- MANUAL DATA FETCHING ---
async function getTeacherName(teacherId: string) {
  if (!teacherId) return 'Unknown Teacher';
  const url = `${supabaseUrl}/rest/v1/users?select=full_name&id=eq.${teacherId}`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const data = await response.json();
  return data[0]?.full_name || 'Unknown Teacher';
}

async function getCourseName(courseId: string) {
  if (!courseId) return 'Unknown Course';
  const url = `${supabaseUrl}/rest/v1/courses?select=name&id=eq.${courseId}`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const data = await response.json();
  return data[0]?.name || 'Unknown Course';
}

async function getRoomName(roomId: string) {
  if (!roomId) return 'TBD';
  const url = `${supabaseUrl}/rest/v1/rooms?select=name&id=eq.${roomId}`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const data = await response.json();
  return data[0]?.name || 'TBD';
}

// --- MAIN FUNCTION ---
serve(async (req) => {
  try {
    // 1. Calculate Today and Tomorrow as simple strings (YYYY-MM-DD)
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Format them as strings (e.g. "2026-08-17")
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`Looking for classes on dates: Today=${todayStr}, Tomorrow=${tomorrowStr}`);

    // 2. Fetch Today's Bookings using the 'date' column
    const todayQuery = `bookings?select=*&date=eq.${todayStr}&status=in.(confirmed,completed,in_progress)&order=start_time.asc`;
    const todayBookings = await runSupabaseQuery(todayQuery);

    // 3. Fetch Tomorrow's Bookings using the 'date' column
    const tomorrowQuery = `bookings?select=*&date=eq.${tomorrowStr}&status=eq.confirmed&order=start_time.asc`;
    const tomorrowBookings = await runSupabaseQuery(tomorrowQuery);

    // 4. Enrich the data with actual names
    const todayClasses = await Promise.all(todayBookings.map(async (b: any) => ({
      ...b,
      teacher_name: await getTeacherName(b.teacher_id),
      course_name: await getCourseName(b.course_id),
      room_name: await getRoomName(b.room_id),
    })));

    const tomorrowClasses = await Promise.all(tomorrowBookings.map(async (b: any) => ({
      ...b,
      teacher_name: await getTeacherName(b.teacher_id),
      course_name: await getCourseName(b.course_id),
      room_name: await getRoomName(b.room_id),
    })));

    console.log(`Found ${todayClasses.length} today's classes, ${tomorrowClasses.length} tomorrow's classes`);

    // 5. Build Messages
    const todaySummary = buildClassSummary("📅 Today's Classes", todayClasses || []);
    const tomorrowPreview = buildClassSummary("☀️ Tomorrow's Schedule", tomorrowClasses || []);

    // 6. Send to Telegram (Only if data was found)
    const token = TELEGRAM_BOT_TOKEN;
    const chatId = ADMIN_CHAT_ID;
    
    let telegramSuccess = false;
    if (token && chatId && (todayClasses.length > 0 || tomorrowClasses.length > 0)) {
      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      
      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: todaySummary,
          parse_mode: "HTML"
        })
      });

      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: tomorrowPreview,
          parse_mode: "HTML"
        })
      });
      
      telegramSuccess = true;
    } else {
      console.log('No classes found for today or tomorrow. Skipping Telegram message.');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      todayCount: todayClasses?.length || 0, 
      tomorrowCount: tomorrowClasses?.length || 0,
      telegramSent: telegramSuccess
    }), { status: 200 });

  } catch (error: any) {
    console.error('FATAL ERROR:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

// --- HELPER: Message Formatter ---
function buildClassSummary(title: string, classes: any[]): string {
  if (classes.length === 0) {
    return `<b>${title}</b>\n\nNo classes scheduled. 🏖️`;
  }

  let message = `<b>${title}</b>\n`;
  message += `<i>${classes.length} class${classes.length > 1 ? 'es' : ''}</i>\n\n`;

  classes.forEach((cls, index) => {
    const time = formatTime(cls.start_time);
    const endTime = formatTime(cls.end_time);
    
    message += `${index + 1}. <b>${time} - ${endTime}</b>\n`;
    message += `   👨‍🏫 ${cls.teacher_name || 'Unknown Teacher'}\n`;
    message += `   📖 ${cls.course_name || 'Unknown Course'}\n`;
    message += `   🏫 ${cls.room_name || 'TBD'}\n\n`;
  });

  return message;
}