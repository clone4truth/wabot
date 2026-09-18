import env from '../config/env';

export interface ParsedCommand {
  name: string;
  args: string;
  rawArgs: string;
  modifier?: string;
  options?: Record<string, unknown>;
}

const RESERVED_MODIFIERS = [
  'full', 'crop', 'circle', 'quote', 'bubble', 'meme', 'teks',
  // Image effects
  'blur', 'grayscale', 'sepia', 'invert', 'pixel', 'sharpen', 'shadow',
  // Creative tools
  'removebg', 'subject', 'outline', 'caption', 'template',
];

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
  let options: Record<string, unknown> | undefined;

  const firstPart = parts[0]?.toLowerCase();

  if (commandName === 'stiker' && RESERVED_MODIFIERS.includes(firstPart || '')) {
    modifier = firstPart;
    remainingArgs = parts.slice(1).join(' ');

    if (firstPart === 'caption') {
      const second = parts[1]?.toLowerCase();
      if (second === 'top' || second === 'bottom' || second === 'overlay') {
        options = { position: second };
        remainingArgs = parts.slice(2).join(' ');
      } else {
        options = { position: 'bottom' };
      }
    } else if (firstPart === 'outline') {
      const second = parts[1]?.toLowerCase();
      if (second === 'white' || second === 'black' || second === 'gold') {
        options = { color: second };
        remainingArgs = parts.slice(2).join(' ');
      } else {
        options = { color: 'white' };
      }
    } else if (firstPart === 'template') {
      const templateName = parts[1]?.toLowerCase();
      if (templateName) {
        options = { template: templateName };
        remainingArgs = parts.slice(2).join(' ');
      }
    }
  } else if (commandName === 'ttp') {
    if (firstPart === 'style' && parts[1]) {
      options = { style: parts[1].toLowerCase() };
      remainingArgs = parts.slice(2).join(' ');
    }
  } else if (commandName === 'attp') {
    if (firstPart === 'effect' && parts[1]) {
      options = { effect: parts[1].toLowerCase() };
      remainingArgs = parts.slice(2).join(' ');
    }
  }

  const result: ParsedCommand = {
    name: commandName,
    args: remainingArgs,
    rawArgs: argsStr,
    modifier,
  };
  if (options) {
    result.options = options;
  }
  return result;
}

export function isCommand(body: string, prefix: string = env.commandPrefix): boolean {
  return !!prefix && body.trim().startsWith(prefix);
}
