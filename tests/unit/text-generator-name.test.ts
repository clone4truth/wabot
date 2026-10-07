import { describe, expect, it, vi } from 'vitest';
import { TextGenerator } from '../../src/stickers/generators/text.generator';

function result() {
  return {
    buffer: Buffer.from('webp'),
    mimetype: 'image/webp' as const,
    width: 512,
    height: 512,
    animated: false,
    size: 4,
  };
}

describe('TextGenerator display name', () => {
  it('bubble menggunakan nama kontak WAHA, bukan sender ID dari payload', async () => {
    const generator = new TextGenerator();
    const processBubble = vi.fn().mockResolvedValue(result());
    (generator as any).bubbleProcessor = { process: processBubble };

    const wahaClient = {
      getContactSavedName: vi.fn().mockResolvedValue('Budi Santoso'),
      getChatInfo: vi.fn().mockResolvedValue(null),
      getProfilePicture: vi.fn().mockResolvedValue(null),
    };

    await generator.process(
      {
        type: 'text',
        modifier: 'bubble',
        text: 'Halo',
        content: { senderId: '628123@lid', senderName: '628123' },
      },
      { chatId: 'group@g.us', senderId: '628123@lid', wahaClient: wahaClient as any },
    );

    expect(processBubble).toHaveBeenCalledWith(
      'Halo',
      'Budi Santoso',
      '628123@lid',
      undefined,
      null,
    );
  });

  it('quote memakai label netral saat API hanya mengembalikan ID', async () => {
    const generator = new TextGenerator();
    const processQuote = vi.fn().mockResolvedValue(result());
    (generator as any).quoteProcessor = { process: processQuote };

    const wahaClient = {
      getContactSavedName: vi.fn().mockResolvedValue(undefined),
      getChatInfo: vi.fn().mockResolvedValue({ name: '628123@lid' }),
    };

    await generator.process(
      {
        type: 'text',
        modifier: 'quote',
        text: 'Halo',
        content: { senderId: '628123@lid', senderName: '628123' },
      },
      { chatId: 'group@g.us', senderId: '628123@lid', wahaClient: wahaClient as any },
    );

    expect(processQuote).toHaveBeenCalledWith('Halo', 'Pengguna WhatsApp');
  });
});
