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
});

describe('isCommand', () => {
  it('returns true for command', () => {
    expect(isCommand('!stiker')).toBe(true);
  });
  it('returns false for non-command', () => {
    expect(isCommand('hello')).toBe(false);
  });
});
