import Sharp from 'sharp';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import env from '../../../config/env';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';

// MIME allowlist yang diterima dari BG removal API response.
// Tidak menggunakan image/* karena SVG, GIF, dll tidak valid sebagai input stiker.
const ALLOWED_RESPONSE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Allowed actual Sharp format dari response.
const ALLOWED_RESPONSE_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ApiBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'api';

  validateUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'BACKGROUND_REMOVAL_API_URL tidak valid');
    }
    // BG API bisa berupa localhost/internal — tidak diblokir seperti avatar public.
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
    const callerSignal = options?.signal;

    const controller = new AbortController();

    // Merge caller signal: bila caller abort → abort request ini
    let externalHandler: (() => void) | undefined;
    if (callerSignal && !callerSignal.aborted) {
      externalHandler = () => controller.abort();
      callerSignal.addEventListener('abort', externalHandler, { once: true });
    } else if (callerSignal?.aborted) {
      controller.abort();
    }

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

      // Validasi MIME: hanya jpeg, png, webp (bukan image/*)
      const rawContentType = (response.headers.get('content-type') || '').toLowerCase();
      const contentType = rawContentType.split(';')[0].trim();
      if (contentType && !ALLOWED_RESPONSE_MIMES.has(contentType)) {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          `Tipe konten API background removal tidak valid (${contentType}). Hanya jpeg/png/webp diizinkan.`,
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

      // Validasi dengan Sharp: gunakan limitInputPixels untuk mencegah pixel bomb.
      const maxPixels = env.backgroundRemovalMaxPixels || 25_000_000;
      let metadata: Sharp.Metadata;
      try {
        metadata = await Sharp(rawBuffer, {
          failOn: 'warning',
          limitInputPixels: maxPixels,
        }).metadata();
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

      // Validasi format aktual (bukan hanya MIME header)
      if (metadata.format && !ALLOWED_RESPONSE_FORMATS.has(metadata.format)) {
        throw new AppError(
          ErrorCode.MEDIA_DECODE_FAILED,
          `Format aktual gambar BG removal tidak valid: ${metadata.format}`,
        );
      }

      const resultBuffer = await Sharp(rawBuffer)
        .ensureAlpha()
        .png()
        .toBuffer();

      return resultBuffer;
    } catch (err: any) {
      if (err.name === 'AbortError' || err?.code === 'ABORT_ERR') {
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
      if (externalHandler && callerSignal) {
        callerSignal.removeEventListener('abort', externalHandler);
      }
    }
  }
}
