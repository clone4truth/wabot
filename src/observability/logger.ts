const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];

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
  level?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: LogEntry): void;
  info(message: string, meta?: LogEntry): void;
  warn(message: string, meta?: LogEntry): void;
  error(message: string, meta?: LogEntry): void;
  child(meta: LogEntry): Logger;
}

function store(entry: LogEntry): void {
  entry.timestamp = new Date().toISOString();
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

export function getErrors(): LogEntry[] {
  return logBuffer.filter(e => e.level === 'error' || e.errorCode);
}

export function createLogger(baseMeta: Record<string, unknown> = {}): Logger {
  const prefix = baseMeta.component ? `[${baseMeta.component}] ` : '';

  return {
    debug(message: string, meta: LogEntry = {}) {
      if (process.env.LOG_LEVEL === 'debug') {
        const entry = { ...baseMeta, ...meta, level: 'debug', message };
        store(entry);
        console.debug(JSON.stringify(entry));
      }
    },
    info(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'info', message };
      store(entry);
      console.log(JSON.stringify(entry));
    },
    warn(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'warn', message };
      store(entry);
      console.warn(JSON.stringify(entry));
    },
    error(message: string, meta: LogEntry = {}) {
      const entry = { ...baseMeta, ...meta, level: 'error', message };
      store(entry);
      console.error(JSON.stringify(entry));
    },
    child(meta: LogEntry): Logger {
      return createLogger({ ...baseMeta, ...meta });
    },
  };
}

export const logger = createLogger({ component: 'sticker-bot' });
