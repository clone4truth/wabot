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

  it('modifier gambar valid diteruskan, yang lain diabaikan', () => {
    const circle = resolver.resolve({
      command: '!stiker', args: 'circle', modifier: 'circle',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } },
    });
    expect(circle?.type).toBe('image');
    expect(circle?.modifier).toBe('circle');

    const bogus = resolver.resolve({
      command: '!stiker', args: 'meme', modifier: 'meme',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } },
    });
    expect(bogus?.modifier).toBeUndefined();
  });

  it('!ttp langsung dan via reply teks', () => {
    const direct = resolver.resolve({ command: '!ttp', args: 'halo' });
    expect(direct?.type).toBe('ttp');
    expect(direct?.content.text).toBe('halo');
    const viaReply = resolver.resolve({ command: '!ttp', args: '', reply: { body: 'teks reply' } });
    expect(viaReply?.type).toBe('ttp');
    expect(viaReply?.content.text).toBe('teks reply');
    expect(resolver.resolve({ command: '!ttp', args: '' })).toBe(null);
  });

  it('modifier meme pada foto -> tipe meme', () => {
    const meme = resolver.resolve({
      command: '!stiker', args: 'A | B', modifier: 'meme',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } },
    });
    expect(meme?.type).toBe('meme');
    expect(meme?.content.args).toBe('A | B');
  });

  it('!attp langsung dan via reply teks', () => {
    expect(resolver.resolve({ command: '!attp', args: 'gas' })?.type).toBe('attp');
    expect(resolver.resolve({ command: '!attp', args: '', reply: { body: 'gas' } })?.content.text).toBe('gas');
    expect(resolver.resolve({ command: '!attp', args: '' })).toBe(null);
  });

  it('reply text + modifier bubble/quote dipertahankan', () => {
    const bubble = resolver.resolve({
      command: '!stiker', args: 'bubble', modifier: 'bubble',
      reply: { body: 'halo', senderName: 'A' },
    });
    expect(bubble?.type).toBe('text');
    expect(bubble?.modifier).toBe('bubble');

    const quote = resolver.resolve({
      command: '!stiker', args: 'quote', modifier: 'quote',
      reply: { body: 'halo', senderName: 'A' },
    });
    expect(quote?.modifier).toBe('quote');
  });

  it('reply image + meme -> meme (prioritas reply)', () => {
    const meme = resolver.resolve({
      command: '!stiker', args: 'A | B', modifier: 'meme',
      reply: { media: { url: 'http://x/a.jpg', mimetype: 'image/jpeg' } },
    });
    expect(meme?.type).toBe('meme');
  });

  it('tanpa input -> null; command lain -> null', () => {
    expect(resolver.resolve({ command: '!stiker', args: '' })?.type ?? null).toBe(null);
    expect(resolver.resolve({ command: '!ping', args: '' })).toBe(null);
  });

  describe('P0: Modifier / Input Compatibility Matrix & Force Text', () => {
    it('reply image + !stiker teks hello -> text', () => {
      const res = resolver.resolve({
        command: '!stiker',
        args: 'hello',
        modifier: 'teks',
        reply: { media: { url: 'http://x/img.jpg', mimetype: 'image/jpeg' } },
        senderName: 'Budi',
      });
      expect(res?.type).toBe('text');
      expect(res?.content.text).toBe('hello');
    });

    it('reply video + !stiker teks hello -> text', () => {
      const res = resolver.resolve({
        command: '!stiker',
        args: 'hello',
        modifier: 'teks',
        reply: { media: { url: 'http://x/vid.mp4', mimetype: 'video/mp4' } },
        senderName: 'Budi',
      });
      expect(res?.type).toBe('text');
      expect(res?.content.text).toBe('hello');
    });

    it('reply image + !stiker teks tanpa args -> error Tambahkan teks', () => {
      expect(() =>
        resolver.resolve({
          command: '!stiker',
          args: '',
          modifier: 'teks',
          reply: { media: { url: 'http://x/img.jpg', mimetype: 'image/jpeg' } },
        }),
      ).toThrowError(/Tambahkan teks setelah !stiker teks/);
    });

    it('reply text + !stiker teks tanpa args -> text dari reply', () => {
      const res = resolver.resolve({
        command: '!stiker',
        args: '',
        modifier: 'teks',
        reply: { body: 'hello dunia' },
      });
      expect(res?.type).toBe('text');
      expect(res?.content.text).toBe('hello dunia');
    });

    it('reply image + !stiker quote -> error MODIFIER_REQUIRES_TEXT', () => {
      expect(() =>
        resolver.resolve({
          command: '!stiker',
          args: '',
          modifier: 'quote',
          reply: { media: { url: 'http://x/img.jpg', mimetype: 'image/jpeg' } },
        }),
      ).toThrow();
    });

    it('reply video + !stiker circle -> error MODIFIER_REQUIRES_IMAGE', () => {
      expect(() =>
        resolver.resolve({
          command: '!stiker',
          args: '',
          modifier: 'circle',
          reply: { media: { url: 'http://x/vid.mp4', mimetype: 'video/mp4' } },
        }),
      ).toThrow();
    });

    it('no image + !stiker meme A | B -> error Mode meme membutuhkan foto', () => {
      expect(() =>
        resolver.resolve({
          command: '!stiker',
          args: 'A | B',
          modifier: 'meme',
        }),
      ).toThrowError(/Mode meme membutuhkan foto/);
    });

    it('no image + !stiker crop hello -> error Mode crop membutuhkan foto', () => {
      expect(() =>
        resolver.resolve({
          command: '!stiker',
          args: 'hello',
          modifier: 'crop',
        }),
      ).toThrowError(/Mode crop membutuhkan foto/);
    });

    it('reply non-webp pada !toimg -> error UNSUPPORTED_STICKER_TYPE', () => {
      expect(() =>
        resolver.resolve({
          command: '!toimg',
          args: '',
          reply: { media: { url: 'http://x/pic.jpg', mimetype: 'image/jpeg' } },
        }),
      ).toThrow();
    });

    it('reply non-webp pada !togif -> error UNSUPPORTED_STICKER_TYPE', () => {
      expect(() =>
        resolver.resolve({
          command: '!togif',
          args: '',
          reply: { media: { url: 'http://x/vid.mp4', mimetype: 'video/mp4' } },
        }),
      ).toThrow();
    });
  });
});

