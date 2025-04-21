import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';
import { handleText } from './scripts';           // ← NEW

export const BOT_USERNAME = 'BumppBot';
export const INTERVAL_SECONDS = 100;
export const chats = new Set<number>();
export const lastBumpTSRef = { value: 0 };

const bot = new Telegraf(process.env.BOT_TOKEN!);


bot.on('text', handleText);                       // ← UPDATED

cron.schedule('* * * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  if (lastBumpTSRef.value && now - lastBumpTSRef.value >= INTERVAL_SECONDS) {
    chats.forEach(id => bot.telegram.sendMessage(id, 'bump'));
    lastBumpTSRef.value = now;
  }
});

bot.launch({ dropPendingUpdates: true });
