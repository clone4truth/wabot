import { describe, it, expect } from 'vitest';
import { InputResolver } from '../../src/stickers/input.resolver';

describe('InputResolver', () => {
  const resolver = new InputResolver();

  it('!stiker + teks langsung -> text/direct', () => {
    const input = resolver.resolve({
      command: '!stiker', args: 'halo', senderName: 'Budi', senderId: '1',
    });
    expect(input?.type).toBe('text');
    expect(input?.source).toBe('direct');
    expect(input?.content.text).toBe('halo');
    expect(input?.content.senderName).toBe('Budi');
  });

  it('reply teks + args -> text dengan quoted', () => {
    const input = resolver.resolve({
      command: '!stiker', args: 'setuju',
      reply: { body: 'besok jadi?', senderId: '2', senderName: 'Ani' },
      senderName: 'Budi', senderId: '1',
    });
    expect(input?.type).toBe('text');
    expect(input?.source).toBe('reply');
    expect(input?.content.text).toBe('setuju');
    expect(input?.content.quotedBody).toBe('besok jadi?');
    expect(input?.content.quotedSenderName).toBe('Ani');
  });

  it('reply teks tanpa args -> stiker dari chat yang di-quote', () => {
    const input = resolver.resolve({
      command: '!stiker', args: '',
      reply: { body: 'info penting', senderId: '2', senderName: 'Ani' },
      senderName: 'Budi', senderId: '1',
    });
    expect(input?.type).toBe('text');
    expect(input?.content.text).toBe('info penting');
    expect(input?.content.senderName).toBe('Ani');
  });

  it('reply media foto -> label quote Foto bila tanpa body', () => {
    const input = resolver.resolve({
      command: '!stiker', args: 'cakep',
      reply: { media: { url: 'http://x/img.jpg', mimetype: 'image/jpeg' } },
      senderName: 'Budi', senderId: '1',
    });
    expect(input?.type).toBe('image');
  });

  it('reply foto -> image, reply video -> video', () => {
    const img = resolver.resolve({
      command: '!stiker', args: '',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } },
    });
    expect(img?.type).toBe('image');
    expect(img?.content.mediaUrl).toBe('http://x/a.jpg');

    const vid = resolver.resolve({
      command: '!stiker', args: '',
      reply: { media: { url: 'http://x/a.mp4', mimetype: 'video/mp4' } },
    });
    expect(vid?.type).toBe('video');
  });

  it('!toimg/!togif membawa mediaUrl dari reply', () => {
    const toimg = resolver.resolve({
      command: '!toimg', args: '',
      reply: { media: { url: 'http://x/s.webp', mimetype: 'image/webp' } },
    });
    expect(toimg?.type).toBe('toimg');
    expect(toimg?.content.mediaUrl).toBe('http://x/s.webp');
  });

  it('tanpa input -> null; command lain -> null', () => {
    expect(resolver.resolve({ command: '!stiker', args: '' })?.type ?? null).toBe(null);
    expect(resolver.resolve({ command: '!ping', args: '' })).toBe(null);
  });
});
