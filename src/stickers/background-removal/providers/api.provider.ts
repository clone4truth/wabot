import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import env from '../../../config/env';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';

export class ApiBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'api';

  async removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer> {
    const apiUrl = env.backgroundRemovalApiUrl;
    if (!apiUrl) {
      throw new AppError(
        ErrorCode.FEATURE_DISABLED,
        'BACKGROUND_REMOVAL_API_URL belum dikonfigurasi.'
      );
    }

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
          `Background removal API error: HTTP ${response.status}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AppError(
          ErrorCode.PROCESSING_TIMEOUT,
          'Background removal API timeout'
        );
      }
      if (err instanceof AppError) throw err;
      throw new AppError(
        ErrorCode.MEDIA_DECODE_FAILED,
        `Gagal memproses background removal via API: ${String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
