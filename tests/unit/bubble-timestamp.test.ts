import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStikerHandler } from '../../src/commands/stiker.handler';
import { parseCommand } from '../../src/commands/parser';
import { StickerService } from '../../src/stickers/sticker.service';
import { TextGenerator } from '../../src/stickers/generators/text.generator';
import { GeneratorRegistry } from '../../src/stickers/generators/registry';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { MessageNormalizer } from '../../src/whatsapp/message.normalizer';

const commandTime = Date.parse('2026-10-08T06:19:00Z') / 1000;
const originalTime = Date.parse('2026-10-07T05:45:00Z') / 1000;
const originalId = 'false_222@c.us_quoted';

function pipeline() {
  const generator = new TextGenerator();
  const processBubble = vi.fn().mockResolvedValue({
    buffer: Buffer.from('png'), mimetype: 'image/png', width: 512, height: 512, animated: false, size: 3,
  });
  (generator as any).bubbleProcessor = { process: processBubble };
  const waha = {
    getContactSavedName: vi.fn().mockResolvedValue(undefined),
    getChatInfo: vi.fn().mockResolvedValue(null),
    getProfilePicture: vi.fn().mockResolvedValue(null),
    getMessageTimestamp: vi.fn().mockResolvedValue(undefined),
  };
  const registry = new GeneratorRegistry();
  registry.register(generator);
  const service = new StickerService(undefined, registry, new JobManager({ image: 1 }), waha as any);
  const handler = createStikerHandler(service);
  return {
    processBubble, waha,
    run: async (body: string, replyTo?: Record<string, unknown>, messageFields?: Record<string, unknown>) => {
      const message = new MessageNormalizer().normalize({
        event: 'message', session: 'quoted-session',
        payload: {
          id: 'false_111@c.us_command', timestamp: commandTime, body,
          from: 'group@g.us', participant: '111@c.us', notifyName: 'Budi',
          ...(replyTo ? { replyTo: { id: originalId, body: 'Pesan lama', participant: '222@c.us', senderName: 'Rara', ...replyTo } } : {}),
          ...messageFields,
        },
      });
      return handler(parseCommand(body)!, message);
    },
  };
}

beforeEach(() => vi.stubEnv('TZ', 'Asia/Jakarta'));
afterEach(() => vi.unstubAllEnvs());

describe('bubble timestamp from webhook through command and sticker pipeline', () => {
  it('uses the original reply time and sender for a copied reply', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', { timestamp: originalTime });
    expect(test.processBubble).toHaveBeenCalledWith('Pesan lama', 'Rara', '222@c.us', undefined, null, '12:45', 'incoming', true);
    expect(test.waha.getMessageTimestamp).not.toHaveBeenCalled();
  });

  it('uses the current message time and sender for direct text even when it quotes a reply', async () => {
    const test = pipeline();
    await test.run('!stiker bubble Setuju', { timestamp: originalTime });
    expect(test.processBubble).toHaveBeenCalledWith('Setuju', undefined, '111@c.us', {
      senderName: 'Rara', senderId: '222@c.us', body: 'Pesan lama',
    }, null, '13:19', 'outgoing', false);
    expect(test.waha.getMessageTimestamp).not.toHaveBeenCalled();
    expect(test.waha.getContactSavedName).toHaveBeenCalledTimes(1);
    expect(test.waha.getContactSavedName).toHaveBeenCalledWith('222@c.us', 'quoted-session', expect.anything());
    expect(test.waha.getProfilePicture).not.toHaveBeenCalled();
  });

  it('renders direct command text as outgoing without sender metadata or avatar lookups', async () => {
    const test = pipeline();
    await test.run('!stiker bubble Halo');
    expect(test.processBubble).toHaveBeenCalledWith('Halo', undefined, '111@c.us', undefined, null, '13:19', 'outgoing', false);
    expect(test.waha.getContactSavedName).not.toHaveBeenCalled();
    expect(test.waha.getChatInfo).not.toHaveBeenCalled();
    expect(test.waha.getProfilePicture).not.toHaveBeenCalled();
  });

  it('renders a copied message by the requester as outgoing while keeping its original time', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', { participant: '111@c.us', senderName: 'Budi', timestamp: originalTime });
    expect(test.processBubble).toHaveBeenCalledWith('Pesan lama', undefined, '111@c.us', undefined, null, '12:45', 'outgoing', false);
    expect(test.waha.getContactSavedName).not.toHaveBeenCalled();
    expect(test.waha.getProfilePicture).not.toHaveBeenCalled();
  });

  it('renders a bot-authored quoted message as incoming from the requester viewpoint', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', {
      id: 'true_111@c.us_bot-message', participant: undefined, senderName: undefined, timestamp: originalTime,
    }, { from: '111@c.us', participant: undefined, to: 'bot@c.us' });
    expect(test.processBubble.mock.calls[0][2]).toBe('bot@c.us');
    expect(test.processBubble.mock.calls[0][6]).toBe('incoming');
    expect(test.processBubble.mock.calls[0][7]).toBe(false);
    expect(test.waha.getContactSavedName).not.toHaveBeenCalled();
  });

  it('renders an incoming private-chat message without a sender header or avatar', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', { timestamp: originalTime }, {
      from: '111@c.us', participant: undefined, to: 'bot@c.us',
    });
    expect(test.processBubble).toHaveBeenCalledWith('Pesan lama', undefined, '222@c.us', undefined, null, '12:45', 'incoming', false);
    expect(test.waha.getContactSavedName).not.toHaveBeenCalled();
    expect(test.waha.getChatInfo).not.toHaveBeenCalled();
    expect(test.waha.getProfilePicture).not.toHaveBeenCalled();
  });

  it('keeps the sender header and avatar for an incoming group message', async () => {
    const test = pipeline();
    const avatar = { buffer: Buffer.from('avatar'), mimetype: 'image/png' };
    test.waha.getContactSavedName.mockResolvedValue('Rara dari kontak' as any);
    test.waha.getProfilePicture.mockResolvedValue(avatar as any);
    await test.run('!stiker bubble', { timestamp: originalTime });
    expect(test.processBubble).toHaveBeenCalledWith('Pesan lama', 'Rara dari kontak', '222@c.us', undefined, avatar, '12:45', 'incoming', true);
    expect(test.waha.getProfilePicture).toHaveBeenCalledWith('222@c.us', 'quoted-session', expect.anything());
  });

  it('does not equate c.us and lid authors without an identity mapping', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', { participant: '111@lid', timestamp: originalTime });
    expect(test.processBubble.mock.calls[0][6]).toBe('incoming');
  });

  it('keeps an unknown group reply incoming without borrowing the requester identity', async () => {
    const test = pipeline();
    await test.run('!stiker bubble', { participant: undefined, senderName: 'Rara', timestamp: originalTime });
    expect(test.processBubble).toHaveBeenCalledWith('Pesan lama', 'Rara', undefined, undefined, null, '12:45', 'incoming', true);
    expect(test.waha.getContactSavedName).not.toHaveBeenCalled();
    expect(test.waha.getProfilePicture).not.toHaveBeenCalled();
  });

  it('looks up the original message with its id, chat, and webhook session when reply time is absent', async () => {
    const test = pipeline();
    test.waha.getMessageTimestamp.mockResolvedValue(originalTime as any);
    await test.run('!stiker bubble', {});
    expect(test.waha.getMessageTimestamp).toHaveBeenCalledWith('group@g.us', originalId, 'quoted-session', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(test.processBubble.mock.calls[0][5]).toBe('12:45');
  });

  it.each([undefined, NaN])('shows --:-- if lookup returns unavailable original time %s', async (value) => {
    const test = pipeline();
    test.waha.getMessageTimestamp.mockResolvedValue(value as any);
    await test.run('!stiker bubble', {});
    expect(test.processBubble.mock.calls[0][5]).toBe('--:--');
  });

  it('keeps missing time unknown on a failed lookup', async () => {
    const test = pipeline();
    test.waha.getMessageTimestamp.mockRejectedValue(new Error('message unavailable'));
    await test.run('!stiker bubble', {});
    expect(test.processBubble.mock.calls[0][5]).toBe('--:--');
  });
});
