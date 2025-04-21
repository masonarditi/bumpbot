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

// Helper function to format time remaining
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (seconds < 604800) { // Less than a week
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(seconds / 604800);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
}

// Helper function to get proper unit form (singular/plural)
function getUnitForm(amount: number, unit: string): string {
  // Remove any trailing 's' to get the base form
  const baseUnit = unit.endsWith('s') ? unit.slice(0, -1) : unit;
  // Add 's' for plural if needed
  return amount === 1 ? baseUnit : `${baseUnit}s`;
}

// Welcome/About message
const welcomeMessage = `
👋 Hi there! I'm ${BOT_USERNAME}, a handy bot that helps you schedule bumps in your chats. 

🤖 I can schedule one-time bumps at specific intervals, helping you keep conversations active without manual intervention.

🧪 Try me out by saying something like "@${BOT_USERNAME} bump this in 30 minutes""

📝 Created by @createdbymason
🔗 Say what's up on <a href="https://x.com/createdbymason">X</a> or <a href="https://t.me/createdbymason">Telegram</a>

`;

// Help message
const helpMessage = `
Here's what I can do:
• @${BOT_USERNAME} hi - I'll say hello
• @${BOT_USERNAME} info/about - Learn about me
• @${BOT_USERNAME} bump this in [number] [unit] - I'll bump after the specified time
  (units: seconds, minutes, hours, days, weeks), e.g. "bump this in 30 minutes" or "bump this in 1 week"
• @${BOT_USERNAME} show queue - I'll show all scheduled bumps
• @${BOT_USERNAME} stop - I'll cancel all scheduled bumps
`;

// Handle new chat members (bot being added to a group)
bot.on('new_chat_members', (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const botAdded = newMembers.some(member => member.username === BOT_USERNAME);
  
  if (botAdded) {
    ctx.reply(welcomeMessage, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    } as any);
  }
});

bot.on('text', ctx => {
  const messageText = ctx.message.text.toLowerCase();
  const isBotMentioned = messageText.includes(`@${BOT_USERNAME}`.toLowerCase());
  
  // Welcome/About message triggers
  if ((messageText.includes(`@${BOT_USERNAME} hi`.toLowerCase()) && !messageText.includes('bump')) || 
      messageText.includes(`@${BOT_USERNAME} info`.toLowerCase()) || 
      messageText.includes(`@${BOT_USERNAME} about`.toLowerCase())) {
    ctx.reply(welcomeMessage, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    } as any);
    return;
  }

  // Help message
  if (messageText.includes(`@${BOT_USERNAME} help`.toLowerCase())) {
    ctx.reply(helpMessage);
    return;
  }

  // One-time bump after specified time
  const bumpCustomMatch = messageText.match(new RegExp(`@${BOT_USERNAME} bump this in (\\d+) (second|seconds|minute|minutes|hour|hours|day|days|week|weeks)`, 'i'));
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
    } else if (unit === 'week' || unit === 'weeks') {
      delaySeconds = amount * 7 * 24 * 60 * 60;
    }
    
    if (delaySeconds > 0) {
      const chatId = ctx.chat.id;
      const scheduledTime = Math.floor(Date.now() / 1000) + delaySeconds;
      
      scheduledBumps.push({
        chatId,
        scheduledTime
      });
      
      // Get the proper form of the unit (singular/plural)
      const properUnit = getUnitForm(amount, unit);
      ctx.reply(`✅ Bump scheduled in ${amount} ${properUnit}.`);
    }
    return;
  }

  // Show queue command
  if (messageText.includes(`@${BOT_USERNAME} show queue`.toLowerCase())) {
    const chatId = ctx.chat.id;
    const now = Math.floor(Date.now() / 1000);
    
    // Find all bumps for this chat
    const chatBumps = scheduledBumps.filter(bump => bump.chatId === chatId);
    
    if (chatBumps.length === 0) {
      ctx.reply('No bumps scheduled.');
      return;
    }
    
    // Sort by scheduled time
    chatBumps.sort((a, b) => a.scheduledTime - b.scheduledTime);
    
    // Format the response
    let response = `📋 Scheduled bumps (${chatBumps.length}):\n\n`;
    
    chatBumps.forEach((bump, index) => {
      const timeRemaining = bump.scheduledTime - now;
      response += `${index + 1}. Bump in ${formatTimeRemaining(timeRemaining)}\n`;
    });
    
    ctx.reply(response);
    return;
  }

  // Stop command
  if (messageText.includes(`@${BOT_USERNAME} stop`.toLowerCase())) {    
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
  
  // If the bot is mentioned but no valid command was recognized, show help
  if (isBotMentioned) {
    ctx.reply(helpMessage);
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
