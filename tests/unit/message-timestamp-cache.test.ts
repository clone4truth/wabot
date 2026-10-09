import { describe, expect, it } from 'vitest';
import { getRememberedMessageTimestamp, rememberMessageTimestamp } from '../../src/whatsapp/message-timestamp-cache';

const timestamp = Date.parse('2026-10-08T06:19:00Z');

describe('original message timestamp cache', () => {
  it('matches a WEBJS bare reply id to a serialized group message id', () => {
    rememberMessageTimestamp('bot', 'group@g.us', 'false_group@g.us_STANZA_222@lid', timestamp / 1000, 1000);
    expect(getRememberedMessageTimestamp('bot', 'group@g.us', 'STANZA', 2000)).toBe(timestamp);
  });

  it('matches serialized and bare ids in either direction in a private chat', () => {
    rememberMessageTimestamp('bot', '123@c.us', 'PRIVATE', timestamp, 1000);
    expect(getRememberedMessageTimestamp('bot', '123@c.us', 'true_123@c.us_PRIVATE', 2000)).toBe(timestamp);
  });

  it('keeps matching ids isolated by session and chat', () => {
    rememberMessageTimestamp('session-a', 'chat-a@g.us', 'ISOLATED', timestamp, 1000);
    expect(getRememberedMessageTimestamp('session-b', 'chat-a@g.us', 'ISOLATED', 2000)).toBeUndefined();
    expect(getRememberedMessageTimestamp('session-a', 'chat-b@g.us', 'ISOLATED', 2000)).toBeUndefined();
  });

  it('expires after 24 hours even if the message was recently replied to', () => {
    rememberMessageTimestamp('bot', 'group@g.us', 'EXPIRING', timestamp, 1000);
    expect(getRememberedMessageTimestamp('bot', 'group@g.us', 'EXPIRING', 2000)).toBe(timestamp);
    expect(getRememberedMessageTimestamp('bot', 'group@g.us', 'EXPIRING', 1000 + 24 * 60 * 60 * 1000)).toBeUndefined();
  });
});
