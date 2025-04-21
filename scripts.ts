import { Context } from 'telegraf';
import { chats, BOT_USERNAME, INTERVAL_SECONDS, lastBumpTSRef } from './bot';
export function handleText(ctx: Context) {
  if (!ctx.message || !ctx.chat) return;
  
  // Check if message has text property
  if (!('text' in ctx.message)) return;
  
  const text = ctx.message.text.toLowerCase().trim();

  // bump handler
  if (text.includes(`@${BOT_USERNAME} bump`)) {
    chats.add(ctx.chat.id);
    lastBumpTSRef.value = Math.floor(Date.now() / 1000);
    ctx.reply(`✅ Bump scheduled every ${INTERVAL_SECONDS} seconds.`);
  }

  // stop handler
  if (text.includes(`@${BOT_USERNAME} stop`)) {
    chats.delete(ctx.chat.id);
    ctx.reply('🛑 Bump stopped.');
    return;
  }

  // ← add more `if (text.includes(...)) { … }` blocks here later
}
