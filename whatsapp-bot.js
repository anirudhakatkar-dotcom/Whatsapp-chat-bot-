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
  try {
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', today.toISOString().split('T')[0]);

    if (!events || events.length === 0) {
      console.log('No upcoming events found');
      return;
    }

    for (const event of events) {
      const eventDate = new Date(event.event_date);
      eventDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
      console.log(`Event: ${event.title}, Days until: ${daysUntil}`);

      for (const daysBefore of event.remind_days_before) {
        if (daysUntil === daysBefore) {
          const { data: sent } = await supabase
            .from('reminders_sent')
            .select('*')
            .eq('event_id', event.id)
            .eq('days_before', daysBefore)
            .single();

          if (!sent) {
            console.log(`Sending reminder for ${event.title}...`);
            const result = await sendMessage(MY_NUMBER,
              `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? 's' : ''}!\n\n📅 ${eventDate.toDateString()}`
            );
            if (result && result.idMessage) {
              await supabase.from('reminders_sent').insert([{
                event_id: event.id,
                days_before: daysBefore
              }]);
              console.log(`✅ Sent reminder: ${event.title}`);
            } else {
              console.log(`❌ Failed to send reminder for ${event.title}, will retry`);
            }
          } else {
            console.log(`Already sent reminder for ${event.title} (${daysBefore} days before)`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

// Simple HTTP server so Railway keeps the service alive
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WhatsApp Reminder Bot is running!');
});

server.listen(PORT, () => {
  console.log(`✅ WhatsApp Reminder Bot started on port ${PORT}!`);
  console.log('Reminders will be checked every hour.');
  console.log('Add events directly in Supabase Table Editor.');
});

// Check reminders every hour
setInterval(checkAndSendReminders, 60 * 60 * 1000);

// Check immediately on startup
checkAndSendReminders();
