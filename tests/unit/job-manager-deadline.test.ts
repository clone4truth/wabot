/**
 * P0 regression tests — total-deadline semantics JobManager:
 * 1. Late success SETELAH deadline → harus PROCESSING_TIMEOUT, bukan DONE.
 * 2. Slot concurrency TIDAK dilepas sebelum underlying task benar-benar settle,
 *    sehingga task berikutnya tidak mulai lebih awal.
 * 3. Distingsi status: timeout saat QUEUED → CANCELLED; timeout saat PROCESSING
 *    → FAILED + errorCode PROCESSING_TIMEOUT.
 */

import { describe, it, expect } from 'vitest';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { ErrorCode } from '../../src/errors/error-codes';

describe('JobManager: late success after deadline (P0 mandatory)', () => {
  it('rejects late success with PROCESSING_TIMEOUT and job status != DONE', async () => {
    const manager = new JobManager({ image: 1 });
    let jobId = '';
    let finishedStatus = '';

    const promise = manager.execute(
      'image',
      'owner-late',
      async (ctx) => {
        // Task MEMBIARABAIKAN signal: tidak berhenti saat abort, hanya menunggu
        // 150ms lalu "berhasil". Ini mensimulasikan underlying work yang tidak
        // bisa dihentikan seketika.
        ctx?.signal?.addEventListener('abort', () => {
          // ignore — sengaja tidak melempar error
        });
        await new Promise((r) => setTimeout(r, 150));
        return 'success-too-late';
      },
      { timeoutMs: 50 },
    );

    promise.catch(() => {}); // hindari unhandled rejection
    // Ambil jobId dari job metadata
    await new Promise((r) => setTimeout(r, 10));

    await expect(promise).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });

    // Tunggu sedikit agar finally job metadata settle
    await new Promise((r) => setTimeout(r, 20));
    for (const job of (manager as any).jobs.values() as IterableIterator<any>) {
      if (job.ownerHash === 'owner-late') {
        jobId = job.jobId;
        finishedStatus = job.status;
      }
    }

    expect(finishedStatus).not.toBe('DONE');
    expect(finishedStatus).toBe('FAILED');
    const meta = manager.getJob(jobId);
    expect(meta?.errorCode).toBe(ErrorCode.PROCESSING_TIMEOUT);
  });

  it('second queued task does NOT start before first underlying task settles', async () => {
    const manager = new JobManager({ image: 1 });

    const events: string[] = [];

    // Task pertama: mengabaikan abort, settle pada ~150ms.
    const first = manager.execute(
      'image',
      'owner-a',
      async (ctx) => {
        events.push('first:start');
        ctx?.signal?.addEventListener('abort', () => {
          // ignore abort — simulate un-stoppable work
        });
        await new Promise((r) => setTimeout(r, 150));
        events.push('first:settle');
        return 'late';
      },
      { timeoutMs: 50 },
    );
    first.catch(() => {});

    // Task kedua: harus menunggu slot — dan slot baru bebas SETELAH task pertama settle.
    const second = manager.execute(
      'image',
      'owner-b',
      async () => {
        events.push('second:start');
        return 'ok';
      },
    );
    second.catch(() => {});

    // Beri waktu deadline task pertama expire (50ms) TANPA task pertama settle (150ms).
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toEqual(['first:start']); // task kedua belum boleh mulai
    expect(second).toBeDefined();

    await Promise.allSettled([first, second]);

    // Setelah semuanya selesai: task pertama settle dulu, baru task kedua mulai.
    expect(events.indexOf('first:settle')).toBeLessThan(events.indexOf('second:start'));
  });

  it('queued timeout keeps CANCELLED status, processing timeout records FAILED', async () => {
    const manager = new JobManager({ image: 1 });

    // Blocking job menahan slot.
    let unblock: () => void;
    const blocker = manager.execute('image', 'owner-q', () => new Promise<void>((r) => { unblock = r; }));
    blocker.catch(() => {});

    const queued = manager.execute('image', 'owner-q2', async () => 'never', { timeoutMs: 30 });
    await expect(queued).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });

    // Job QUEUED timeout → CANCELLED (bukan FAILED)
    const cancelledJob = Array.from((manager as any).jobs.values() as any[]).find(
      (j) => j.ownerHash === 'owner-q2',
    );
    expect(cancelledJob?.status).toBe('CANCELLED');

    unblock!();
    await blocker;
  });
});
