import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Per‑chat schedules: maps chatId → { interval: seconds, last: unixTimestamp }
const schedules = new Map<number, { interval: number; last: number }>();

const BOT_USERNAME = 'BumppBot';

bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase().trim();
  const chatId = ctx.chat.id;

  console.log(`[${chatId}] Received: "${text}"`);

  // Failsafe test: respond to "@BumppBot hi"
  if (text.includes(`@${BOT_USERNAME} hi`)) {
    console.log(`[${chatId}] Test 'hi' command triggered.`);
    ctx.reply('Hello, I’m alive!');
    return;
  }

  // Stop command
  if (text.includes(`@${BOT_USERNAME} stop`)) {
    schedules.delete(chatId);
    console.log(`[${chatId}] Bump stopped.`);
    ctx.reply('🛑 Bump stopped.');
    return;
  }

  // Custom bump: "@BumppBot bump this in 30 minutes"
  const match = text.match(
    new RegExp(`@${BOT_USERNAME}\\s+bump\\s+this\\s+in\\s+(\\d+)\\s*(minutes?|hours?|days?)`)
  );
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    let intervalSec = 0;

    if (unit.startsWith('minute')) intervalSec = amount * 60;
    else if (unit.startsWith('hour')) intervalSec = amount * 3600;
    else if (unit.startsWith('day')) intervalSec = amount * 86400;

    const now = Math.floor(Date.now() / 1000);
    schedules.set(chatId, { interval: intervalSec, last: now });
    console.log(
      `[${chatId}] Scheduled bump every ${amount} ${unit} (${intervalSec}s)`
    );
    ctx.reply(`✅ Bump scheduled every ${amount} ${unit}.`);
    return;
  }
});

cron.schedule('* * * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  schedules.forEach((sched, chatId) => {
    if (now - sched.last >= sched.interval) {
      console.log(`[${chatId}] Sending bump.`);
      bot.telegram.sendMessage(chatId, 'bump');
      sched.last = now;
    }
  });
});

bot.launch({ dropPendingUpdates: true });
