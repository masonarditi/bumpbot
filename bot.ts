import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();
const BOT_USERNAME = 'BumppBot';

// Track one-time scheduled bumps
interface ScheduledBump {
  chatId: number;
  scheduledTime: number; // timestamp in seconds
}
const scheduledBumps: ScheduledBump[] = [];

bot.on('text', ctx => {
  if (ctx.message.text.includes(`@${BOT_USERNAME} hi`)) {
    ctx.reply('hello');
  }

  // One-time bump after specified time
  const bumpCustomMatch = ctx.message.text.match(/@BumppBot bump this in (\d+) (second|seconds|minute|minutes|hour|hours|day|days)/i);
  if (bumpCustomMatch) {
    const amount = parseInt(bumpCustomMatch[1]);
    const unit = bumpCustomMatch[2].toLowerCase();
    
    let delaySeconds = 0;
    if (unit === 'second' || unit === 'seconds') {
      delaySeconds = amount;
    } else if (unit === 'minute' || unit === 'minutes') {
      delaySeconds = amount * 60;
    } else if (unit === 'hour' || unit === 'hours') {
      delaySeconds = amount * 60 * 60;
    } else if (unit === 'day' || unit === 'days') {
      delaySeconds = amount * 24 * 60 * 60;
    }
    
    if (delaySeconds > 0) {
      const chatId = ctx.chat.id;
      const scheduledTime = Math.floor(Date.now() / 1000) + delaySeconds;
      
      scheduledBumps.push({
        chatId,
        scheduledTime
      });
      
      ctx.reply(`✅ Bump scheduled in ${amount} ${unit}.`);
    }
  }

  //stop script
  if (ctx.message.text.includes(`@${BOT_USERNAME} stop`)) {    
    // Remove all scheduled bumps for this chat
    const chatId = ctx.chat.id;
    
    // Filter out bumps for this chat
    for (let i = scheduledBumps.length - 1; i >= 0; i--) {
      if (scheduledBumps[i].chatId === chatId) {
        scheduledBumps.splice(i, 1);
      }
    }
    
    chats.delete(chatId);
    ctx.reply('🛑 Bump stopped.');                            
    return;                                                   
  }
});

// Check for scheduled bumps every second
cron.schedule('* * * * * *', () => {
  const now = Math.floor(Date.now() / 1000);
  
  // Process one-time scheduled bumps
  for (let i = scheduledBumps.length - 1; i >= 0; i--) {
    const bump = scheduledBumps[i];
    if (now >= bump.scheduledTime) {
      bot.telegram.sendMessage(bump.chatId, 'bump');
      // Remove the bump from the array after sending
      scheduledBumps.splice(i, 1);
    }
  }
});

bot.launch({ dropPendingUpdates: true });
