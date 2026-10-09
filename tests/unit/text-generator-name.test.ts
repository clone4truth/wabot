import { describe, expect, it, vi } from 'vitest';
import { TextGenerator } from '../../src/stickers/generators/text.generator';
import { contactAliases } from '../../src/whatsapp/contact-aliases';

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
  it('uses the requester’s own alias for a group bubble, keeping author, avatar and original time', async () => {
    contactAliases.set('andi@lid', 'rara@lid', 'Kak Rara', 'personal-name');
    contactAliases.set('budi@lid', 'rara@lid', 'Rara Kantor', 'personal-name');
    const generator = new TextGenerator();
    const render = vi.fn().mockResolvedValue(result());
    (generator as any).bubbleProcessor = { process: render };
    const avatar = { buffer: Buffer.from('avatar'), mimetype: 'image/png' };
    const wahaClient = {
      getContactSavedName: vi.fn().mockResolvedValue('Nama dari bot'),
      getChatInfo: vi.fn().mockResolvedValue(null),
      getProfilePicture: vi.fn().mockResolvedValue(avatar),
    };
    const input = {
      type: 'text', modifier: 'bubble', text: 'Halo',
      content: { senderId: 'rara@lid', timestampSource: 'reply', timestamp: Date.parse('2026-10-08T06:19:00Z') },
    };
    for (const requester of ['andi@lid', 'budi@lid', 'other@lid']) {
      await generator.process(input, { chatId: 'group@g.us', senderId: requester, session: 'personal-name', isGroup: true, wahaClient: wahaClient as any });
    }
    expect(render.mock.calls.map((call) => call[1])).toEqual(['Kak Rara', 'Rara Kantor', 'Nama dari bot']);
    for (const call of render.mock.calls) {
      expect(call[2]).toBe('rara@lid');
      expect(call[4]).toBe(avatar);
      expect(call[6]).toBe('incoming');
    }
  });

  it('uses personal aliases for quoted names inside an outgoing bubble and for quote stickers', async () => {
    contactAliases.set('caller@lid', 'target@lid', 'Kak Rara', 'quoted-alias');
    const generator = new TextGenerator();
    const bubble = vi.fn().mockResolvedValue(result());
    const quote = vi.fn().mockResolvedValue(result());
    (generator as any).bubbleProcessor = { process: bubble };
    (generator as any).quoteProcessor = { process: quote };
    const context = {
      chatId: 'group@g.us', senderId: 'caller@lid', session: 'quoted-alias', isGroup: true,
      wahaClient: { getContactSavedName: vi.fn().mockResolvedValue('Nama bot'), getChatInfo: vi.fn().mockResolvedValue(null) } as any,
    };
    await generator.process({ type: 'text', modifier: 'bubble', text: 'Setuju', content: {
      senderId: 'caller@lid', timestampSource: 'current', quotedSenderId: 'target@lid', quotedBody: 'Besok jadi?',
    } }, context);
    expect(bubble.mock.calls[0][1]).toBeUndefined();
    expect(bubble.mock.calls[0][3]).toEqual({ senderName: 'Kak Rara', senderId: 'target@lid', body: 'Besok jadi?' });
    await generator.process({ type: 'text', modifier: 'quote', text: 'Halo', content: { senderId: 'target@lid' } }, context);
    expect(quote).toHaveBeenCalledWith('Halo', 'Kak Rara');
  });

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
      { chatId: 'group@g.us', senderId: 'requester@lid', wahaClient: wahaClient as any },
    );

    expect(processBubble).toHaveBeenCalledWith(
      'Halo',
      'Budi Santoso',
      '628123@lid',
      undefined,
      null,
      '--:--',
      'incoming',
      true,
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
