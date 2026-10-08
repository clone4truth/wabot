import { describe, expect, it, vi } from 'vitest';
import { TextGenerator } from '../../src/stickers/generators/text.generator';

function pipeline() {
  const generator = new TextGenerator();
  const render = vi.fn().mockResolvedValue({
    buffer: Buffer.from('webp'), mimetype: 'image/webp', width: 512, height: 512, animated: false, size: 4,
  });
  (generator as any).bubbleProcessor = { process: render };
  const wahaClient = {
    getContactSavedName: vi.fn().mockResolvedValue('Rara'),
    getChatInfo: vi.fn().mockResolvedValue({ picture: 'https://example.com/avatar.png' }),
    getProfilePicture: vi.fn().mockResolvedValue(null),
    fetchExternalImage: vi.fn().mockResolvedValue(null),
    getMessageTimestamp: vi.fn().mockResolvedValue(undefined),
  };
  const run = (content: Record<string, unknown>, isGroup?: boolean) => generator.process({
    type: 'text', modifier: 'bubble', text: 'Halo', content,
  }, { chatId: 'group@g.us', senderId: '111@c.us', isGroup, wahaClient: wahaClient as any });
  return { run, render, wahaClient };
}

describe('bubble direction from message authorship', () => {
  it('uses current text source as authority when sender metadata uses another ID format', async () => {
    const test = pipeline();
    await test.run({ senderId: '111@lid', timestampSource: 'current' });
    expect(test.render).toHaveBeenCalledWith('Halo', undefined, '111@lid', undefined, null, '--:--', 'outgoing', false);
    expect(test.wahaClient.getContactSavedName).not.toHaveBeenCalled();
    expect(test.wahaClient.getChatInfo).not.toHaveBeenCalled();
    expect(test.wahaClient.fetchExternalImage).not.toHaveBeenCalled();
    expect(test.wahaClient.getProfilePicture).not.toHaveBeenCalled();
  });

  it('looks up a quoted author even when the outer bubble is outgoing', async () => {
    const test = pipeline();
    await test.run({
      senderId: '111@c.us', timestampSource: 'current', quotedSenderId: '222@c.us', quotedBody: 'Besok jadi?',
    });
    expect(test.render).toHaveBeenCalledWith('Halo', undefined, '111@c.us', {
      senderName: 'Rara', senderId: '222@c.us', body: 'Besok jadi?',
    }, null, '--:--', 'outgoing', false);
    expect(test.wahaClient.getContactSavedName).toHaveBeenCalledTimes(1);
    expect(test.wahaClient.getContactSavedName).toHaveBeenCalledWith('222@c.us', undefined, expect.anything());
    expect(test.wahaClient.fetchExternalImage).not.toHaveBeenCalled();
    expect(test.wahaClient.getProfilePicture).not.toHaveBeenCalled();
  });

  it('retains quoted-author enrichment in a private incoming bubble without sender or avatar lookups', async () => {
    const test = pipeline();
    await test.run({
      senderId: '222@c.us', timestampSource: 'reply', quotedSenderId: '333@c.us', quotedBody: 'Besok jadi?',
    }, false);
    expect(test.render).toHaveBeenCalledWith('Halo', undefined, '222@c.us', {
      senderName: 'Rara', senderId: '333@c.us', body: 'Besok jadi?',
    }, null, '--:--', 'incoming', false);
    expect(test.wahaClient.getContactSavedName).toHaveBeenCalledTimes(1);
    expect(test.wahaClient.getContactSavedName).toHaveBeenCalledWith('333@c.us', undefined, expect.anything());
    expect(test.wahaClient.getChatInfo).toHaveBeenCalledTimes(1);
    expect(test.wahaClient.fetchExternalImage).not.toHaveBeenCalled();
    expect(test.wahaClient.getProfilePicture).not.toHaveBeenCalled();
  });
});
