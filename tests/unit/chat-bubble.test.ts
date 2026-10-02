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

async function inkBounds(buf: Buffer, onlyMainText = false) {
  const { data, info } = await Sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      const visible = data[offset + 3] >= 200;
      const white = data[offset] >= 225 && data[offset + 1] >= 225 && data[offset + 2] >= 225;
      if (visible && (!onlyMainText || white)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
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

  it('teks singkat tampil besar dan tetap berukuran 512 × 512', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'halo', time: '12:34' });
    const metadata = await Sharp(buf).metadata();
    const textBounds = await inkBounds(buf, true);
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(textBounds.height).toBeGreaterThanOrEqual(40);
    expect(textBounds.width).toBeGreaterThan(100);
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

  it('avatar tidak mempersempit kolom isi pesan', async () => {
    const avatar = await Sharp({
      create: { width: 100, height: 100, channels: 3, background: '#2878c8' },
    }).jpeg().toBuffer();
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: 'MMMMMMM', time: '12:34',
      avatar: { buffer: avatar, mimetype: 'image/jpeg' },
    });
    const textBounds = await inkBounds(buf, true);
    expect(textBounds.left).toBeLessThan(70);
    expect(textBounds.width).toBeGreaterThan(300);
  });

  it('nama, kutipan, dan glyph lebar tetap di dalam canvas tanpa overflow', async () => {
    const buf = await renderChatBubbleToBuffer({
      senderName: 'W'.repeat(100), senderId: '1', text: '界'.repeat(60), time: '12:34',
      quoted: { senderName: '界'.repeat(100), body: 'W'.repeat(140) },
    });
    const bounds = await inkBounds(buf);
    expect(bounds.left).toBeGreaterThanOrEqual(6);
    expect(bounds.right).toBeLessThanOrEqual(493);
    expect(bounds.top).toBeGreaterThanOrEqual(12);
    expect(bounds.bottom).toBeLessThanOrEqual(499);
    expect((await inkBounds(buf, true)).width).toBeGreaterThan(200);
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

  it('menolak teks kosong', async () => {
    await expect(renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: '   ',
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_INPUT' });
  });
});
