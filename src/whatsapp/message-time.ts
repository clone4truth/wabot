export const DEFAULT_MESSAGE_TIME_ZONE = 'Asia/Jakarta';
export const UNKNOWN_MESSAGE_TIME = '--:--';

/** WAHA publishes Unix seconds; some engine payloads use milliseconds. */
export function normalizeMessageTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
  return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : undefined;
}

export function firstMessageTimestamp(...values: unknown[]): number | undefined {
  for (const value of values) {
    const timestamp = normalizeMessageTimestamp(value);
    if (timestamp !== undefined) return timestamp;
  }
  return undefined;
}

/** Unknown original times stay unknown instead of becoming the processing time. */
export function formatMessageTime(value: unknown, timeZone = process.env.TZ || DEFAULT_MESSAGE_TIME_ZONE): string {
  const timestamp = normalizeMessageTimestamp(value);
  if (timestamp === undefined) return UNKNOWN_MESSAGE_TIME;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: DEFAULT_MESSAGE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }
  const parts = formatter.formatToParts(new Date(timestamp));
  return `${parts.find((part) => part.type === 'hour')!.value}:${parts.find((part) => part.type === 'minute')!.value}`;
}
