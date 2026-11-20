// Lark / Feishu custom bots and Telegram bots: the small pieces the webhook flavours need.
import { fetchOf, type Deps } from '../../context';

/** Lark's custom-bot signature: base64(HMAC-SHA256 with key "<seconds>\n<secret>" over an empty message). */
export async function larkSign(secret: string, seconds: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${seconds}\n${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(0)));
  return btoa(String.fromCharCode(...mac));
}

/** A Telegram bot token as @BotFather gives it: digits, a colon, 30-odd letters. */
export const TELEGRAM_TOKEN = /^\d{3,}:[\w-]{20,}$/;
/** Telegram's send-message address for a bot token. */
export const telegramUrl = (token: string) => `https://api.telegram.org/bot${token}/sendMessage`;

/**
 * The group or channel the bot was last added to or written in, from the bot's recent updates, so nobody has to
 * look up a chat id. Returns null when the bot has seen no group yet (add it, write one message, try again).
 */
export async function telegramChat(deps: Deps, token: string): Promise<{ id: string; title: string } | 'token' | null> {
  const base = `https://api.telegram.org/bot${token}`;
  const me = await fetchOf(deps)(`${base}/getMe`);
  if (me.status === 401 || me.status === 404) return 'token';
  const res = await fetchOf(deps)(`${base}/getUpdates?allowed_updates=${encodeURIComponent('["message","channel_post","my_chat_member"]')}`);
  const j: any = await res.json().catch(() => null);
  if (!j?.ok || !Array.isArray(j.result)) return null;
  for (const u of [...j.result].reverse()) {
    const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (chat && chat.type !== 'private') return { id: String(chat.id), title: String(chat.title ?? chat.username ?? chat.id).slice(0, 120) };
  }
  return null;
}
