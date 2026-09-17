import fetch from 'node-fetch';
import env from '../config/env';
import { StickerResult } from './types';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../observability/logger';

export class WAHAClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly session: string;

  constructor(baseUrl?: string, apiKey?: string, session?: string) {
    this.baseUrl = baseUrl || env.wahaBaseUrl;
    this.apiKey = apiKey || env.wahaApiKey;
    this.session = session || env.wahaSession;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  async sendSticker(chatId: string, stickerBuffer: Buffer): Promise<void> {
    const formData = new FormData();
    const blob = new Blob([stickerBuffer], { type: 'image/webp' });
    formData.append('sticker', blob, 'sticker.webp');

    const response = await fetch(
      `${this.baseUrl}/api/sendSticker/${this.session}`,
      {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey },
        body: formData,
      }
    );

    if (!response.ok) {
      logger.error('WAHA sendSticker failed', { chatId, status: response.status });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send sticker via WAHA');
    }

    logger.info('Sticker sent via WAHA', { chatId });
  }

  async sendImage(chatId: string, imageBuffer: Buffer, mimetype: string): Promise<void> {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: mimetype });
    formData.append('image', blob, 'image');

    const response = await fetch(
      `${this.baseUrl}/api/sendImage/${this.session}`,
      {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send image via WAHA');
    }
  }

  async sendText(chatId: string, text: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/sendText/${this.session}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ chatId, text }),
      }
    );

    if (!response.ok) {
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send text via WAHA');
    }
  }

  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    try {
      await fetch(
        `${this.baseUrl}/api/sendReaction/${this.session}`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ chatId, messageId, reaction: emoji }),
        }
      );
    } catch {
      // Reaction is optional, ignore failures
    }
  }
}
