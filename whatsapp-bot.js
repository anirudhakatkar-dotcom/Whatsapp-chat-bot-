const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

let myNumber = '';

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n\n===== SCAN THIS QR CODE WITH WHATSAPP =====\n');
      qrcode.generate(qr, { small: true });
      console.log('\n===========================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) connectWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Connected!');
      myNumber = sock.user.id.split(':')[0];
      startReminderCheck(sock);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const from = msg.key.remoteJid;
    if (from.split('@')[0] !== myNumber) return;
    await handleCommand(sock, from, text, msg);
  });
}

async function handleCommand(sock, from, text, msg) {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith('add ')) {
    try {
      const match = text.match(/add (.+?) on (\d{4}-\d{2}-\d{2})(?: remind (.+))?/i);
      if (!match) {
        await sock.sendMessage(from, {
          text: '❌ Format: add [title] on YYYY-MM-DD remind 1,2,3\nExample: add Birthday on 2026-05-15 remind 1,3'
        }, { quoted: msg });
        return;
      }
      const title = match[1].trim();
      const date = match[2];
      const reminders = match[3] ? match[3].split(',').map(n => parseInt(n.trim())) : [1];
      const { error } = await supabase.from('events').insert([{ title, event_date: date, remind_days_before: reminders }]);
      if (error) throw error;
      await sock.sendMessage(from, {
        text: `✅ Added: "${title}"\n📅 Date: ${new Date(date).toDateString()}\n🔔 Reminders: ${reminders.join(', ')} days before`
      }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(from, { text: '❌ Error adding event: ' + error.message }, { quoted: msg });
    }
  }

  else if (lower === 'list' || lower === 'events') {
    try {
      const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
      if (error) throw error;
      if (data.length === 0) {
        await sock.sendMessage(from, { text: '📭 No events yet!\n\nAdd one with:\nadd [title] on YYYY-MM-DD remind 1,2' }, { quoted: msg });
        return;
      }
      const list = data.map((e, i) => {
        const date = new Date(e.event_date);
        const daysUntil = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        const countdown = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : daysUntil < 0 ? 'Past' : `In ${daysUntil} days`;
        return `${i + 1}. ${e.title}\n   📅 ${date.toDateString()}\n   ⏳ ${countdown}\n   🔔 Reminders: ${e.remind_days_before.join(', ')}d before`;
      }).join('\n\n');
      await sock.sendMessage(from, { text: `📅 Your Events:\n\n${list}` }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(from, { text: '❌ Error: ' + error.message }, { quoted: msg });
    }
  }

  else if (lower === 'help' || lower === 'commands') {
    await sock.sendMessage(from, {
      text: '🤖 Reminder Bot Commands:\n\n' +
        '📝 *add [title] on YYYY-MM-DD remind 1,2,3*\n' +
        '   Example: add Birthday on 2026-05-15 remind 1,3\n\n' +
        '📋 *list* - Show all events\n\n' +
        '❓ *help* - Show this message'
    }, { quoted: msg });
  }
}

async function startReminderCheck(sock) {
  setInterval(async () => {
    await checkAndSendReminders(sock);
  }, 60 * 60 * 1000);
  await checkAndSendReminders(sock);
}

async function checkAndSendReminders(sock) {
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
            await sock.sendMessage(`${myNumber}@s.whatsapp.net`, {
              text: `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? 's' : ''}!\n\n📅 ${eventDate.toDateString()}`
            });
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

connectWhatsApp();
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const from = msg.key.remoteJid;
    if (from.split('@')[0] !== myNumber) return;
    await handleCommand(sock, from, text, msg);
  });
}

async function handleCommand(sock, from, text, msg) {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith('add ')) {
    try {
      const match = text.match(/add (.+?) on (\d{4}-\d{2}-\d{2})(?: remind (.+))?/i);
      if (!match) {
        await sock.sendMessage(from, {
          text: '❌ Format: add [title] on YYYY-MM-DD remind 1,2,3\nExample: add Birthday on 2026-05-15 remind 1,3'
        }, { quoted: msg });
        return;
      }
      const title = match[1].trim();
      const date = match[2];
      const reminders = match[3] ? match[3].split(',').map(n => parseInt(n.trim())) : [1];
      const { error } = await supabase.from('events').insert([{ title, event_date: date, remind_days_before: reminders }]);
      if (error) throw error;
      await sock.sendMessage(from, {
        text: `✅ Added: "${title}"\n📅 Date: ${new Date(date).toDateString()}\n🔔 Reminders: ${reminders.join(', ')} days before`
      }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(from, { text: '❌ Error adding event: ' + error.message }, { quoted: msg });
    }
  }

  else if (lower === 'list' || lower === 'events') {
    try {
      const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
      if (error) throw error;
      if (data.length === 0) {
        await sock.sendMessage(from, { text: '📭 No events yet!\n\nAdd one with:\nadd [title] on YYYY-MM-DD remind 1,2' }, { quoted: msg });
        return;
      }
      const list = data.map((e, i) => {
        const date = new Date(e.event_date);
        const daysUntil = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        const countdown = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : daysUntil < 0 ? 'Past' : `In ${daysUntil} days`;
        return `${i + 1}. ${e.title}\n   📅 ${date.toDateString()}\n   ⏳ ${countdown}\n   🔔 Reminders: ${e.remind_days_before.join(', ')}d before`;
      }).join('\n\n');
      await sock.sendMessage(from, { text: `📅 Your Events:\n\n${list}` }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(from, { text: '❌ Error: ' + error.message }, { quoted: msg });
    }
  }

  else if (lower === 'help' || lower === 'commands') {
    await sock.sendMessage(from, {
      text: '🤖 Reminder Bot Commands:\n\n' +
        '📝 *add [title] on YYYY-MM-DD remind 1,2,3*\n' +
        '   Example: add Birthday on 2026-05-15 remind 1,3\n\n' +
        '📋 *list* - Show all events\n\n' +
        '❓ *help* - Show this message'
    }, { quoted: msg });
  }
}

async function startReminderCheck(sock) {
  setInterval(async () => {
    await checkAndSendReminders(sock);
  }, 60 * 60 * 1000);
  await checkAndSendReminders(sock);
}

async function checkAndSendReminders(sock) {
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
            await sock.sendMessage(`${myNumber}@s.whatsapp.net`, {
              text: `🔔 *Reminder!*\n\n"${event.title}" is in ${daysBefore} day${daysBefore > 1 ? 's' : ''}!\n\n📅 ${eventDate.toDateString()}`
            });
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

connectWhatsApp();
