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
  maxImageJobs: number;
  maxVideoJobs: number;
  maxBackgroundJobs: number;
  maxAnimationJobs: number;
  maxImageQueue: number;
  maxVideoQueue: number;
  maxAnimationQueue: number;
  maxBackgroundQueue: number;
  backgroundRemovalProvider: 'local' | 'api' | 'disabled';
  backgroundRemovalApiUrl: string;
  backgroundRemovalApiKey: string;
  backgroundRemovalTimeoutMs: number;
  backgroundRemovalConcurrency: number;
  backgroundRemovalMaxResponseBytes: number;
  /** Batas piksel untuk Sharp saat validasi respons BG API (cegah pixel bomb). */
  backgroundRemovalMaxPixels: number;
  /** Batas ukuran body avatar fetch (bytes). */
  avatarMaxBytes: number;
  /** Batas piksel untuk Sharp saat validasi avatar. */
  avatarMaxPixels: number;
  batchMaxItems: number;
  batchConcurrency: number;
  jobHistoryTtlSeconds: number;
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
  maxImageJobs: Number(process.env.MAX_IMAGE_JOBS) || 4,
  maxVideoJobs: Number(process.env.MAX_VIDEO_JOBS) || 2,
  maxBackgroundJobs: Number(process.env.MAX_BACKGROUND_JOBS) || 1,
  maxAnimationJobs: Number(process.env.MAX_ANIMATION_JOBS) || 2,
  maxImageQueue: Number(process.env.MAX_IMAGE_QUEUE) || 50,
  maxVideoQueue: Number(process.env.MAX_VIDEO_QUEUE) || 20,
  maxAnimationQueue: Number(process.env.MAX_ANIMATION_QUEUE) || 20,
  maxBackgroundQueue: Number(process.env.MAX_BACKGROUND_QUEUE) || 10,
  backgroundRemovalProvider: ((process.env.BACKGROUND_REMOVAL_PROVIDER as any) || 'disabled'),
  backgroundRemovalApiUrl: process.env.BACKGROUND_REMOVAL_API_URL || '',
  backgroundRemovalApiKey: process.env.BACKGROUND_REMOVAL_API_KEY || '',
  backgroundRemovalTimeoutMs: Number(process.env.BACKGROUND_REMOVAL_TIMEOUT_MS) || 30000,
  backgroundRemovalConcurrency: Number(process.env.BACKGROUND_REMOVAL_CONCURRENCY) || 1,
  backgroundRemovalMaxResponseBytes: Number(process.env.BACKGROUND_REMOVAL_MAX_RESPONSE_BYTES) || 20971520,
  backgroundRemovalMaxPixels: Number(process.env.BACKGROUND_REMOVAL_MAX_PIXELS) || 25_000_000,
  avatarMaxBytes: Number(process.env.AVATAR_MAX_BYTES) || 2 * 1024 * 1024,
  avatarMaxPixels: Number(process.env.AVATAR_MAX_PIXELS) || 16_000_000,
  batchMaxItems: Number(process.env.BATCH_MAX_ITEMS) || 10,
  batchConcurrency: Number(process.env.BATCH_CONCURRENCY) || 2,
  jobHistoryTtlSeconds: Number(process.env.JOB_HISTORY_TTL_SECONDS) || 3600,
};

export default env;
