export interface LogEntry {
  requestId?: string;
  session?: string;
  messageIdHash?: string;
  chatIdHash?: string;
  command?: string;
  processor?: string;
  inputType?: string;
  processingDurationMs?: number;
  outputSize?: number;
  success?: boolean;
  errorCode?: string;
  eventId?: string;
  error?: string;
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, meta?: LogEntry): void;
  warn(message: string, meta?: LogEntry): void;
  error(message: string, meta?: LogEntry): void;
  child(meta: LogEntry): Logger;
}

export function createLogger(baseMeta: Record<string, unknown> = {}): Logger {
  const prefix = baseMeta.component ? `[${baseMeta.component}] ` : '';

  return {
    info(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'info' };
      console.log(JSON.stringify(entry));
    },
    warn(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'warn' };
      console.warn(JSON.stringify(entry));
    },
    error(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'error' };
      console.error(JSON.stringify(entry));
    },
    child(meta: LogEntry): Logger {
      return createLogger({ ...baseMeta, ...meta });
    },
  };
}

export const logger = createLogger({ component: 'sticker-bot' });
