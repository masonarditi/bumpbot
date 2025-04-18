import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();

const BOT_USERNAME = 'BumppBot';
const INTERVAL_SECONDS = 20;
const START_TS = Math.floor(Date.now() / 1000);   // ← NEW: record start time


bot.on('text', ctx => {
    const { date, text, chat } = ctx.message;      // ← NEW: destructure date
    if (date < START_TS) return;           

  if (ctx.message.text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    ctx.reply(`Bump scheduled every ${INTERVAL_SECONDS} seconds.`);
  }
});

cron.schedule(`*/${INTERVAL_SECONDS} * * * * *`, () => {
  chats.forEach(id => bot.telegram.sendMessage(id, 'bump'));
});

bot.launch({ dropPendingUpdates: true });        // ← UPDATED: drop queued updates