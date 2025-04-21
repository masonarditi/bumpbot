import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { 
  handleInfo, 
  handleHelp, 
  handleOneTimeBump, 
  handleRecurringBump, 
  handleShowQueue, 
  handleStop,
  welcomeMessage
} from './commands';

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
export interface ScheduledBump {
  chatId: number;
  scheduledTime: number; // timestamp in seconds
}
const scheduledBumps: ScheduledBump[] = [];

// Track recurring bumps
export interface RecurringBump {
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
export function formatTimeRemaining(seconds: number): string {
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

// Handle new chat members (bot being added to a group)
bot.on('new_chat_members', (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const botAdded = newMembers.some(member => member.username === BOT_USERNAME);
  
  if (botAdded) {
    ctx.reply(welcomeMessage(BOT_USERNAME), { 
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
    handleInfo(ctx, BOT_USERNAME);
    return;
  }

  // Help message
  if (messageText.includes(`@${BOT_USERNAME} help`.toLowerCase())) {
    handleHelp(ctx, BOT_USERNAME);
    return;
  }

  // One-time bump after specified time
  const oneTimeBumpMatch = messageText.match(new RegExp(`@${BOT_USERNAME} bump this in (\\d+|a|an) (second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|day|days|week|weeks)`, 'i'));
  if (oneTimeBumpMatch) {
    handleOneTimeBump(ctx, oneTimeBumpMatch, BOT_USERNAME, scheduledBumps, saveData);
    return;
  }

  // Recurring bump at specified interval
  const recurringBumpMatch = messageText.match(new RegExp(`@${BOT_USERNAME} bump this every (\\d+|a|an) (second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|day|days|week|weeks)`, 'i'));
  if (recurringBumpMatch) {
    handleRecurringBump(ctx, recurringBumpMatch, BOT_USERNAME, recurringBumps, saveData);
    return;
  }

  // Show queue command
  if (messageText.includes(`@${BOT_USERNAME} show queue`.toLowerCase())) {
    handleShowQueue(ctx, scheduledBumps, recurringBumps);
    return;
  }

  // Stop command
  if (messageText.includes(`@${BOT_USERNAME} stop`.toLowerCase())) {    
    handleStop(ctx, scheduledBumps, recurringBumps, saveData);
    return;
  }
  
  // If the bot is mentioned but no valid command was recognized, show help
  if (isBotMentioned) {
    handleHelp(ctx, BOT_USERNAME);
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