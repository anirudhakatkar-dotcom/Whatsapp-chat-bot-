const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GREEN_API_ID = process.env.GREEN_API_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const MY_NUMBER = '918390122121';
const API_URL = `https://api.green-api.com/waInstance${GREEN_API_ID}`;

async function sendMessage(phone, text) {
  try {
    const response = await fetch(`${API_URL}/sendMessage/${GREEN_API_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${phone}@c.us`,
        message: text
      })
    });
    const result = await response.json();
    console.log('Send result:', JSON.stringify(result));
    return result;
  } catch(e) {
    console.error('Send error:', e.message);
  }
}

async function checkAndSendReminders() {
  console.log('Checking reminders...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  try {
    const { data: events } = await supabase.from('events').select('*');
    if (!events || events.length === 0) {
      console.log('No events found');
      return;
    }

    for (const event of events) {
      // Handle recurring monthly events
      let eventDate;
      if (event.recurring_monthly) {
        // Use this year/month but with the event's day
        const originalDate = new Date(event.event_date);
        eventDate = new Date(today.getFullYear(), today.getMonth(), originalDate.getDate());
        // If this month's date has passed, use next month
        if (eventDate < today) {
          eventDate = new Date(today.getFullYear(), today.getMonth() + 1, originalDate.getDate());
        }
      } else {
        eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0);
        // Skip past non-recurring events
        if (eventDate < today && event.remind_days_before.includes(0) === false) {
          if (eventDate < today) continue;
        }
      }

      const daysUntil = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
      console.log(`Event: ${event.title}, Days until: ${daysUntil}`);

      for (const daysBefore of event.remind_days_before) {
        if (daysUntil === daysBefore) {
          // For recurring events, use today's date as part of the key
          const reminderKey = event.recurring_monthly
            ? `${event.id}_${daysBefore}_${todayStr}`
            : `${event.id}_${daysBefore}`;

          const { data: sent } = await supabase
            .from('reminders_sent')
            .select('*')
            .eq('event_id', event.id)
            .eq('days_before', daysBefore)
            .gte('sent_at', event.recurring_monthly ? todayStr : '2000-01-01')
            .single();

          if (!sent) {
            let messageText;
            if (daysBefore === 0) {
              messageText = `🎉 *Today is the day!*\n\n"${event.title}" is TODAY!\n\n📅 ${eventDate.toDateString()}`;
            } else {
              messageText = `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? 's' : ''}!\n\n📅 ${eventDate.toDateString()}`;
            }

            const result = await sendMessage(MY_NUMBER, messageText);
            if (result && result.idMessage) {
              await supabase.from('reminders_sent').insert([{
                event_id: event.id,
                days_before: daysBefore
              }]);
              console.log(`✅ Sent reminder: ${event.title} (${daysBefore} days before)`);
            } else {
              console.log(`❌ Failed to send reminder for ${event.title}, will retry`);
            }
          } else {
            console.log(`Already sent: ${event.title} (${daysBefore} days before)`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WhatsApp Reminder Bot is running!');
});

server.listen(PORT, () => {
  console.log(`✅ WhatsApp Reminder Bot started on port ${PORT}!`);
  console.log('Add events directly in Supabase.');
});

setInterval(checkAndSendReminders, 60 * 60 * 1000);
checkAndSendReminders();
