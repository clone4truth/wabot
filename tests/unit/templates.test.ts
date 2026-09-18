import { describe, it, expect } from 'vitest';
import { defaultTemplateRegistry } from '../../src/stickers/templates/registry';
import { ErrorCode } from '../../src/errors/error-codes';

describe('Sticker Templates', () => {
  it('semua built-in template terdaftar', () => {
    const expected = ['terminal', 'breaking', 'wanted', 'minimal'];
    for (const name of expected) {
      expect(defaultTemplateRegistry.has(name)).toBe(true);
      expect(defaultTemplateRegistry.get(name)?.name).toBe(name);
    }
  });

  it('template list() mengembalikan info template', () => {
    const list = defaultTemplateRegistry.list();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.some((t) => t.name === 'terminal')).toBe(true);
  });

  it('render template terminal menghasilkan 512x512 webp', async () => {
    const tpl = defaultTemplateRegistry.resolve('terminal');
    const res = await tpl.render({ text: 'git status && npm test' });
    expect(res.mimetype).toBe('image/webp');
    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
    expect(res.buffer.length).toBeGreaterThan(1000);
  });

  it('render template breaking, wanted, minimal menghasilkan 512x512 webp', async () => {
    for (const name of ['breaking', 'wanted', 'minimal']) {
      const tpl = defaultTemplateRegistry.resolve(name);
      const res = await tpl.render({ text: 'Halo Dunia Stiker Bot' });
      expect(res.width).toBe(512);
      expect(res.height).toBe(512);
      expect(res.buffer.length).toBeGreaterThan(1000);
    }
  });

  it('melempar error jika template tidak dikenal', () => {
    expect(() => defaultTemplateRegistry.resolve('non_existent')).toThrow();
  });
});
