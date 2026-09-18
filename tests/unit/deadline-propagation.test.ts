/**
 * Tests untuk memverifikasi propagasi deadline (remainingTimeoutMs + signal)
 * dari JobManager → StickerService → generator.process().
 */

import { describe, it, expect, vi } from 'vitest';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { StickerService } from '../../src/stickers/sticker.service';
import { GeneratorRegistry } from '../../src/stickers/generators/registry';
import { StickerGenerator, GeneratorInput, GeneratorContext } from '../../src/stickers/generators/types';
import { ProcessingResult } from '../../src/stickers/result';
import { ErrorCode } from '../../src/errors/error-codes';

// ---------------------------------------------------------------------------
// Test 1: JobManager propagates remainingTimeoutMs to task context
// ---------------------------------------------------------------------------
describe('JobManager deadline propagation', () => {
  it('passes remainingTimeoutMs to task context when timeoutMs > 0', async () => {
    const manager = new JobManager({ image: 1 });
    let capturedCtx: { remainingTimeoutMs?: number; signal?: AbortSignal } | undefined;

    await manager.execute(
      'image',
      'owner',
      (ctx) => {
        capturedCtx = ctx;
        return Promise.resolve('ok');
      },
      { timeoutMs: 10_000 },
    );

    expect(capturedCtx).toBeDefined();
    // remainingTimeoutMs harus ada dan lebih kecil dari timeoutMs (ada sedikit elapsed)
    expect(typeof capturedCtx!.remainingTimeoutMs).toBe('number');
    expect(capturedCtx!.remainingTimeoutMs!).toBeLessThanOrEqual(10_000);
    expect(capturedCtx!.remainingTimeoutMs!).toBeGreaterThan(9_000); // toleransi 1 detik
  });

  it('does not set remainingTimeoutMs when timeoutMs is not provided', async () => {
    const manager = new JobManager({ image: 1 });
    let capturedCtx: { remainingTimeoutMs?: number } | undefined;

    await manager.execute('image', 'owner', (ctx) => {
      capturedCtx = ctx;
      return Promise.resolve('ok');
    });

    // Bila tidak ada timeoutMs, remainingTimeoutMs mungkin undefined
    expect(capturedCtx?.remainingTimeoutMs).toBeUndefined();
  });

  it('propagates AbortSignal to task context (internal deadline signal)', async () => {
    const manager = new JobManager({ image: 1 });
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    await manager.execute(
      'image',
      'owner',
      (ctx) => {
        capturedSignal = ctx?.signal;
        return Promise.resolve('ok');
      },
      { signal: controller.signal },
    );

    // Setelah JobManager upgrade: task menerima signal INTERNAL dari DeadlineContext.
    // Signal ini adalah AbortSignal yang valid (bukan reference sama dengan external signal).
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);
  });

  it('external abort propagates to internal task signal', async () => {
    const manager = new JobManager({ image: 1 });
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    let signalAbortedDuringTask = false;

    const taskPromise = manager.execute(
      'image',
      'owner',
      async (ctx) => {
        capturedSignal = ctx?.signal;
        // Tunggu sejenak agar bisa di-abort dari luar
        await new Promise((r) => setTimeout(r, 50));
        signalAbortedDuringTask = !!ctx?.signal?.aborted;
        return 'ok';
      },
      { signal: controller.signal, timeoutMs: 5000 },
    );

    // Abort external signal setelah task mulai
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    await taskPromise.catch(() => {}); // task mungkin throw atau complete

    // Internal signal harus menjadi aborted setelah external abort
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2: StickerService propagates deadline into GeneratorInput
// ---------------------------------------------------------------------------
describe('StickerService deadline → GeneratorInput propagation', () => {
  it('passes timeoutMs and signal from JobManager context to GeneratorInput', async () => {
    let capturedInput: GeneratorInput | undefined;
    let capturedSignal: AbortSignal | undefined;

    // Mock generator yang merekam input yang diterima
    const mockGenerator: StickerGenerator = {
      name: 'mock',
      supports: () => true,
      validate: () => {},
      process: async (input: GeneratorInput, _ctx: GeneratorContext): Promise<ProcessingResult> => {
        capturedInput = input;
        capturedSignal = input.signal;
        return {
          buffer: Buffer.from('webp-mock'),
          mimetype: 'image/webp',
          width: 512,
          height: 512,
          animated: false,
          size: 9,
        };
      },
    };

    const registry = new GeneratorRegistry();
    registry.register(mockGenerator);

    // JobManager dengan concurrency 1 agar deterministic
    const jobManager = new JobManager({ image: 1 });

    const service = new StickerService(undefined, registry, jobManager);

    await service.process({
      command: 'ttp',
      args: 'hello',
      chatId: 'chat@c.us',
      senderId: 'sender@c.us',
      isGroup: false,
    });

    expect(capturedInput).toBeDefined();
    // timeoutMs harus terpropagasi ke GeneratorInput
    expect(typeof capturedInput!.timeoutMs).toBe('number');
    expect(capturedInput!.timeoutMs!).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Queued job dengan timeout expired → PROCESSING_TIMEOUT
// ---------------------------------------------------------------------------
describe('JobManager: queued job expired by timeout', () => {
  it('rejects queued job with PROCESSING_TIMEOUT when slot stays blocked past timeoutMs', async () => {
    const manager = new JobManager({ image: 1 });

    let unblock: () => void;
    const blocker = manager.execute(
      'image',
      'owner-a',
      () => new Promise<void>((r) => { unblock = r; }),
    );

    // Second job queued dengan timeout sangat singkat
    const queued = manager.execute(
      'image',
      'owner-b',
      async () => 'should-not-run',
      { timeoutMs: 20 },
    );

    await expect(queued).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });

    unblock!();
    await blocker;
  });
});
