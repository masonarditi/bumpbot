import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();

const BOT_USERNAME = 'BumppBot';
const INTERVAL_SECONDS = 10;
let lastBumpTS = 0;                                     // ← NEW: track last bump time

bot.on('text', ctx => {
  if (ctx.message.text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    lastBumpTS = Math.floor(Date.now() / 1000);          // ← NEW: set initial timestamp
    ctx.reply(`✅ Bump scheduled BROOOOO ${INTERVAL_SECONDS} seconds.`);
  }

  //stop script

  if (ctx.message.text.includes(`@${BOT_USERNAME} stop`)) {    
    chats.delete(ctx.chat.id);                               
    ctx.reply('🛑 Bump stopped.');                            
    return;                                                   
  }


});


cron.schedule('* * * * * *', () => {                    // ← UPDATED: run every second
  const now = Math.floor(Date.now() / 1000);            // ← NEW: current timestamp
  if (lastBumpTS && now - lastBumpTS >= INTERVAL_SECONDS) { // ← NEW: check true interval
    chats.forEach(id => bot.telegram.sendMessage(id, 'bump'));
    lastBumpTS = now;                                   // ← NEW: reset for next cycle
  }
});

bot.launch({ dropPendingUpdates: true });
