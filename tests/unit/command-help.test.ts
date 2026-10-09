import { describe, expect, it } from 'vitest';
import { handleMenu } from '../../src/commands/menu.handler';
import { handleHelp } from '../../src/commands/help.handler';
import { handleTemplateCommand } from '../../src/commands/template.handler';
import { COMMAND_REGISTRY, findCommand } from '../../src/commands/metadata';
import { parseCommand } from '../../src/commands/parser';
import { CommandRouter } from '../../src/commands/router';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';

describe('Command guidance', () => {
  it('lists every public command with the active chat prefix', () => {
    const menu = handleMenu('?');
    for (const command of COMMAND_REGISTRY) {
      expect(menu).toContain(`?${command.name}`);
    }
    expect(menu).toContain('?help effects');
    expect(menu).not.toMatch(/!(?:stiker|ttp|attp|menu|help)/);
  });

  it.each(['bubble', 'quote', 'teks'])('resolves detailed help for the %s modifier', (topic) => {
    expect(findCommand(topic)?.name).toBe(`stiker ${topic}`);
    const help = handleHelp(topic, '?');
    expect(help).toContain(`Bantuan Command: stiker ${topic}`);
    expect(help).toContain(`?stiker ${topic}`);
  });

  it('accepts a prefixed command as a help topic and normalizes whitespace', () => {
    expect(handleHelp('?stiker\t bubble', '?')).toContain('Bantuan Command: stiker bubble');
    expect(handleHelp('!stiker bubble', '?')).toContain('?stiker bubble');
  });

  it('uses the active prefix for general and category help', () => {
    expect(handleHelp(undefined, '$')).toContain('$ttp --image');
    expect(handleHelp('effects', '.')).toContain('.stiker blur');
    expect(handleHelp(undefined, '$')).not.toContain('!help');
  });

  it.each(['kontak', 'bubble', 'quote'])('explains personal aliases in %s help with the active prefix', (topic) => {
    const help = handleHelp(topic, '?');
    expect(help).toContain('?kontak nama Kak Rara');
    expect(help).toContain('?kontak hapus');
    expect(help).not.toContain('!kontak');
  });

  it('reports an unknown help topic with a usable menu command', () => {
    expect(handleHelp('bubblle', '?')).toContain('Topik "bubblle" tidak ditemukan');
    expect(handleHelp('bubblle', '?')).toContain('?menu');
  });

  it('uses the active prefix throughout template guidance and errors', () => {
    const list = handleTemplateCommand(parseCommand('?template list', '?')!, '?');
    expect(list).toContain('?stiker template');
    expect(list).toContain('?template info');
    const info = handleTemplateCommand(parseCommand('?template info terminal', '?')!, '?');
    expect(info).toContain('?stiker template terminal');
    const missing = handleTemplateCommand(parseCommand('?template info missing', '?')!, '?');
    expect(missing).toContain('?template list');
  });

  it('explains missing template names and unknown template actions', () => {
    const missing = handleTemplateCommand(parseCommand('!template info')!);
    expect(missing).toContain('Tentukan nama template');
    const unknown = handleTemplateCommand(parseCommand('!template typo')!);
    expect(unknown).toContain('tidak dikenal');
  });
});

describe('CommandRouter', () => {
  it('returns a controlled user error for unknown commands', async () => {
    const router = new CommandRouter();
    const dispatched = router.dispatch(parseCommand('!missing')!, {});
    await expect(dispatched).rejects.toBeInstanceOf(AppError);
    await expect(dispatched).rejects.toMatchObject({ code: ErrorCode.INVALID_COMMAND });
  });
});
