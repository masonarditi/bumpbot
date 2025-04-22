import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';
import admin from 'firebase-admin';
import {
  handleInfo,
  handleHelp,
  handleOneTimeBump,
  handleRecurringBump,
  handleShowQueue,
  handleStop,
  welcomeMessage
} from './commands';

// --- Firebase setup ---
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
});
const db         = admin.firestore();
const oneTimeCol = db.collection('one_time_bumps');
const recurCol   = db.collection('recurring_bumps');

// --- Bot setup ---
const bot = new Telegraf(process.env.BOT_TOKEN!);
const BOT_USERNAME = 'BumppBot';

// In‑memory queues
export interface ScheduledBump   { chatId: number; scheduledTime: number; }
export interface RecurringBump   { chatId: number; intervalSeconds: number; nextBumpTime: number; description: string; }
const scheduledBumps: ScheduledBump[] = [];
const recurringBumps: RecurringBump[] = [];

// --- Rehydrate from Firestore on startup ---
;(async () => {
  try {
    const oneSnap = await oneTimeCol.get();
    oneSnap.docs.forEach(d => scheduledBumps.push(d.data() as ScheduledBump));
    console.log(`Loaded ${scheduledBumps.length} one‑time bumps from Firestore`);

    const recurSnap = await recurCol.get();
    recurSnap.docs.forEach(d => recurringBumps.push(d.data() as RecurringBump));
    console.log(`Loaded ${recurringBumps.length} recurring bumps from Firestore`);
  } catch (err) {
    console.error('Error rehydrating from Firestore:', err);
  }
})();

// --- Handlers ---
bot.on('new_chat_members', ctx => {
  if (ctx.message.new_chat_members.some(u => u.username === BOT_USERNAME)) {
    ctx.reply(welcomeMessage(BOT_USERNAME), { parse_mode: 'HTML', disable_web_page_preview: true } as any);
  }
});

bot.on('text', async ctx => {
  const msg = ctx.message.text.toLowerCase();

  if (msg.includes(`@${BOT_USERNAME} info`) || msg.includes(`@${BOT_USERNAME} about`)) {
    handleInfo(ctx, BOT_USERNAME); return;
  }
  if (msg.includes(`@${BOT_USERNAME} help`)) {
    handleHelp(ctx, BOT_USERNAME); return;
  }

  const oneMatch = msg.match(new RegExp(`@${BOT_USERNAME}\\s+bump this in (\\d+) (second|seconds|minute|minutes|hour|hours|day|days)`, 'i'));
  if (oneMatch) {
    handleOneTimeBump(ctx, oneMatch, BOT_USERNAME, scheduledBumps);
    const nt = scheduledBumps[scheduledBumps.length - 1];
    await oneTimeCol.doc(nt.chatId.toString()).set(nt);
    return;
  }

  const recMatch = msg.match(new RegExp(`@${BOT_USERNAME}\\s+bump this every (\\d+) (second|seconds|minute|minutes|hour|hours|day|days)`, 'i'));
  if (recMatch) {
    handleRecurringBump(ctx, recMatch, BOT_USERNAME, recurringBumps);
    const rb = recurringBumps[recurringBumps.length - 1];
    await recurCol.doc(rb.chatId.toString()).set(rb);
    return;
  }

  if (msg.includes(`@${BOT_USERNAME} show queue`)) {
    await handleShowQueue(ctx);
    return;
  }
  
  if (msg.includes(`@${BOT_USERNAME} stop`)) {
    handleStop(ctx, scheduledBumps, recurringBumps);
    await oneTimeCol.doc(ctx.chat.id.toString()).delete().catch(console.error);
    await recurCol.doc(ctx.chat.id.toString()).delete().catch(console.error);
    return;
  }
  if (msg.includes(`@${BOT_USERNAME}`)) {
    handleHelp(ctx, BOT_USERNAME);
  }
});

// --- Cron loop ---
cron.schedule('* * * * * *', async () => {
  const now = Math.floor(Date.now()/1000);

  // one‑time bumps
  for (let i = scheduledBumps.length - 1; i >= 0; i--) {
    const bump = scheduledBumps[i];
    if (now >= bump.scheduledTime) {
      await bot.telegram.sendMessage(bump.chatId, 'bump');
      await oneTimeCol.doc(bump.chatId.toString()).delete().catch(console.error);
      scheduledBumps.splice(i, 1);
    }
  }

  // recurring bumps
  for (const bump of recurringBumps) {
    if (now >= bump.nextBumpTime) {
      await bot.telegram.sendMessage(bump.chatId, 'bump');
      bump.nextBumpTime = now + bump.intervalSeconds;
      await recurCol.doc(bump.chatId.toString()).set(bump).catch(console.error);
    }
  }
});

bot.launch({ dropPendingUpdates: true });
