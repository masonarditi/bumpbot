import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();

const BOT_USERNAME = 'BumppBot';
const INTERVAL_SECONDS = 20;
let lastBumpTS = 0;                                     // ← track last bump time

bot.on('text', ctx => {
  const text = ctx.message.text.toLowerCase();

  if (text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    lastBumpTS = Math.floor(Date.now() / 1000);          // ← set initial timestamp
    ctx.reply(`✅ Bump scheduled every ${INTERVAL_SECONDS} seconds.`);

  } else if (text.includes(`@${BOT_USERNAME} stop`)) {   // ← NEW: handle stop command
    chats.delete(ctx.chat.id);                           // ← NEW: unregister chat
    lastBumpTS = 0;                                      // ← NEW: reset timer
    ctx.reply('🛑 Bump stopped.');                       // ← NEW: confirmation
  }
});

cron.schedule('* * * * * *', () => {                    // ← run every second
  const now = Math.floor(Date.now() / 1000);            // ← current timestamp
  if (lastBumpTS && now - lastBumpTS >= INTERVAL_SECONDS) {
    chats.forEach(id => bot.telegram.sendMessage(id, 'bump'));
    lastBumpTS = now;                                   // ← reset for next cycle
  }
});

bot.launch({ dropPendingUpdates: true });
