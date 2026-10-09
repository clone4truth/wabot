import { normalizeMessageTimestamp } from './message-time';

interface CachedTimestamp {
  timestamp: number;
  expiresAt: number;
}

// Reply time should still work when the WAHA Chats API is unavailable. Keep a
// bounded, short-lived record of message times already delivered by webhooks.
const MAX_CACHED_MESSAGES = 20_000;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const timestamps = new Map<string, CachedTimestamp>();

function cacheKey(session: string | undefined, chatId: string, messageId: string): string {
  return JSON.stringify([session ?? '', chatId, messageId]);
}

export function rememberMessageTimestamp(
  session: string | undefined,
  chatId: string,
  messageId: string,
  value: unknown,
  now = Date.now(),
): void {
  const timestamp = normalizeMessageTimestamp(value);
  if (!chatId || !messageId || timestamp === undefined) return;

  const key = cacheKey(session, chatId, messageId);
  timestamps.delete(key);
  timestamps.set(key, { timestamp, expiresAt: now + MESSAGE_TTL_MS });

  while (timestamps.size > MAX_CACHED_MESSAGES) {
    const oldest = timestamps.keys().next();
    if (oldest.done) break;
    timestamps.delete(oldest.value);
  }
}

export function getRememberedMessageTimestamp(
  session: string | undefined,
  chatId: string,
  messageId: string,
  now = Date.now(),
): number | undefined {
  if (!chatId || !messageId) return undefined;
  const key = cacheKey(session, chatId, messageId);
  const entry = timestamps.get(key);
  if (!entry) return undefined;
  if (now >= entry.expiresAt) {
    timestamps.delete(key);
    return undefined;
  }

  // Keep frequently replied-to messages ahead of older entries without
  // extending the original timestamp's retention window.
  timestamps.delete(key);
  timestamps.set(key, entry);
  return entry.timestamp;
}
