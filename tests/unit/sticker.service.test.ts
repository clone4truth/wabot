import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StickerService } from '../../src/stickers/sticker.service';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';

// Mock WAHA agar tidak ada panggilan jaringan: nama + tanpa avatar.
vi.mock('../../src/whatsapp/waha.client', () => ({
  WAHAClient: vi.fn().mockImplementation(() => ({
    getChatInfo: vi.fn().mockResolvedValue({ name: 'Nama Mock', picture: undefined }),
    getContactSavedName: vi.fn().mockResolvedValue('Nama Mock'),
    getProfilePicture: vi.fn().mockResolvedValue(null),
    sendText: vi.fn().mockResolvedValue(undefined),
    sendImage: vi.fn().mockResolvedValue(undefined),
    sendSticker: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('StickerService dispatcher', () => {
  let service: StickerService;

  beforeEach(() => {
    service = new StickerService();
  });

  const base = { chatId: 'c', senderId: 's', senderName: 'S', isGroup: false };

  it('teks langsung -> webp bubble (render asli, tanpa jaringan)', async () => {
    const result = await service.process({ command: '!stiker', args: 'halo & <dunia>', ...base });
    expect(result?.mimetype).toBe('image/webp');
    expect(result!.buffer.slice(0, 4).toString()).toBe('RIFF');
  });

  it('reply + args -> quoted masuk konten', async () => {
    const result = await service.process({
      command: '!stiker', args: 'setuju',
      reply: { body: 'besok jadi?', senderId: 'q', senderName: 'Q' }, ...base,
    });
    expect(result?.mimetype).toBe('image/webp');
  });

  it('command tak dikenal -> UNSUPPORTED_INPUT', async () => {
    await expect(service.process({ command: '!ping', args: '', ...base })).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_INPUT,
    });
  });

  it('!toimg tanpa media -> MEDIA_NOT_AVAILABLE', async () => {
    await expect(service.process({ command: '!toimg', args: '', ...base })).rejects.toMatchObject({
      code: ErrorCode.MEDIA_NOT_AVAILABLE,
    });
  });

  it('teks kepanjangan -> TEXT_TOO_LONG', async () => {
    await expect(
      service.process({ command: '!stiker', args: 'x'.repeat(301), ...base }),
    ).rejects.toMatchObject({ code: ErrorCode.TEXT_TOO_LONG });
  });
});
