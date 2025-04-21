import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();
const BOT_USERNAME = 'BumppBot';

// File paths for persistent storage
const STORAGE_DIR = path.join(process.cwd(), 'data');
const ONE_TIME_BUMPS_FILE = path.join(STORAGE_DIR, 'one_time_bumps.json');
const RECURRING_BUMPS_FILE = path.join(STORAGE_DIR, 'recurring_bumps.json');

// Create the data directory if it doesn't exist
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Track one-time scheduled bumps
interface ScheduledBump {
  chatId: number;
  scheduledTime: number; // timestamp in seconds
}
const scheduledBumps: ScheduledBump[] = [];

// Track recurring bumps
interface RecurringBump {
  chatId: number;
  intervalSeconds: number; // how often to bump
  nextBumpTime: number; // timestamp for next bump
  description: string; // human-readable description (e.g., "every 30 minutes")
}
const recurringBumps: RecurringBump[] = [];

// Helper function to save data to files
function saveData() {
  try {
    fs.writeFileSync(ONE_TIME_BUMPS_FILE, JSON.stringify(scheduledBumps));
    fs.writeFileSync(RECURRING_BUMPS_FILE, JSON.stringify(recurringBumps));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Helper function to load data from files
function loadData() {
  try {
    // Load one-time bumps
    if (fs.existsSync(ONE_TIME_BUMPS_FILE)) {
      const data = fs.readFileSync(ONE_TIME_BUMPS_FILE, 'utf8');
      const loadedBumps = JSON.parse(data) as ScheduledBump[];
      scheduledBumps.length = 0;
      scheduledBumps.push(...loadedBumps);
      console.log(`Loaded ${loadedBumps.length} one-time bumps from storage`);
    }
    
    // Load recurring bumps
    if (fs.existsSync(RECURRING_BUMPS_FILE)) {
      const data = fs.readFileSync(RECURRING_BUMPS_FILE, 'utf8');
      const loadedBumps = JSON.parse(data) as RecurringBump[];
      recurringBumps.length = 0;
      recurringBumps.push(...loadedBumps);
      console.log(`Loaded ${loadedBumps.length} recurring bumps from storage`);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Load data when the bot starts
loadData();

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

🤖 I can schedule both one-time and recurring bumps, helping you keep conversations active without manual intervention.

🧪 Try me out by saying:
• "@${BOT_USERNAME} bump this in 30 minutes" (one-time bump)
• "@${BOT_USERNAME} bump this every 2 hours" (recurring bump)

📝 Created by @createdbymason
🔗 Say what's up on <a href="https://x.com/createdbymason">X</a> or <a href="https://t.me/createdbymason">Telegram</a>

`;

// Help message
const helpMessage = `
Here's what I can do:
• @${BOT_USERNAME} info/about - Learn about me
• @${BOT_USERNAME} bump this in [number] [unit] - Schedule a one-time bump
• @${BOT_USERNAME} bump this every [number] [unit] - Schedule a recurring bump
  Examples: "bump this in 30 mins" or "bump this every an hour"
• @${BOT_USERNAME} show queue - Show all scheduled bumps
• @${BOT_USERNAME} stop - Cancel all scheduled bumps
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
  if (messageText.includes(`@${BOT_USERNAME} info`.toLowerCase()) || 
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
  const oneTimeBumpMatch = messageText.match(new RegExp(`@${BOT_USERNAME} bump this in (\\d+|a|an) (second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|day|days|week|weeks)`, 'i'));
  if (oneTimeBumpMatch) {
    let amount: number;
    
    // Handle "a" or "an" as 1
    if (oneTimeBumpMatch[1].toLowerCase() === 'a' || oneTimeBumpMatch[1].toLowerCase() === 'an') {
      amount = 1;
    } else {
      amount = parseInt(oneTimeBumpMatch[1]);
    }
    
    const unitRaw = oneTimeBumpMatch[2].toLowerCase();
    
    // Normalize units
    let unit = unitRaw;
    let delaySeconds = 0;
    
    // Convert abbreviated forms to full forms for processing
    if (unitRaw === 'sec' || unitRaw === 'secs' || unitRaw === 'second' || unitRaw === 'seconds') {
      delaySeconds = amount;
      unit = amount === 1 ? 'second' : 'seconds';
    } else if (unitRaw === 'min' || unitRaw === 'mins' || unitRaw === 'minute' || unitRaw === 'minutes') {
      delaySeconds = amount * 60;
      unit = amount === 1 ? 'minute' : 'minutes';
    } else if (unitRaw === 'hour' || unitRaw === 'hours') {
      delaySeconds = amount * 60 * 60;
      unit = amount === 1 ? 'hour' : 'hours';
    } else if (unitRaw === 'day' || unitRaw === 'days') {
      delaySeconds = amount * 24 * 60 * 60;
      unit = amount === 1 ? 'day' : 'days';
    } else if (unitRaw === 'week' || unitRaw === 'weeks') {
      delaySeconds = amount * 7 * 24 * 60 * 60;
      unit = amount === 1 ? 'week' : 'weeks';
    }
    
    if (delaySeconds > 0) {
      const chatId = ctx.chat.id;
      const scheduledTime = Math.floor(Date.now() / 1000) + delaySeconds;
      
      scheduledBumps.push({
        chatId,
        scheduledTime
      });
      
      saveData(); // Save to persistent storage
      
      ctx.reply(`✅ Bump scheduled in ${amount} ${unit}.`);
    }
    return;
  }

  // Recurring bump at specified interval
  const recurringBumpMatch = messageText.match(new RegExp(`@${BOT_USERNAME} bump this every (\\d+|a|an) (second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|day|days|week|weeks)`, 'i'));
  if (recurringBumpMatch) {
    let amount: number;
    
    // Handle "a" or "an" as 1
    if (recurringBumpMatch[1].toLowerCase() === 'a' || recurringBumpMatch[1].toLowerCase() === 'an') {
      amount = 1;
    } else {
      amount = parseInt(recurringBumpMatch[1]);
    }
    
    const unitRaw = recurringBumpMatch[2].toLowerCase();
    
    // Normalize units
    let unit = unitRaw;
    let intervalSeconds = 0;
    
    // Convert abbreviated forms to full forms for processing
    if (unitRaw === 'sec' || unitRaw === 'secs' || unitRaw === 'second' || unitRaw === 'seconds') {
      intervalSeconds = amount;
      unit = amount === 1 ? 'second' : 'seconds';
    } else if (unitRaw === 'min' || unitRaw === 'mins' || unitRaw === 'minute' || unitRaw === 'minutes') {
      intervalSeconds = amount * 60;
      unit = amount === 1 ? 'minute' : 'minutes';
    } else if (unitRaw === 'hour' || unitRaw === 'hours') {
      intervalSeconds = amount * 60 * 60;
      unit = amount === 1 ? 'hour' : 'hours';
    } else if (unitRaw === 'day' || unitRaw === 'days') {
      intervalSeconds = amount * 24 * 60 * 60;
      unit = amount === 1 ? 'day' : 'days';
    } else if (unitRaw === 'week' || unitRaw === 'weeks') {
      intervalSeconds = amount * 7 * 24 * 60 * 60;
      unit = amount === 1 ? 'week' : 'weeks';
    }
    
    if (intervalSeconds > 0) {
      const chatId = ctx.chat.id;
      const nextBumpTime = Math.floor(Date.now() / 1000) + intervalSeconds;
      
      // Add to recurring bumps
      recurringBumps.push({
        chatId,
        intervalSeconds,
        nextBumpTime,
        description: `every ${amount} ${unit}`
      });
      
      saveData(); // Save to persistent storage
      
      ctx.reply(`✅ Recurring bump scheduled every ${amount} ${unit}.`);
    }
    return;
  }

  // Show queue command
  if (messageText.includes(`@${BOT_USERNAME} show queue`.toLowerCase())) {
    const chatId = ctx.chat.id;
    const now = Math.floor(Date.now() / 1000);
    
    // Find all bumps for this chat
    const oneTimeBumps = scheduledBumps.filter(bump => bump.chatId === chatId);
    const chatRecurringBumps = recurringBumps.filter(bump => bump.chatId === chatId);
    
    if (oneTimeBumps.length === 0 && chatRecurringBumps.length === 0) {
      ctx.reply('No bumps scheduled.');
      return;
    }
    
    // Format the response
    let response = '';
    
    if (oneTimeBumps.length > 0) {
      // Sort by scheduled time
      oneTimeBumps.sort((a, b) => a.scheduledTime - b.scheduledTime);
      
      response += `📆 One-time bumps (${oneTimeBumps.length}):\n`;
      
      oneTimeBumps.forEach((bump, index) => {
        const timeRemaining = bump.scheduledTime - now;
        response += `${index + 1}. Bump in ${formatTimeRemaining(timeRemaining)}\n`;
      });
      
      if (chatRecurringBumps.length > 0) {
        response += '\n';
      }
    }
    
    if (chatRecurringBumps.length > 0) {
      response += `🔄 Recurring bumps (${chatRecurringBumps.length}):\n`;
      
      chatRecurringBumps.forEach((bump, index) => {
        const timeToNext = bump.nextBumpTime - now;
        response += `${index + 1}. Bump ${bump.description} (next in ${formatTimeRemaining(timeToNext)})\n`;
      });
    }
    
    ctx.reply(response);
    return;
  }

  // Stop command
  if (messageText.includes(`@${BOT_USERNAME} stop`.toLowerCase())) {    
    const chatId = ctx.chat.id;
    let bumpsStopped = 0;
    
    // Remove all one-time bumps for this chat
    for (let i = scheduledBumps.length - 1; i >= 0; i--) {
      if (scheduledBumps[i].chatId === chatId) {
        scheduledBumps.splice(i, 1);
        bumpsStopped++;
      }
    }
    
    // Remove all recurring bumps for this chat
    for (let i = recurringBumps.length - 1; i >= 0; i--) {
      if (recurringBumps[i].chatId === chatId) {
        recurringBumps.splice(i, 1);
        bumpsStopped++;
      }
    }
    
    saveData(); // Save to persistent storage
    
    ctx.reply(`🛑 Stopped ${bumpsStopped} bump${bumpsStopped !== 1 ? 's' : ''}.`);
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
  let dataChanged = false;
  
  // Process one-time scheduled bumps
  for (let i = scheduledBumps.length - 1; i >= 0; i--) {
    const bump = scheduledBumps[i];
    if (now >= bump.scheduledTime) {
      bot.telegram.sendMessage(bump.chatId, 'bump');
      scheduledBumps.splice(i, 1);
      dataChanged = true;
    }
  }
  
  // Process recurring bumps
  for (let i = 0; i < recurringBumps.length; i++) {
    const bump = recurringBumps[i];
    if (now >= bump.nextBumpTime) {
      bot.telegram.sendMessage(bump.chatId, 'bump');
      // Schedule next bump
      bump.nextBumpTime = now + bump.intervalSeconds;
      dataChanged = true;
    }
  }
  
  // Save data if anything changed
  if (dataChanged) {
    saveData();
  }
});

bot.launch({ dropPendingUpdates: true });
