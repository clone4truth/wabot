import Sharp from 'sharp';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import env from '../../../config/env';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';

export class ApiBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'api';

  validateUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'BACKGROUND_REMOVAL_API_URL tidak valid');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppError(
        ErrorCode.INVALID_ARGUMENT,
        'URL API background removal harus berprotokol http atau https',
      );
    }
    return parsed;
  }

  async removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer> {
    const apiUrl = env.backgroundRemovalApiUrl;
    if (!apiUrl) {
      throw new AppError(
        ErrorCode.FEATURE_DISABLED,
        'BACKGROUND_REMOVAL_API_URL belum dikonfigurasi.',
      );
    }

    this.validateUrl(apiUrl);

    const timeoutMs = options?.timeoutMs ?? env.backgroundRemovalTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
      };
      if (env.backgroundRemovalApiKey) {
        headers['Authorization'] = `Bearer ${env.backgroundRemovalApiKey}`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: input,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          `Background removal API error: HTTP ${response.status}`,
        );
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          `Tipe konten API background removal tidak valid (${contentType})`,
        );
      }

      const maxBytes = env.backgroundRemovalMaxResponseBytes || 20971520;
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      if (!response.body) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Body respons API kosong');
      }

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
              await reader.cancel();
              throw new AppError(
                ErrorCode.MEDIA_TOO_LARGE,
                'Respons background removal API melebihi batas ukuran',
              );
            }
            chunks.push(Buffer.from(value));
          }
        }
      } finally {
        reader.releaseLock();
      }

      const rawBuffer = Buffer.concat(chunks);
      let metadata: Sharp.Metadata;
      try {
        metadata = await Sharp(rawBuffer).metadata();
      } catch {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          'Respons API background removal bukan gambar yang valid',
        );
      }

      if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          'Dimensi gambar dari API background removal tidak valid',
        );
      }

      const resultBuffer = await Sharp(rawBuffer)
        .ensureAlpha()
        .png()
        .toBuffer();

      return resultBuffer;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AppError(
          ErrorCode.PROCESSING_TIMEOUT,
          'Background removal API timeout',
        );
      }
      if (err instanceof AppError) throw err;
      throw new AppError(
        ErrorCode.MEDIA_DECODE_FAILED,
        `Gagal memproses background removal via API: ${String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
