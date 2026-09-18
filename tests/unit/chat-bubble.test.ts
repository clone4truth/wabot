import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import {
  renderChatBubbleToBuffer,
  senderColor,
} from '../../src/stickers/rendering/chat-bubble';
import { escapePangoMarkup } from '../../src/stickers/rendering/text-layout';

function isWebp(buf: Buffer): boolean {
  return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
}

describe('Chat bubble renderer', () => {
  it('warna nama deterministik per pengirim', () => {
    expect(senderColor('111@lid')).toBe(senderColor('111@lid'));
    expect(senderColor('111@lid')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('escape karakter markup XML', () => {
    expect(escapePangoMarkup('a & b <3> "x"')).toBe('a &amp; b &lt;3&gt; "x"');
    expect(escapePangoMarkup(undefined as any)).toBe('');
  });

  it('render bubble polos jadi webp valid', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'halo' });
    expect(isWebp(buf)).toBe(true);
  });

  it('render teks berbahaya (&,<,>) tanpa error invalid markup', async () => {
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: 'a & b <3> tom & jerry',
      quoted: { senderName: 'Ani', body: 'x < y & z' },
    });
    expect(isWebp(buf)).toBe(true);
  });

  it('render dengan avatar lingkaran', async () => {
    const avatar = await Sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 120, b: 200 } },
    }).jpeg().toBuffer();
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: 'halo',
      avatar: { buffer: avatar, mimetype: 'image/jpeg' },
    });
    expect(isWebp(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('mendukung teks 300 karakter secara adaptif', async () => {
    const text300 = 'pesan penting '.repeat(22).trim().slice(0, 300);
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi',
      senderId: '1',
      text: text300,
    });
    expect(isWebp(buf)).toBe(true);
  });

  it('mendukung kata unbroken panjang 250 karakter tanpa silent truncation', async () => {
    const unbroken = 'a'.repeat(250);
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi',
      senderId: '1',
      text: unbroken,
    });
    expect(isWebp(buf)).toBe(true);
  });

  it('menolak teks yang mustahil muat dengan TEXT_TOO_LONG', async () => {
    const hugeText = 'kata '.repeat(1000);
    await expect(
      renderChatBubbleToBuffer({
        senderName: 'Budi',
        senderId: '1',
        text: hugeText,
      }),
    ).rejects.toMatchObject({ code: 'TEXT_TOO_LONG' });
  });
});

