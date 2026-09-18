import env from '../../config/env';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from './types';
import { DisabledBackgroundRemovalProvider } from './providers/disabled.provider';
import { ApiBackgroundRemovalProvider } from './providers/api.provider';
import { LocalBackgroundRemovalProvider } from './providers/local.provider';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class BackgroundRemovalService {
  private provider: BackgroundRemovalProvider;
  private activeJobs = 0;
  private queue: Array<() => void> = [];

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
    await this.acquireSlot();
    try {
      return await this.provider.removeBackground(input, {
        timeoutMs: env.backgroundRemovalTimeoutMs,
        ...options,
      });
    } finally {
      this.releaseSlot();
    }
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

  private acquireSlot(): Promise<void> {
    const limit = env.backgroundRemovalConcurrency;
    if (this.activeJobs < limit) {
      this.activeJobs++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.activeJobs++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeJobs--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export const defaultBackgroundRemovalService = new BackgroundRemovalService();
