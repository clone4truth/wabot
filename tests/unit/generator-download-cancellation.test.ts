import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionGenerator } from '../../src/stickers/generators/caption.generator';
import { MemeGenerator } from '../../src/stickers/generators/meme.generator';
import { GeneratorInput } from '../../src/stickers/generators/types';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { downloadMedia } from '../../src/media/downloader';
import { ErrorCode } from '../../src/errors/error-codes';

vi.mock('../../src/media/downloader', () => ({ downloadMedia: vi.fn() }));

const context = { chatId: 'chat@c.us', senderId: 'sender@c.us' };
const generators = [
  { name: 'caption', generator: new CaptionGenerator(), input: { type: 'caption', text: 'Caption' } },
  { name: 'meme', generator: new MemeGenerator(), input: { type: 'meme', text: 'Atas | Bawah' } },
];

beforeEach(() => {
  vi.mocked(downloadMedia).mockReset();
  vi.mocked(downloadMedia).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) {
      reject(new Error('Download cancellation signal missing'));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
});

describe.each(generators)('$name download cancellation', ({ generator, input }) => {
  it('stops a stalled download at the job deadline and frees its processing slot', async () => {
    const manager = new JobManager({ image: 1 });
    const timeoutMs = 1_000;
    const pending = manager.execute('image', 'owner', (deadline) => {
      const effectiveInput: GeneratorInput = {
        ...input,
        mediaUrl: 'http://example.com/photo.png',
        timeoutMs: deadline?.remainingTimeoutMs,
        signal: deadline?.signal,
      };
      return generator.process(effectiveInput, context);
    }, { timeoutMs });

    await expect(pending).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
    const options = vi.mocked(downloadMedia).mock.calls[0][1];
    expect(options?.timeoutMs).toBeGreaterThan(0);
    expect(options?.timeoutMs).toBeLessThanOrEqual(timeoutMs);
    expect(options?.signal?.aborted).toBe(true);

    await expect(manager.execute('image', 'next-owner', async () => 'next job', { timeoutMs }))
      .resolves.toBe('next job');
  });
});
