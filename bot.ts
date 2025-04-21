import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Store custom schedules per chat: { interval: seconds, last: unixTimestamp }
const schedules = new Map<number, { interval: number; last: number }>();

const BOT_USERNAME = 'BumppBot';

bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase().trim();

  // Stop command
  if (text.includes(`@${BOT_USERNAME} stop`)) {
    schedules.delete(ctx.chat.id);
    ctx.reply('🛑 Bump stopped.');
    return;
  }

  // Bump with custom interval: "@BumppBot bump this in 30 minutes"
  const match = text.match(
    new RegExp(`@${BOT_USERNAME}\\s+bump\\s+this\\s+in\\s+(\\d+)\\s*(minutes?|hours?|days?)`)
  );
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit   = match[2];
    let interval = 0;
    if (unit.startsWith('minute')) interval = amount * 60;
    else if (unit.startsWith('hour'))  interval = amount * 3600;
    else if (unit.startsWith('day'))   interval = amount * 86400;

    const now = Math.floor(Date.now() / 1000);
    schedules.set(ctx.chat.id, { interval, last: now });
    ctx.reply(`✅ Bump scheduled every ${amount} ${unit}.`);
    return;
  }
});

cron.schedule('* * * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  schedules.forEach((sched, chatId) => {
    if (now - sched.last >= sched.interval) {
      bot.telegram.sendMessage(chatId, 'bump');
      sched.last = now;
    }
  });
});

bot.launch({ dropPendingUpdates: true });
