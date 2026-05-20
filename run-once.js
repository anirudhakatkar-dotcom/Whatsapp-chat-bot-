const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const GREEN_API_ID = process.env.GREEN_API_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const MY_NUMBER = "918390122121";
const API_URL = `https://api.green-api.com/waInstance${GREEN_API_ID}`;

async function sendMessage(phone, text) {
  try {
    const response = await fetch(`${API_URL}/sendMessage/${GREEN_API_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${phone}@c.us`, message: text })
    });
    const result = await response.json();
    console.log("Send result:", JSON.stringify(result));
    return result;
  } catch(e) {
    console.error("Send error:", e.message);
  }
}

async function checkAndSendReminders() {
  console.log("Checking reminders...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const { data: events } = await supabase.from("events").select("*");
  if (!events || events.length === 0) { console.log("No events found"); return; }
  for (const event of events) {
    let eventDate;
    if (event.recurring_monthly) {
      const originalDate = new Date(event.event_date);
      eventDate = new Date(today.getFullYear(), today.getMonth(), originalDate.getDate());
      if (eventDate < today) eventDate = new Date(today.getFullYear(), today.getMonth() + 1, originalDate.getDate());
    } else {
      eventDate = new Date(event.event_date);
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) continue;
    }
    const daysUntil = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
    console.log(`Event: ${event.title}, Days until: ${daysUntil}`);
    for (const daysBefore of event.remind_days_before) {
      if (daysUntil === daysBefore) {
        const { data: sent } = await supabase.from("reminders_sent").select("*")
          .eq("event_id", event.id)
          .eq("days_before", daysBefore)
          .gte("sent_at", event.recurring_monthly ? todayStr : "2000-01-01")
          .single();
        if (!sent) {
          const msg = daysBefore === 0
            ? `🎉 *Today is the day!*\n\n"${event.title}" is TODAY!\n\n📅 ${eventDate.toDateString()}`
            : `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? "s" : ""}!\n\n📅 ${eventDate.toDateString()}`;
          const result = await sendMessage(MY_NUMBER, msg);
          if (result && result.idMessage) {
            await supabase.from("reminders_sent").insert([{ event_id: event.id, days_before: daysBefore }]);
            console.log(`✅ Sent: ${event.title} (${daysBefore} days before)`);
          }
        } else {
          console.log(`Already sent: ${event.title} (${daysBefore} days before)`);
        }
      }
    }
  }
}

checkAndSendReminders().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
