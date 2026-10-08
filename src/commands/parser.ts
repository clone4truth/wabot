import env from '../config/env';

export interface ParsedCommand {
  name: string;
  args: string;
  rawArgs: string;
  modifier?: string;
  options?: Record<string, unknown>;
}

const RESERVED_MODIFIERS = [
  'full', 'crop', 'trim', 'circle', 'quote', 'bubble', 'meme', 'teks',
  // Image effects
  'blur', 'grayscale', 'sepia', 'invert', 'pixel', 'sharpen', 'shadow',
  // Creative tools
  'removebg', 'subject', 'outline', 'caption', 'template',
];

export function parseCommand(body: string, prefix: string = env.commandPrefix): ParsedCommand | null {
  const trimmed = body.trim();
  if (!prefix || !trimmed.startsWith(prefix)) return null;

  const afterPrefix = trimmed.slice(prefix.length).trim();
  if (!afterPrefix) return null;
  const lower = afterPrefix.toLowerCase();

  const spaceIdx = afterPrefix.search(/\s/);
  const commandName = spaceIdx === -1 ? lower : afterPrefix.slice(0, spaceIdx).toLowerCase();
  const argsStr = spaceIdx === -1 ? '' : afterPrefix.slice(spaceIdx + 1).trim();

  const tokens = [...argsStr.matchAll(/\S+/g)];
  const parts = tokens.map((token) => token[0]);
  // Consume syntax tokens by offset so newlines and spaces in the actual text
  // survive parsing (chat bubbles, captions, styled text, and templates).
  const afterTokens = (count: number): string => tokens[count]
    ? argsStr.slice(tokens[count].index)
    : '';

  let modifier: string | undefined;
  let remainingArgs = argsStr;
  let options: Record<string, unknown> | undefined;

  const firstPart = parts[0]?.toLowerCase();

  if (commandName === 'stiker' && RESERVED_MODIFIERS.includes(firstPart || '')) {
    modifier = firstPart;
    remainingArgs = afterTokens(1);

    if (firstPart === 'caption') {
      const second = parts[1]?.toLowerCase();
      if (second === 'top' || second === 'bottom' || second === 'overlay') {
        options = { position: second };
        remainingArgs = afterTokens(2);
      } else {
        options = { position: 'bottom' };
      }
    } else if (firstPart === 'outline') {
      const second = parts[1]?.toLowerCase();
      if (second === 'white' || second === 'black' || second === 'gold') {
        options = { color: second };
        remainingArgs = afterTokens(2);
      } else {
        options = { color: 'white' };
      }
    } else if (firstPart === 'template') {
      const templateName = parts[1]?.toLowerCase();
      if (templateName) {
        options = { template: templateName };
        remainingArgs = afterTokens(2);
      }
    }
  } else if (commandName === 'ttp') {
    let styleOffset = 0;
    if (firstPart === '--image') {
      options = { output: 'image' };
      styleOffset = 1;
      remainingArgs = afterTokens(1);
    }
    if (parts[styleOffset]?.toLowerCase() === 'style' && parts[styleOffset + 1]) {
      options = { ...options, style: parts[styleOffset + 1].toLowerCase() };
      remainingArgs = afterTokens(styleOffset + 2);
    }
  } else if (commandName === 'attp') {
    if (firstPart === 'effect' && parts[1]) {
      options = { effect: parts[1].toLowerCase() };
      remainingArgs = afterTokens(2);
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
