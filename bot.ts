import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();

const BOT_USERNAME = 'BumppBot';
const INTERVAL_SECONDS = 10;
let lastBumpTS = 0;                                     // ← NEW: track last bump time

// Track custom intervals for each chat
interface ChatConfig {
  interval: number; // in seconds
  lastBumpTS: number;
}
const chatConfigs = new Map<number, ChatConfig>();

bot.on('text', ctx => {
  if (ctx.message.text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    lastBumpTS = Math.floor(Date.now() / 1000);          // ← NEW: set initial timestamp
    ctx.reply(`✅ Bump scheduled every ${INTERVAL_SECONDS} seconds.`);
  }

  // Custom time period handler
  const bumpCustomMatch = ctx.message.text.match(/@BumppBot bump this in (\d+) (minute|minutes|hour|hours|day|days)/i);
  if (bumpCustomMatch) {
    const amount = parseInt(bumpCustomMatch[1]);
    const unit = bumpCustomMatch[2].toLowerCase();
    
    let intervalSeconds = 0;
    if (unit === 'minute' || unit === 'minutes') {
      intervalSeconds = amount * 60;
    } else if (unit === 'hour' || unit === 'hours') {
      intervalSeconds = amount * 60 * 60;
    } else if (unit === 'day' || unit === 'days') {
      intervalSeconds = amount * 24 * 60 * 60;
    }
    
    if (intervalSeconds > 0) {
      const chatId = ctx.chat.id;
      chats.add(chatId);
      chatConfigs.set(chatId, {
        interval: intervalSeconds,
        lastBumpTS: Math.floor(Date.now() / 1000)
      });
      
      ctx.reply(`✅ Bump scheduled every ${amount} ${unit}.`);
    }
  }

  if (ctx.message.text.includes(`@${BOT_USERNAME} hi`)) {
    ctx.reply('hello');
  }

  //stop script

  if (ctx.message.text.includes(`@${BOT_USERNAME} stop`)) {    
    chats.delete(ctx.chat.id);
    chatConfigs.delete(ctx.chat.id);                             
    ctx.reply('🛑 Bump stopped.');                            
    return;                                                   
  }
});

cron.schedule('* * * * * *', () => {                    // ← UPDATED: run every second
  const now = Math.floor(Date.now() / 1000);            // ← NEW: current timestamp
  
  // Handle default interval bumps
  if (lastBumpTS && now - lastBumpTS >= INTERVAL_SECONDS) {
    for (const chatId of chats) {
      // Skip chats with custom configs
      if (!chatConfigs.has(chatId)) {
        bot.telegram.sendMessage(chatId, 'bump');
      }
    }
    lastBumpTS = now;
  }
  
  // Handle custom interval bumps
  for (const [chatId, config] of chatConfigs.entries()) {
    if (now - config.lastBumpTS >= config.interval) {
      bot.telegram.sendMessage(chatId, 'bump');
      chatConfigs.set(chatId, {
        ...config,
        lastBumpTS: now
      });
    }
  }
});

bot.launch({ dropPendingUpdates: true });
