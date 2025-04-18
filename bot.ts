import { Telegraf } from 'telegraf';
import 'dotenv/config';
import cron from 'node-cron';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const chats = new Set<number>();

const BOT_USERNAME = 'BumppBot';
const INTERVAL_SECONDS = 10;

bot.on('text', ctx => {
  if (ctx.message.text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    ctx.reply(`Bump scheduled every ${INTERVAL_SECONDS} seconds.`);
  }
});

cron.schedule(`*/${INTERVAL_SECONDS} * * * * *`, () => {
  chats.forEach(id => bot.telegram.sendMessage(id, 'bump'));
});

bot.launch();
