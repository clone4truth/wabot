import env from '../../config/env';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from './types';
import { DisabledBackgroundRemovalProvider } from './providers/disabled.provider';
import { ApiBackgroundRemovalProvider } from './providers/api.provider';
import { LocalBackgroundRemovalProvider } from './providers/local.provider';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class BackgroundRemovalService {
  private provider: BackgroundRemovalProvider;

  constructor(customProvider?: BackgroundRemovalProvider) {
    if (customProvider) {
      this.provider = customProvider;
    } else {
      this.provider = this.resolveProvider(env.backgroundRemovalProvider);
    }
  }

  setProvider(provider: BackgroundRemovalProvider): void {
    this.provider = provider;
  }

  getProvider(): BackgroundRemovalProvider {
    return this.provider;
  }

  async removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer> {
    return this.provider.removeBackground(input, {
      timeoutMs: env.backgroundRemovalTimeoutMs,
      ...options,
    });
  }

  private resolveProvider(type: string): BackgroundRemovalProvider {
    switch (type.toLowerCase()) {
      case 'api':
        return new ApiBackgroundRemovalProvider();
      case 'local':
        return new LocalBackgroundRemovalProvider();
      case 'disabled':
      default:
        return new DisabledBackgroundRemovalProvider();
    }
  }
}

export const defaultBackgroundRemovalService = new BackgroundRemovalService();
