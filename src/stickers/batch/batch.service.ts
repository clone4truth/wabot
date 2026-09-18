import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export interface BatchItem {
  mediaUrl: string;
  modifier?: string;
  [key: string]: unknown;
}

export class BatchStickerService {
  private maxItems: number;
  private concurrency: number;

  constructor(maxItems: number = env.batchMaxItems, concurrency: number = env.batchConcurrency) {
    this.maxItems = maxItems;
    this.concurrency = concurrency;
  }

  async process<T>(
    items: BatchItem[],
    processFn: (item: BatchItem, index: number) => Promise<T>
  ): Promise<T[]> {
    if (items.length === 0) return [];
    if (items.length > this.maxItems) {
      throw new AppError(
        ErrorCode.INVALID_ARGUMENT,
        `Maksimal ${this.maxItems} item per batch`
      );
    }

    const results: T[] = new Array(items.length);
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < items.length) {
        const i = nextIdx++;
        results[i] = await processFn(items[i], i);
      }
    };

    const workerCount = Math.min(this.concurrency, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }
}

export const defaultBatchStickerService = new BatchStickerService();
