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

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
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

  it('!ttp -> webp gradien ber-EXIF', async () => {
    const result = await service.process({ command: '!ttp', args: 'halo dunia', ...base });
    expect(result?.mimetype).toBe('image/webp');
    expect(result!.buffer.slice(0, 4).toString()).toBe('RIFF');
    expect(result!.buffer.toString('binary')).toContain('sticker-pack-id');
  });

  it('modifier quote -> gaya kutipan', async () => {
    const result = await service.process({ command: '!stiker', args: 'kata bijak', modifier: 'quote', ...base });
    expect(result?.mimetype).toBe('image/webp');
  });

  it('modifier meme + foto -> meme atas|bawah', async () => {
    const Sharp = (await import('sharp')).default;
    const fs = (await import('fs')).default;
    const jpgPath = '/tmp/test_meme_src.jpg';
    const jpg = await Sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 30, g: 60, b: 200 } } }).jpeg().toBuffer();
    fs.writeFileSync(jpgPath, jpg);
    dlMock.downloadMedia.mockResolvedValue({ filePath: jpgPath, mimeType: 'image/jpeg', size: jpg.length });
    const result = await service.process({
      command: '!stiker', args: 'ATAS | BAWAH', modifier: 'meme',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } }, ...base,
    });
    expect(result?.mimetype).toBe('image/webp');
    if (fs.existsSync(jpgPath)) fs.unlinkSync(jpgPath);
  });

  it('default text -> plain processor (bukan bubble ber-nama)', async () => {
    const plain = await service.process({ command: '!stiker', args: 'halo dunia', ...base });
    const bubble = await service.process({ command: '!stiker', args: 'halo dunia', modifier: 'bubble', ...base });
    const quote = await service.process({ command: '!stiker', args: 'halo dunia', modifier: 'quote', ...base });
    expect(plain?.mimetype).toBe('image/webp');
    // Tiga pipeline berbeda -> tiga output berbeda.
    expect(plain!.buffer.equals(bubble!.buffer)).toBe(false);
    expect(plain!.buffer.equals(quote!.buffer)).toBe(false);
    expect(bubble!.buffer.equals(quote!.buffer)).toBe(false);
  });

  it('video kedua saat slot penuh -> VIDEO_BUSY', async () => {
    const { PerUserConcurrency } = await import('../../src/stickers/concurrency');
    const limited = new StickerService(new PerUserConcurrency(1));
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    dlMock.downloadMedia.mockImplementationOnce(() => gate.then(() => ({
      filePath: '/tmp/tidak-ada.mp4', mimeType: 'video/mp4', size: 1,
    })));
    const videoMsg = {
      command: '!stiker', args: '',
      reply: { media: { url: 'http://x/v.mp4', mimetype: 'video/mp4' } }, ...base,
    };
    const first = limited.process(videoMsg);
    await new Promise((r) => setTimeout(r, 20));
    await expect(limited.process(videoMsg)).rejects.toMatchObject({ code: ErrorCode.VIDEO_BUSY });
    release();
    await first.catch(() => {});
  });
});
