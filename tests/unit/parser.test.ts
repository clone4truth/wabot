import { describe, it, expect } from 'vitest';
import { parseCommand, isCommand } from '../../src/commands/parser';

describe('Command Parser', () => {
  it('parses !stiker command', () => {
    const result = parseCommand('!stiker hello');
    expect(result).toEqual({ name: 'stiker', args: 'hello', rawArgs: 'hello' });
  });

  it('is case insensitive', () => {
    const result = parseCommand('!STIKER hello');
    expect(result?.name).toBe('stiker');
  });

  it('parses !stiker with modifier', () => {
    const result = parseCommand('!stiker crop');
    expect(result?.modifier).toBe('crop');
    expect(result?.args).toBe('');
  });

  it('parses !stiker teks as direct text', () => {
    const result = parseCommand('!stiker teks hello');
    expect(result?.modifier).toBe('teks');
    expect(result?.args).toBe('hello');
  });

  it('parses !stiker meme with pipe separator', () => {
    const result = parseCommand('!stiker meme top | bottom');
    expect(result?.modifier).toBe('meme');
    expect(result?.args).toBe('top | bottom');
  });

  it('hanya parse modifier untuk !stiker, bukan untuk !ttp atau !attp', () => {
    const stikerQuote = parseCommand('!stiker quote hello');
    expect(stikerQuote?.modifier).toBe('quote');
    expect(stikerQuote?.args).toBe('hello');

    const ttpQuote = parseCommand('!ttp quote hello');
    expect(ttpQuote?.name).toBe('ttp');
    expect(ttpQuote?.modifier).toBeUndefined();
    expect(ttpQuote?.args).toBe('quote hello');
    expect(ttpQuote?.rawArgs).toBe('quote hello');

    const attpBubble = parseCommand('!attp bubble hello');
    expect(attpBubble?.name).toBe('attp');
    expect(attpBubble?.modifier).toBeUndefined();
    expect(attpBubble?.args).toBe('bubble hello');
    expect(attpBubble?.rawArgs).toBe('bubble hello');

    const ttpCrop = parseCommand('!ttp crop');
    expect(ttpCrop?.name).toBe('ttp');
    expect(ttpCrop?.modifier).toBeUndefined();
    expect(ttpCrop?.args).toBe('crop');

    const attpMeme = parseCommand('!attp meme');
    expect(attpMeme?.name).toBe('attp');
    expect(attpMeme?.modifier).toBeUndefined();
    expect(attpMeme?.args).toBe('meme');
  });


  it('returns null for non-command', () => {
    expect(parseCommand('hello')).toBeNull();
  });

  it('parses !toimg', () => {
    const result = parseCommand('!toimg');
    expect(result?.name).toBe('toimg');
  });

  it('parses !togif', () => {
    const result = parseCommand('!togif');
    expect(result?.name).toBe('togif');
  });

  it('parses !menu', () => {
    const result = parseCommand('!menu');
    expect(result?.name).toBe('menu');
  });

  it('parses !ping', () => {
    const result = parseCommand('!ping');
    expect(result?.name).toBe('ping');
  });

  it('parses !help', () => {
    const result = parseCommand('!help');
    expect(result?.name).toBe('help');
  });

  it('parses image effects', () => {
    const blur = parseCommand('!stiker blur');
    expect(blur?.modifier).toBe('blur');

    const pixel = parseCommand('!stiker pixel');
    expect(pixel?.modifier).toBe('pixel');

    const sepia = parseCommand('!stiker sepia');
    expect(sepia?.modifier).toBe('sepia');
  });

  it('parses removebg, subject, outline', () => {
    const rmbg = parseCommand('!stiker removebg');
    expect(rmbg?.modifier).toBe('removebg');

    const subj = parseCommand('!stiker subject');
    expect(subj?.modifier).toBe('subject');

    const outDefault = parseCommand('!stiker outline');
    expect(outDefault?.modifier).toBe('outline');
    expect(outDefault?.options).toEqual({ color: 'white' });

    const outBlack = parseCommand('!stiker outline black');
    expect(outBlack?.modifier).toBe('outline');
    expect(outBlack?.options).toEqual({ color: 'black' });
  });

  it('parses caption mode and text', () => {
    const capDef = parseCommand('!stiker caption Halo dunia');
    expect(capDef?.modifier).toBe('caption');
    expect(capDef?.options).toEqual({ position: 'bottom' });
    expect(capDef?.args).toBe('Halo dunia');

    const capTop = parseCommand('!stiker caption top Judul Atas');
    expect(capTop?.modifier).toBe('caption');
    expect(capTop?.options).toEqual({ position: 'top' });
    expect(capTop?.args).toBe('Judul Atas');
  });

  it('parses template modifier', () => {
    const tpl = parseCommand('!stiker template terminal npm test');
    expect(tpl?.modifier).toBe('template');
    expect(tpl?.options).toEqual({ template: 'terminal' });
    expect(tpl?.args).toBe('npm test');
  });

  it('parses !ttp style vs literal text', () => {
    const ttpStyle = parseCommand('!ttp style gold Hello');
    expect(ttpStyle?.name).toBe('ttp');
    expect(ttpStyle?.options).toEqual({ style: 'gold' });
    expect(ttpStyle?.args).toBe('Hello');

    const ttpLiteral = parseCommand('!ttp gold Hello');
    expect(ttpLiteral?.name).toBe('ttp');
    expect(ttpLiteral?.options).toBeUndefined();
    expect(ttpLiteral?.args).toBe('gold Hello');
  });

  it('parses !attp effect vs literal text', () => {
    const attpEffect = parseCommand('!attp effect fade Hello');
    expect(attpEffect?.name).toBe('attp');
    expect(attpEffect?.options).toEqual({ effect: 'fade' });
    expect(attpEffect?.args).toBe('Hello');

    const attpLiteral = parseCommand('!attp fade Hello');
    expect(attpLiteral?.name).toBe('attp');
    expect(attpLiteral?.options).toBeUndefined();
    expect(attpLiteral?.args).toBe('fade Hello');
  });

  it('parses !emoji and !badge commands', () => {
    const emoji = parseCommand('!emoji 😂');
    expect(emoji?.name).toBe('emoji');
    expect(emoji?.args).toBe('😂');

    const badge = parseCommand('!badge ONLINE');
    expect(badge?.name).toBe('badge');
    expect(badge?.args).toBe('ONLINE');
  });
});

describe('isCommand', () => {
  it('returns true for command', () => {
    expect(isCommand('!stiker')).toBe(true);
  });
  it('returns false for non-command', () => {
    expect(isCommand('hello')).toBe(false);
  });
});

describe('Custom prefix', () => {
  it('parse dengan prefix custom', () => {
    expect(parseCommand('?ping', '?')?.name).toBe('ping');
    expect(parseCommand('!ping', '?')).toBe(null);
    expect(parseCommand('?stiker halo', '?')).toMatchObject({ name: 'stiker', args: 'halo' });
  });

  it('isCommand hormati prefix', () => {
    expect(isCommand('?ping', '?')).toBe(true);
    expect(isCommand('!ping', '?')).toBe(false);
  });
});
