import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { TtpProcessor } from '../../src/stickers/processors/ttp.processor';
import { TtpGenerator } from '../../src/stickers/generators/ttp.generator';
import { getTtpStyle, listTtpStyles } from '../../src/stickers/ttp/styles';

describe('TTP Style Presets & TtpGenerator', () => {
  const processor = new TtpProcessor();
  const generator = new TtpGenerator();

  it('lists all registered ttp style presets', () => {
    const styles = listTtpStyles();
    expect(styles).toContain('default');
    expect(styles).toContain('gradient');
    expect(styles).toContain('minimal');
    expect(styles).toContain('dark');
    expect(styles).toContain('terminal');
    expect(styles).toContain('gold');
    expect(styles).toContain('neon');
  });

  it('renders with gradient style', async () => {
    const result = await processor.process('Halo Gradient', 'gradient');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('renders with terminal style', async () => {
    const result = await processor.process('sudo rm -rf /', 'terminal');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('renders with gold style', async () => {
    const result = await processor.process('Gold VIP', 'gold');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('throws INVALID_ARGUMENT if unknown explicit style is provided', async () => {
    expect(() => getTtpStyle('unknown-style')).toThrow();
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    expect(() =>
      generator.validate(
        {
          type: 'ttp',
          text: 'Default Test',
          options: { style: 'unknown-style' },
        },
        context
      )
    ).toThrow();
  });

  it('TtpGenerator supports ttp type', () => {
    expect(generator.supports({ type: 'ttp' })).toBe(true);
    expect(generator.supports({ type: 'image' })).toBe(false);
  });

  it('TtpGenerator processes input with options.style', async () => {
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    const result = await generator.process(
      {
        type: 'ttp',
        text: 'Hello TTP Generator',
        options: { style: 'neon' },
      },
      context
    );
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('TtpGenerator validates empty text', () => {
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    expect(() => generator.validate({ type: 'ttp', text: '' }, context)).toThrow(
      'Teks !ttp tidak boleh kosong'
    );
  });
});
