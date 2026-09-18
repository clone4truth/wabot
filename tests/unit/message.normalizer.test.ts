import { describe, it, expect } from 'vitest';
import { MessageNormalizer } from '../../src/whatsapp/message.normalizer';

// Struktur payload mengikuti docs resmi WAHA (message event + replyTo.participant).
function basePayload(overrides: any = {}) {
  return {
    event: 'message',
    session: 'bot',
    payload: {
      id: 'false_111@lid_AAA',
      timestamp: 1700000000000,
      from: '111@lid',
      to: '6285@c.us',
      body: '!ping',
      hasMedia: false,
      ...overrides,
    },
  };
}

describe('MessageNormalizer', () => {
  const normalizer = new MessageNormalizer();

  it('DM: sender dari from + nama dari notifyName', () => {
    const msg = normalizer.normalize(basePayload({ notifyName: 'Budi' }) as any);
    expect(msg.chatId).toBe('111@lid');
    expect(msg.senderId).toBe('111@lid');
    expect(msg.senderName).toBe('Budi');
    expect(msg.isGroup).toBe(false);
    expect(msg.eventId).toBe('bot_false_111@lid_AAA');
  });

  it('DM tanpa notifyName: nama fallback ke ID', () => {
    const msg = normalizer.normalize(basePayload() as any);
    expect(msg.senderName).toBe('111');
  });

  it('Grup: sender dari participant, chat tetap ID grup', () => {
    const msg = normalizer.normalize(
      basePayload({ from: '999@g.us', participant: '111@lid', notifyName: 'Budi' }) as any,
    );
    expect(msg.chatId).toBe('999@g.us');
    expect(msg.senderId).toBe('111@lid');
    expect(msg.senderName).toBe('Budi');
    expect(msg.isGroup).toBe(true);
  });

  it('Reply: pengirim quote dari replyTo.participant (field resmi docs)', () => {
    const msg = normalizer.normalize(
      basePayload({ replyTo: { id: 'false_222@c.us_x', participant: '222@c.us', body: 'halo' } }) as any,
    );
    expect(msg.reply?.senderId).toBe('222@c.us');
    expect(msg.reply?.senderName).toBe('222');
    expect(msg.reply?.body).toBe('halo');
  });

  it('Reply prefix false_ tanpa participant: quote milik lawan chat', () => {
    const msg = normalizer.normalize(
      basePayload({ notifyName: 'Budi', replyTo: { id: 'false_111@lid_x', body: 'halo' } }) as any,
    );
    expect(msg.reply?.senderId).toBe('111@lid');
    expect(msg.reply?.senderName).toBe('Budi');
  });

  it('Reply prefix true_ tanpa participant: quote milik bot sendiri', () => {
    const msg = normalizer.normalize(
      basePayload({ replyTo: { id: 'true_6285@c.us_x', body: 'hi' } }) as any,
    );
    expect(msg.reply?.senderId).toBe('6285@c.us');
    expect(msg.reply?.senderName).toBe('6285');
  });

  it('Reply tak dikenal: nama "?" bukan nama ngawur', () => {
    const msg = normalizer.normalize(
      basePayload({ from: '999@g.us', replyTo: { id: 'xyz', body: 'halo' } }) as any,
    );
    expect(msg.reply?.senderName).toBe('?');
  });

  it('fromMe dari payload diteruskan (anti self-loop)', () => {
    const mine = normalizer.normalize(basePayload({ fromMe: true, body: '!stiker x' }) as any);
    expect(mine.fromMe).toBe(true);
    const other = normalizer.normalize(basePayload({ fromMe: false }) as any);
    expect(other.fromMe).toBe(false);
    const missing = normalizer.normalize(basePayload() as any);
    expect(missing.fromMe).toBe(false);
  });

  it('shouldIgnore: abaikan non-command, terima command', () => {
    const plain = normalizer.normalize(basePayload({ body: 'halo' }) as any);
    expect(normalizer.shouldIgnore(plain)).toBe(true);
    const cmd = normalizer.normalize(basePayload({ body: '!stiker x' }) as any);
    expect(normalizer.shouldIgnore(cmd)).toBe(false);
  });
});
