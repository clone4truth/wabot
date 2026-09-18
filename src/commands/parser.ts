import env from '../config/env';

export interface ParsedCommand {
  name: string;
  args: string;
  rawArgs: string;
  modifier?: string;
}

const RESERVED_MODIFIERS = ['full', 'crop', 'circle', 'quote', 'bubble', 'meme', 'teks'];

export function parseCommand(body: string, prefix: string = env.commandPrefix): ParsedCommand | null {
  const trimmed = body.trim();
  if (!prefix || !trimmed.startsWith(prefix)) return null;

  const afterPrefix = trimmed.slice(prefix.length).trim();
  const lower = afterPrefix.toLowerCase();

  const spaceIdx = afterPrefix.indexOf(' ');
  const commandName = spaceIdx === -1 ? lower : afterPrefix.slice(0, spaceIdx).toLowerCase();
  const argsStr = spaceIdx === -1 ? '' : afterPrefix.slice(spaceIdx + 1).trim();

  const parts = argsStr.split(/\s+/).filter(Boolean);

  let modifier: string | undefined;
  let remainingArgs = argsStr;

  const firstPart = parts[0]?.toLowerCase();
  if (RESERVED_MODIFIERS.includes(firstPart || '')) {
    modifier = firstPart;
    remainingArgs = parts.slice(1).join(' ');
  }

  return {
    name: commandName,
    args: remainingArgs,
    rawArgs: argsStr,
    modifier,
  };
}

export function isCommand(body: string, prefix: string = env.commandPrefix): boolean {
  return !!prefix && body.trim().startsWith(prefix);
}
