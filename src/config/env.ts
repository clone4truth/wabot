import { config } from 'dotenv';

config();

export interface EnvConfig {
  appPort: number;
  appEnv: string;
  logLevel: string;
  wahaBaseUrl: string;
  wahaApiKey: string;
  wahaSession: string;
  wahaWebhookHmacKey: string;
  commandPrefix: string;
  allowedChatIds: string[];
  blockedSenderIds: string[];
  groupAdminOnly: boolean;
  maxTextLength: number;
  maxImageBytes: number;
  maxVideoBytes: number;
  maxVideoDurationSeconds: number;
  textProcessingTimeoutMs: number;
  imageProcessingTimeoutMs: number;
  videoProcessingTimeoutMs: number;
  userRateLimit: number;
  groupRateLimit: number;
  videoConcurrencyPerUser: number;
  tempDir: string;
  tempFileTtlSeconds: number;
  dataDir: string;
}

function splitList(raw: string | undefined): string[] {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const env: EnvConfig = {
  appPort: Number(process.env.APP_PORT) || 3000,
  appEnv: process.env.APP_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  wahaBaseUrl: process.env.WAHA_BASE_URL || 'http://localhost:3001',
  wahaApiKey: process.env.WAHA_API_KEY || '',
  wahaSession: process.env.WAHA_SESSION || 'default',
  wahaWebhookHmacKey: process.env.WAHA_WEBHOOK_HMAC_KEY || '',
  commandPrefix: process.env.COMMAND_PREFIX || '!',
  allowedChatIds: splitList(process.env.ALLOWED_CHAT_IDS),
  blockedSenderIds: splitList(process.env.BLOCKED_SENDER_IDS),
  groupAdminOnly: (process.env.GROUP_ADMIN_ONLY || '').toLowerCase() === 'true',
  maxTextLength: Number(process.env.MAX_TEXT_LENGTH) || 300,
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES) || 15 * 1024 * 1024,
  maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES) || 20 * 1024 * 1024,
  maxVideoDurationSeconds: Number(process.env.MAX_VIDEO_DURATION_SECONDS) || 10,
  textProcessingTimeoutMs: Number(process.env.TEXT_PROCESSING_TIMEOUT_MS) || 5000,
  imageProcessingTimeoutMs: Number(process.env.IMAGE_PROCESSING_TIMEOUT_MS) || 10000,
  videoProcessingTimeoutMs: Number(process.env.VIDEO_PROCESSING_TIMEOUT_MS) || 30000,
  userRateLimit: Number(process.env.USER_RATE_LIMIT) || 8,
  groupRateLimit: Number(process.env.GROUP_RATE_LIMIT) || 30,
  videoConcurrencyPerUser: Number(process.env.VIDEO_CONCURRENCY_PER_USER) || 2,
  tempDir: process.env.TEMP_DIR || '/tmp/waha-sticker-bot',
  tempFileTtlSeconds: Number(process.env.TEMP_FILE_TTL_SECONDS) || 300,
  dataDir: process.env.DATA_DIR || './data',
};

export default env;
