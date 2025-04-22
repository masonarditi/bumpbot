import { Context } from 'telegraf';
import admin, { firestore } from 'firebase-admin';

// Initialize Firestore (assumes admin initialized in bot.ts)
const db = admin.firestore();
const oneTimeCol = db.collection('one_time_bumps');
const recurCol   = db.collection('recurring_bumps');

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

// Helper: format seconds to human string
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  if (seconds < 3600) return `${Math.floor(seconds/60)} minute${Math.floor(seconds/60)!==1?'s':''}`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)} hour${Math.floor(seconds/3600)!==1?'s':''}`;
  return `${Math.floor(seconds/86400)} day${Math.floor(seconds/86400)!==1?'s':''}`;
}

// Command handlers
export function handleInfo(ctx: Context, botUsername: string) {
  ctx.reply(welcomeMessage(botUsername), { parse_mode: 'HTML', disable_web_page_preview: true } as any);
}

export function handleHelp(ctx: Context, botUsername: string) {
  ctx.reply(helpMessage(botUsername));
}

export function handleOneTimeBump(
  ctx: Context,
  match: RegExpMatchArray,
  botUsername: string,
  scheduledBumps: { chatId: number; scheduledTime: number }[]
) {
  const amt = match[1].toLowerCase() === 'a' || match[1].toLowerCase() === 'an' ? 1 : parseInt(match[1], 10);
  const unitRaw = match[2].toLowerCase();
  let delay = 0;
  if (/^sec/.test(unitRaw)) delay = amt;
  else if (/^min/.test(unitRaw)) delay = amt * 60;
  else if (/^hour/.test(unitRaw)) delay = amt * 3600;
  else if (/^day/.test(unitRaw)) delay = amt * 86400;
  if (!delay) return;
  const chatId = ctx.chat?.id; if (!chatId) return;
  const scheduledTime = Math.floor(Date.now()/1000) + delay;
  scheduledBumps.push({ chatId, scheduledTime });
  ctx.reply(`✅ Bump scheduled in ${amt} ${unitRaw}${amt!==1?'s':''}.`);
}

export function handleRecurringBump(
  ctx: Context,
  match: RegExpMatchArray,
  botUsername: string,
  recurringBumps: { chatId: number; intervalSeconds: number; nextBumpTime: number; description: string }[]
) {
  const amt = match[1].toLowerCase() === 'a' || match[1].toLowerCase() === 'an' ? 1 : parseInt(match[1], 10);
  const unitRaw = match[2].toLowerCase();
  let interval = 0;
  if (/^sec/.test(unitRaw)) interval = amt;
  else if (/^min/.test(unitRaw)) interval = amt * 60;
  else if (/^hour/.test(unitRaw)) interval = amt * 3600;
  else if (/^day/.test(unitRaw)) interval = amt * 86400;
  if (!interval) return;
  const chatId = ctx.chat?.id; if (!chatId) return;
  const nextBumpTime = Math.floor(Date.now()/1000) + interval;
  recurringBumps.push({ chatId, intervalSeconds: interval, nextBumpTime, description: `every ${amt} ${unitRaw}${amt!==1?'s':''}` });
  ctx.reply(`✅ Recurring bump scheduled every ${amt} ${unitRaw}${amt!==1?'s':''}.`);
}

export async function handleShowQueue(ctx: Context) {
  const chatId = ctx.chat?.id; if (!chatId) return;
  const now = Math.floor(Date.now()/1000);
  const oneSnap = await oneTimeCol.where('chatId','==',chatId).get();
  const recSnap = await recurCol.where('chatId','==',chatId).get();
  if (oneSnap.empty && recSnap.empty) {
    ctx.reply('No bumps scheduled.');
    return;
  }
  let resp = '';
  if (!oneSnap.empty) {
    resp += `📆 One-time bumps (${oneSnap.size}):\n`;
    oneSnap.docs.forEach((d,i) => {
      const data = d.data() as {scheduledTime:number};
      resp += `${i+1}. In ${formatTimeRemaining(data.scheduledTime - now)}\n`;
    });
  }
  if (!recSnap.empty) {
    if (!oneSnap.empty) resp += '\n';
    resp += `🔄 Recurring bumps (${recSnap.size}):\n`;
    recSnap.docs.forEach((d,i) => {
      const data = d.data() as {intervalSeconds:number; nextBumpTime:number; description:string};
      resp += `${i+1}. ${data.description} (next in ${formatTimeRemaining(data.nextBumpTime - now)})\n`;
    });
  }
  ctx.reply(resp);
}

export function handleStop(
  ctx: Context,
  scheduledBumps: { chatId: number; scheduledTime: number }[],
  recurringBumps: { chatId: number; intervalSeconds: number; nextBumpTime: number; description: string }[]
) {
  const chatId = ctx.chat?.id; if (!chatId) return;
  // Remove both in-memory and in Firestore
  oneTimeCol.doc(chatId.toString()).delete().catch(console.error);
  recurCol.doc(chatId.toString()).delete().catch(console.error);
  // Clean in-memory arrays
  for (let i=scheduledBumps.length-1; i>=0; i--) if (scheduledBumps[i].chatId===chatId) scheduledBumps.splice(i,1);
  for (let i=recurringBumps.length-1; i>=0; i--) if (recurringBumps[i].chatId===chatId) recurringBumps.splice(i,1);
  ctx.reply(`🛑 Stopped all bumps in this chat.`);
}