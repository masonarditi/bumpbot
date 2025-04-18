import { Telegraf } from 'telegraf';
import cron from 'node-cron';
const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();
// …handlers + cron here
bot.launch();
