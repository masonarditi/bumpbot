import { Context } from 'telegraf';
import { formatTimeRemaining, ScheduledBump, RecurringBump } from './bot';

// Message templates
export const welcomeMessage = (botUsername: string) => `
👋 Hi there! I'm ${botUsername}, a handy bot that helps you schedule bumps in your chats. 

🤖 I can schedule both one-time and recurring bumps, helping you keep conversations active without manual intervention.

🧪 Try me out by saying:
• "@${botUsername} bump this in 30 minutes" (one-time bump)
• "@${botUsername} bump this every 2 hours" (recurring bump)

📝 Created by @createdbymason
🔗 Say what's up on <a href="https://x.com/createdbymason">X</a> or <a href="https://t.me/createdbymason">Telegram</a>
`;

export const helpMessage = (botUsername: string) => `
Here's what I can do:
• @${botUsername} info/about - Learn about me
• @${botUsername} bump this in [number] [unit] - Schedule a one-time bump
• @${botUsername} bump this every [number] [unit] - Schedule a recurring bump
  Examples: "bump this in 30 mins" or "bump this every an hour"
• @${botUsername} show queue - Show all scheduled bumps
• @${botUsername} stop - Cancel all scheduled bumps
`;

// Helper function to convert time unit to seconds and normalize unit name
export function timeUnitToSeconds(amount: number, unitRaw: string): { seconds: number, normalizedUnit: string } {
  let seconds = 0;
  let normalizedUnit = '';
  
  if (unitRaw === 'sec' || unitRaw === 'secs' || unitRaw === 'second' || unitRaw === 'seconds') {
    seconds = amount;
    normalizedUnit = amount === 1 ? 'second' : 'seconds';
  } else if (unitRaw === 'min' || unitRaw === 'mins' || unitRaw === 'minute' || unitRaw === 'minutes') {
    seconds = amount * 60;
    normalizedUnit = amount === 1 ? 'minute' : 'minutes';
  } else if (unitRaw === 'hour' || unitRaw === 'hours') {
    seconds = amount * 60 * 60;
    normalizedUnit = amount === 1 ? 'hour' : 'hours';
  } else if (unitRaw === 'day' || unitRaw === 'days') {
    seconds = amount * 24 * 60 * 60;
    normalizedUnit = amount === 1 ? 'day' : 'days';
  } else if (unitRaw === 'week' || unitRaw === 'weeks') {
    seconds = amount * 7 * 24 * 60 * 60;
    normalizedUnit = amount === 1 ? 'week' : 'weeks';
  }
  
  return { seconds, normalizedUnit };
}

// Command handlers
export function handleInfo(ctx: Context, botUsername: string) {
  ctx.reply(welcomeMessage(botUsername), { 
    parse_mode: 'HTML',
    disable_web_page_preview: true 
  } as any);
}

export function handleHelp(ctx: Context, botUsername: string) {
  ctx.reply(helpMessage(botUsername));
}

export function handleOneTimeBump(
  ctx: Context, 
  match: RegExpMatchArray, 
  botUsername: string, 
  scheduledBumps: ScheduledBump[], 
  saveCallback: () => void
) {
  let amount: number;
  
  // Handle "a" or "an" as 1
  if (match[1].toLowerCase() === 'a' || match[1].toLowerCase() === 'an') {
    amount = 1;
  } else {
    amount = parseInt(match[1]);
  }
  
  const unitRaw = match[2].toLowerCase();
  const { seconds: delaySeconds, normalizedUnit: unit } = timeUnitToSeconds(amount, unitRaw);
  
  if (delaySeconds > 0) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    const scheduledTime = Math.floor(Date.now() / 1000) + delaySeconds;
    
    scheduledBumps.push({
      chatId,
      scheduledTime
    });
    
    saveCallback(); // Save to persistent storage
    
    ctx.reply(`✅ Bump scheduled in ${amount} ${unit}.`);
  }
}

export function handleRecurringBump(
  ctx: Context, 
  match: RegExpMatchArray, 
  botUsername: string, 
  recurringBumps: RecurringBump[], 
  saveCallback: () => void
) {
  let amount: number;
  
  // Handle "a" or "an" as 1
  if (match[1].toLowerCase() === 'a' || match[1].toLowerCase() === 'an') {
    amount = 1;
  } else {
    amount = parseInt(match[1]);
  }
  
  const unitRaw = match[2].toLowerCase();
  const { seconds: intervalSeconds, normalizedUnit: unit } = timeUnitToSeconds(amount, unitRaw);
  
  if (intervalSeconds > 0) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    const nextBumpTime = Math.floor(Date.now() / 1000) + intervalSeconds;
    
    // Add to recurring bumps
    recurringBumps.push({
      chatId,
      intervalSeconds,
      nextBumpTime,
      description: `every ${amount} ${unit}`
    });
    
    saveCallback(); // Save to persistent storage
    
    ctx.reply(`✅ Recurring bump scheduled every ${amount} ${unit}.`);
  }
}

export function handleShowQueue(
  ctx: Context, 
  scheduledBumps: ScheduledBump[], 
  recurringBumps: RecurringBump[]
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
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
}

export function handleStop(
  ctx: Context, 
  scheduledBumps: ScheduledBump[], 
  recurringBumps: RecurringBump[],
  saveCallback: () => void
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
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
  
  saveCallback(); // Save to persistent storage
  
  ctx.reply(`🛑 Stopped ${bumpsStopped} bump${bumpsStopped !== 1 ? 's' : ''}.`);
}