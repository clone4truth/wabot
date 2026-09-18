import fetch from 'node-fetch';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../observability/logger';

// Klien WAHA mengikuti docs resmi: POST /api/<action> dengan session di body JSON.
export class WAHAClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly session: string;

  constructor(baseUrl?: string, apiKey?: string, session?: string) {
    this.baseUrl = (baseUrl || env.wahaBaseUrl).replace(/\/$/, '');
    this.apiKey = apiKey || env.wahaApiKey;
    this.session = session || env.wahaSession;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async post(path: string, body: Record<string, unknown>, action: string, chatId: string): Promise<any> {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId, ...body }),
      });
    } catch (err) {
      logger.error(`WAHA ${action} request failed`, { chatId, error: String(err) });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      logger.error(`WAHA ${action} failed`, { chatId, status: response.status, responseBody: responseBody.slice(0, 300) });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
    }

    return response.json().catch(() => ({}));
  }

  async sendSticker(chatId: string, stickerBuffer: Buffer): Promise<void> {
    await this.post('/api/sendSticker', {
      file: {
        mimetype: 'image/webp',
        filename: 'sticker.webp',
        data: stickerBuffer.toString('base64'),
      },
    }, 'sendSticker', chatId);
    logger.info('Sticker sent via WAHA', { chatId });
  }

  async sendImage(chatId: string, imageBuffer: Buffer, mimetype: string): Promise<void> {
    const ext = mimetype.includes('png') ? 'png' : mimetype.includes('jpeg') || mimetype.includes('jpg') ? 'jpeg' : 'webp';
    await this.post('/api/sendImage', {
      file: {
        mimetype,
        filename: `image.${ext}`,
        data: imageBuffer.toString('base64'),
      },
    }, 'sendImage', chatId);
    logger.info('Image sent via WAHA', { chatId });
  }

  async sendText(chatId: string, text: string): Promise<void> {
    await this.post('/api/sendText', { text }, 'sendText', chatId);
  }

  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.post('/api/sendReaction', { messageId, reaction: emoji }, 'sendReaction', chatId);
    } catch {
      // Reaction is optional, ignore failures
    }
  }
}
