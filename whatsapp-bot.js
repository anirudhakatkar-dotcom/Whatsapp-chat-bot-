const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GREEN_API_ID = process.env.GREEN_API_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const MY_NUMBER = '918390122121';
const API_URL = `https://7107.api.greenapi.com/waInstance${GREEN_API_ID}`;

async function sendMessage(phone, text) {
  const url = `${API_URL}/sendMessage/${GREEN_API_TOKEN}`;
  const response = await fetch(url, {
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
}

async function receiveMessages() {
  try {
    const url = `${API_URL}/receiveNotification/${GREEN_API_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.receiptId) return null;

    console.log('Received notification:', JSON.stringify(data.body?.typeWebhook));

    const receiptId = data.receiptId;

    // Delete notification
    await fetch(`${API_URL}/deleteNotification/${GREEN_API_TOKEN}/${receiptId}`, {
      method: 'DELETE'
    });

    return data.body;
  } catch (e) {
    console.error('Error receiving:', e.message);
    return null;
  }
}

async function handleMessage(body) {
  try {
    console.log('Full body:', JSON.stringify(body));

    if (body?.typeWebhook !== 'incomingMessageReceived') return;

    const messageData = body?.messageData;
    if (!messageData) return;

    const type = messageData.typeMessage;
    console.log('Message type:', type);

    const text = messageData.textMessageData?.textMessage ||
                 messageData.extendedTextMessageData?.text || '';

    console.log('Text:', text);

    const from = body?.senderData?.sender?.replace('@c.us', '');
    console.log('From:', from, 'Expected:', MY_NUMBER);

    if (!from || from !== MY_NUMBER) {
      console.log('Ignoring message from:', from);
      return;
    }

    await handleCommand(from, text);
  } catch (e) {
    console.error('Error handling message:', e.message);
  }
}

async function handleCommand(from, text) {
  const lower = text.toLowerCase().trim();
  console.log('Handling command:', lower);

  if (lower.startsWith('add ')) {
    try {
      const match = text.match(/add (.+?) on (\d{4}-\d{2}-\d{2})(?: remind (.+))?/i);
      if (!match) {
        await sendMessage(from, '❌ Format: add [title] on YYYY-MM-DD remind 1,2,3\nExample: add Birthday on 2026-05-15 remind 1,3');
        return;
      }
      const title = match[1].trim();
      const date = match[2];
      const reminders = match[3] ? match[3].split(',').map(n => parseInt(n.trim())) : [1];
      const { error } = await supabase.from('events').insert([{ title, event_date: date, remind_days_before: reminders }]);
      if (error) throw error;
      await sendMessage(from, `✅ Added: "${title}"\n📅 Date: ${new Date(date).toDateString()}\n🔔 Reminders: ${reminders.join(', ')} days before`);
    } catch (error) {
      await sendMessage(from, '❌ Error: ' + error.message);
    }
  }

  else if (lower === 'list' || lower === 'events') {
    try {
      const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
      if (error) throw error;
      if (data.length === 0) {
        await sendMessage(from, '📭 No events yet!\n\nAdd one with:\nadd [title] on YYYY-MM-DD remind 1,2');
        return;
      }
      const list = data.map((e, i) => {
        const date = new Date(e.event_date);
        const daysUntil = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        const countdown = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : daysUntil < 0 ? 'Past' : `In ${daysUntil} days`;
        return `${i + 1}. ${e.title}\n   📅 ${date.toDateString()}\n   ⏳ ${countdown}\n   🔔 Reminders: ${e.remind_days_before.join(', ')}d before`;
      }).join('\n\n');
      await sendMessage(from, `📅 Your Events:\n\n${list}`);
    } catch (error) {
      await sendMessage(from, '❌ Error: ' + error.message);
    }
  }

  else if (lower === 'help' || lower === 'commands') {
    await sendMessage(from,
      '🤖 Reminder Bot Commands:\n\n' +
      '📝 *add [title] on YYYY-MM-DD remind 1,2,3*\n' +
      '   Example: add Birthday on 2026-05-15 remind 1,3\n\n' +
      '📋 *list* - Show all events\n\n' +
      '❓ *help* - Show this message'
    );
  }
}

async function checkAndSendReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    const { data: events } = await supabase.from('events').select('*').gte('event_date', today.toISOString().split('T')[0]);
    if (!events) return;
    for (const event of events) {
      const eventDate = new Date(event.event_date);
      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      for (const daysBefore of event.remind_days_before) {
        if (daysUntil === daysBefore) {
          const { data: sent } = await supabase.from('reminders_sent').select('*').eq('event_id', event.id).eq('days_before', daysBefore).single();
          if (!sent) {
            await sendMessage(MY_NUMBER, `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? 's' : ''}!\n\n📅 ${eventDate.toDateString()}`);
            await supabase.from('reminders_sent').insert([{ event_id: event.id, days_before: daysBefore }]);
            console.log(`✅ Sent reminder: ${event.title}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
}

async function main() {
  console.log('✅ WhatsApp Reminder Bot started!');
  console.log('Polling for messages every 3 seconds...');

  setInterval(checkAndSendReminders, 60 * 60 * 1000);
  await checkAndSendReminders();

  setInterval(async () => {
    const body = await receiveMessages();
    if (body) await handleMessage(body);
  }, 3000);
}

main();
