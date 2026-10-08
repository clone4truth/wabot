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

  it('mempertahankan warna asli emoji pada isi bubble', async () => {
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: 'kocak 😷', time: '12:34',
    });
    const { data, info } = await Sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let yellowEmojiPixels = 0;
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const offset = (y * 512 + x) * info.channels;
        if (data[offset] > 170 && data[offset + 1] > 110 && data[offset + 2] < 100 && data[offset + 3] > 32) {
          yellowEmojiPixels++;
        }
      }
    }
    expect(yellowEmojiPixels).toBeGreaterThan(100);
  });

  it('teks singkat memakai proporsi chat dan bubble mengikuti isi pada canvas 512 × 512', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'halo', time: '12:34' });
    const metadata = await Sharp(buf).metadata();
    const textBounds = await inkBounds(buf, true);
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(textBounds.height).toBeGreaterThanOrEqual(18);
    expect(textBounds.height).toBeLessThanOrEqual(24);
    expect(textBounds.width).toBeGreaterThan(45);
    expect((await inkBounds(buf)).width).toBeLessThan(300);
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

  it('avatar berada di luar bubble di kiri bawah seperti pesan grup WhatsApp', async () => {
    const avatar = await Sharp({
      create: { width: 100, height: 100, channels: 3, background: '#2878c8' },
    }).jpeg().toBuffer();
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Budi', senderId: '1', text: 'MMMMMMM', time: '12:34',
      avatar: { buffer: avatar, mimetype: 'image/jpeg' },
    });
    const textBounds = await inkBounds(buf, true);
    const avatarBounds = await colorBounds(buf, (r, g, b) => b > 150 && r < 70 && g > 90 && g < 140);
    expect(avatarBounds.width).toBeGreaterThan(55);
    expect(avatarBounds.right).toBeLessThan(textBounds.left - 20);
    expect(avatarBounds.bottom).toBeGreaterThan(textBounds.bottom);
    expect(avatarBounds.top).toBeGreaterThan((await inkBounds(buf)).top + 30);
    const withoutAvatar = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'MMMMMMM', time: '12:34' });
    expect(textBounds.width).toBe((await inkBounds(withoutAvatar, true)).width);
  });

  it('nama, kutipan, dan glyph lebar tetap di dalam canvas tanpa overflow', async () => {
    const buf = await renderChatBubbleToBuffer({
      senderName: 'W'.repeat(100), senderId: '1', text: '界'.repeat(60), time: '12:34',
      quoted: { senderName: '界'.repeat(100), body: 'W'.repeat(140) },
    });
    const bounds = await inkBounds(buf);
    expect(bounds.left).toBeGreaterThanOrEqual(12);
    expect(bounds.right).toBeLessThanOrEqual(499);
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

  it('menempatkan waktu di kanan pada baris pesan terakhir ketika masih muat', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'halo', time: '12:34' });
    const body = await inkBounds(buf, true);
    const time = await colorBounds(buf, (r, g, b) => r === 134 && g === 150 && b === 160);
    expect(time.left - body.right).toBeGreaterThanOrEqual(11);
    expect(time.left - body.right).toBeLessThanOrEqual(18);
    expect(time.top).toBeLessThanOrEqual(body.bottom);
    expect(time.bottom - body.bottom).toBeGreaterThanOrEqual(10);
    expect(time.bottom - body.bottom).toBeLessThanOrEqual(17);
  });

  it.each(['incoming', 'outgoing'] as const)('jarak dan posisi jam %s mengikuti contoh WhatsApp untuk pesan satu baris', async direction => {
    const buf = await renderChatBubbleToBuffer({
      senderName: 'Rara', senderId: '222', text: 'Bru selesai cas ni', time: '9:28 PM', direction, showSenderName: false,
    });
    const body = await inkBounds(buf, true);
    const time = await colorBounds(buf, direction === 'incoming'
      ? (r, g, b) => r === 134 && g === 150 && b === 160
      : (r, g, b) => r === 153 && g === 190 && b === 182);
    expect(body.height).toBeLessThan(30);
    expect(time.left - body.right).toBeGreaterThanOrEqual(11);
    expect(time.left - body.right).toBeLessThanOrEqual(18);
    expect(time.top - body.bottom).toBeGreaterThanOrEqual(-4);
    expect(time.top - body.bottom).toBeLessThanOrEqual(2);
    expect(time.bottom - body.bottom).toBeGreaterThanOrEqual(10);
    expect(time.bottom - body.bottom).toBeLessThanOrEqual(17);
    expect(time.height / body.height).toBeGreaterThan(0.6);
    expect(time.height / body.height).toBeLessThan(0.85);
    const shorter = await renderChatBubbleToBuffer({
      senderName: 'Rara', senderId: '222', text: 'halo', time: '9:28 PM', direction, showSenderName: false,
    });
    expect((await inkBounds(shorter, true)).height).toBe(body.height);
  });

  it('contoh Rara tidak membuat ruang kosong lebar antara pesan dan jam', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Rara', senderId: '222', text: 'Gatau, biasanya ngikut aja', time: '13:19' });
    const body = await inkBounds(buf, true);
    const time = await colorBounds(buf, (r, g, b) => r === 134 && g === 150 && b === 160);
    expect(body.height).toBeLessThan(30);
    expect(time.left - body.right).toBeGreaterThanOrEqual(11);
    expect(time.left - body.right).toBeLessThanOrEqual(18);
    expect(time.top).toBeLessThan(body.bottom);
    expect(time.bottom - body.bottom).toBeGreaterThanOrEqual(6);
    expect(time.bottom - body.bottom).toBeLessThanOrEqual(14);
  });

  it('jam mengikuti baris terakhir termasuk huruf berekor dan tetap di dalam padding bawah', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Rara', senderId: '222', text: 'Halo\nngikut aja', time: '13:19' });
    const body = await inkBounds(buf, true);
    const lastLine = await colorBounds(buf, (r, g, b) => r >= 225 && g >= 225 && b >= 225, body.bottom - 28);
    const time = await colorBounds(buf, (r, g, b) => r === 134 && g === 150 && b === 160);
    expect(time.left - lastLine.right).toBeGreaterThanOrEqual(11);
    expect(time.left - lastLine.right).toBeLessThanOrEqual(18);
    expect(time.bottom - lastLine.bottom).toBeGreaterThanOrEqual(6);
    expect(time.bottom - lastLine.bottom).toBeLessThanOrEqual(14);
    expect((await inkBounds(buf)).bottom - time.bottom).toBeGreaterThanOrEqual(8);
  });

  it('waktu memakai baris sendiri tanpa menimpa pesan yang memenuhi lebar bubble', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'M'.repeat(14), time: '12:34' });
    const body = await inkBounds(buf, true);
    const time = await colorBounds(buf, (r, g, b) => r === 134 && g === 150 && b === 160);
    expect(time.top).toBeGreaterThanOrEqual(body.bottom + 8);
    expect(time.top).toBeLessThanOrEqual(body.bottom + 18);
  });

  it.each(['incoming', 'outgoing'] as const)('ukuran %s mengikuti isi dan tinggi bertambah saat teks dibungkus', async direction => {
    const options = { senderName: 'Rara', senderId: '222', time: '13:19', direction };
    const short = await inkBounds(await renderChatBubbleToBuffer({ ...options, text: 'halo' }));
    const medium = await inkBounds(await renderChatBubbleToBuffer({ ...options, text: 'Gatau, biasanya\nngikut aja' }));
    const long = await inkBounds(await renderChatBubbleToBuffer({ ...options, text: 'pesan penting '.repeat(22).trim().slice(0, 300) }));
    expect(short.width).toBeLessThan(medium.width - 70);
    expect(short.height).toBeLessThanOrEqual(medium.height - 28);
    expect(long.height).toBeGreaterThan(medium.height + 150);
    expect(long.width).toBeLessThanOrEqual(440);
  });

  it('pesan masuk gelap di kiri, pesan keluar hijau di kanan dengan ekor berlawanan', async () => {
    const options = { senderName: 'Rara', senderId: '222', text: 'halo', time: '13:19', showSenderName: false };
    const incoming = await renderChatBubbleToBuffer({ ...options, direction: 'incoming' });
    const outgoing = await renderChatBubbleToBuffer({ ...options, direction: 'outgoing' });
    const left = await colorBounds(incoming, (r, g, b) => r === 32 && g === 44 && b === 51);
    const right = await colorBounds(outgoing, (r, g, b) => r === 0 && g === 92 && b === 75);
    expect(left.left).toBeLessThanOrEqual(14);
    expect(right.right).toBeGreaterThanOrEqual(497);
    expect(left.right).toBeLessThan(right.left);
    const leftTop = await rowBounds(incoming, left.top + 6);
    const leftMiddle = await rowBounds(incoming, left.top + 32);
    const rightTop = await rowBounds(outgoing, right.top + 6);
    const rightMiddle = await rowBounds(outgoing, right.top + 32);
    expect(leftTop.left).toBeLessThan(leftMiddle.left - 8);
    expect(rightTop.right).toBeGreaterThan(rightMiddle.right + 8);
  });

  it('bubble keluar tidak dipengaruhi nama atau avatar sendiri', async () => {
    const options = { senderId: '222', text: 'halo', time: '13:19', direction: 'outgoing' as const };
    const normal = await renderChatBubbleToBuffer({ ...options, senderName: 'Rara' });
    const extra = await renderChatBubbleToBuffer({
      ...options, senderName: 'W'.repeat(100), avatar: { buffer: Buffer.from('invalid-avatar'), mimetype: 'image/jpeg' },
    });
    expect(extra.equals(normal)).toBe(true);
  });

  it('pesan masuk pribadi tanpa header memiliki padding atas, bawah, dan jarak jam yang cukup', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Rara', senderId: '222', text: 'halo', time: '13:19', showSenderName: false });
    const shape = await inkBounds(buf);
    const body = await inkBounds(buf, true);
    const time = await colorBounds(buf, (r, g, b) => r === 134 && g === 150 && b === 160);
    expect(body.top - shape.top).toBeGreaterThanOrEqual(15);
    expect(body.top - shape.top).toBeLessThanOrEqual(22);
    expect(shape.bottom - Math.max(body.bottom, time.bottom)).toBeGreaterThanOrEqual(8);
    expect(shape.bottom - Math.max(body.bottom, time.bottom)).toBeLessThanOrEqual(16);
    expect(time.left - body.right).toBeGreaterThanOrEqual(11);
    expect(time.left - body.right).toBeLessThanOrEqual(18);
    const withName = await inkBounds(await renderChatBubbleToBuffer({ senderName: 'Rara', senderId: '222', text: 'halo', time: '13:19' }));
    expect(withName.height).toBeGreaterThan(shape.height + 25);
  });

  it('kutipan dan emoji tetap muat pada bubble keluar tanpa membalik teks', async () => {
    const options = { senderName: 'Rara', senderId: '222', text: 'Iya, nanti aku kabarin lagi ya 😊', time: '13:19', showSenderName: false,
      quoted: { senderName: 'Budi', senderId: '111', body: 'Jadi besok kita berangkat jam berapa?' } };
    const incoming = await renderChatBubbleToBuffer({ ...options, direction: 'incoming' });
    const outgoing = await renderChatBubbleToBuffer({ ...options, direction: 'outgoing' });
    const leftBody = await inkBounds(incoming, true);
    const rightBody = await inkBounds(outgoing, true);
    expect(rightBody.width).toBe(leftBody.width);
    expect(rightBody.height).toBe(leftBody.height);
    const bounds = await inkBounds(outgoing);
    expect(bounds.left).toBeGreaterThanOrEqual(12);
    expect(bounds.right).toBeLessThanOrEqual(499);
    expect(bounds.top).toBeGreaterThanOrEqual(12);
    expect(bounds.bottom).toBeLessThanOrEqual(499);
    expect((await colorBounds(outgoing, (r, g, b) => r === 153 && g === 190 && b === 182)).width).toBeGreaterThan(40);
  });

  it('mempertahankan baris baru dan baris kosong dalam pesan asli', async () => {
    const options = { senderName: 'Budi', senderId: '1', time: '12:34' };
    const single = await inkBounds(await renderChatBubbleToBuffer({ ...options, text: 'Halo dunia' }), true);
    const multiline = await inkBounds(await renderChatBubbleToBuffer({ ...options, text: 'Halo\n\ndunia' }), true);
    expect(multiline.height).toBeGreaterThan(single.height + 60);
  });

  it('margin canvas transparan tanpa latar kotak hitam', async () => {
    const buf = await renderChatBubbleToBuffer({ senderName: 'Budi', senderId: '1', text: 'Halo', time: '12:34' });
    const { data, info } = await Sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) {
      expect(data[(y * info.width + x) * info.channels + 3]).toBe(0);
    }
  });
});

async function rowBounds(buf: Buffer, y: number) {
  const { data, info } = await Sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + 3] >= 200) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { left, right };
}

async function colorBounds(buf: Buffer, predicate: (r: number, g: number, b: number) => boolean, minY = 0) {
  const { data, info } = await Sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = Math.max(0, minY); y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset + 3] < 200 || !predicate(data[offset], data[offset + 1], data[offset + 2])) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}
