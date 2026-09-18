import { describe, it, expect } from 'vitest';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { BatchStickerService } from '../../src/stickers/batch/batch.service';
import { ErrorCode } from '../../src/errors/error-codes';

describe('JobManager', () => {
  it('executes job successfully with QUEUED -> PROCESSING -> DONE lifecycle', async () => {
    const manager = new JobManager({ image: 2 });
    let stateDuringRun = '';

    const promise = manager.execute('image', 'user-hash-1', async () => {
      const active = manager.getActiveJobs('user-hash-1');
      stateDuringRun = active[0]?.status;
      await new Promise((r) => setTimeout(r, 20));
      return 'done';
    });

    const activeAtStart = manager.getActiveJobs('user-hash-1');
    expect(['QUEUED', 'PROCESSING']).toContain(activeAtStart[0]?.status);

    const result = await promise;
    expect(result).toBe('done');
    expect(stateDuringRun).toBe('PROCESSING');

    const activeAtEnd = manager.getActiveJobs('user-hash-1');
    expect(activeAtEnd.length).toBe(0);
  });

  it('handles job failure and records FAILED status while freeing slot', async () => {
    const manager = new JobManager({ image: 1 });

    await expect(
      manager.execute('image', 'user-1', async () => {
        throw new Error('processing-error');
      })
    ).rejects.toThrow('processing-error');

    // Slot is freed, next job can run
    const res = await manager.execute('image', 'user-1', async () => 'next-ok');
    expect(res).toBe('next-ok');
  });

  it('respects concurrency limit per queue type', async () => {
    const manager = new JobManager({ image: 2 });
    let currentActive = 0;
    let maxObserved = 0;

    const task = async () => {
      currentActive++;
      if (currentActive > maxObserved) maxObserved = currentActive;
      await new Promise((r) => setTimeout(r, 30));
      currentActive--;
    };

    await Promise.all([
      manager.execute('image', 'u1', task),
      manager.execute('image', 'u2', task),
      manager.execute('image', 'u3', task),
      manager.execute('image', 'u4', task),
    ]);

    expect(maxObserved).toBe(2);
  });

  it('cancels queued job before processing', async () => {
    const manager = new JobManager({ image: 1 });

    // Block slot with a running task
    let releaseBlock: () => void;
    const blocking = manager.execute('image', 'u1', () => {
      return new Promise<void>((r) => {
        releaseBlock = r;
      });
    });

    // Second task will be QUEUED
    let taskRan = false;
    const queuedPromise = manager.execute('image', 'u1', async () => {
      taskRan = true;
    });

    const active = manager.getActiveJobs('u1');
    const queuedJob = active.find((j) => j.status === 'QUEUED');
    expect(queuedJob).toBeDefined();

    const cancelled = manager.cancelJob(queuedJob!.jobId);
    expect(cancelled).toBe(true);

    releaseBlock!();
    await blocking;

    await expect(queuedPromise).rejects.toThrow();
    expect(taskRan).toBe(false);
  });

  it('isolates active jobs by ownerHash', async () => {
    const manager = new JobManager({ video: 2 });

    let resolveJobs: () => void;
    const p1 = manager.execute('video', 'owner-A', () => new Promise<void>((r) => { resolveJobs = r; }));
    const p2 = manager.execute('video', 'owner-B', () => new Promise<void>((r) => { /* wait */ }));

    expect(manager.getActiveJobs('owner-A').length).toBe(1);
    expect(manager.getActiveJobs('owner-B').length).toBe(1);
    expect(manager.getActiveJobs().length).toBe(2);

    resolveJobs!();
    await p1;
  });

  it('rejects job when queue is full with JOB_QUEUE_FULL', async () => {
    // 1 concurrent slot, maxQueue = 2
    const manager = new JobManager({ image: 1 }, { image: 2 });

    let unblock: () => void;
    // 1 active
    const p1 = manager.execute('image', 'u1', () => new Promise<void>((r) => { unblock = r; }));
    // 2 queued
    const p2 = manager.execute('image', 'u2', async () => 'q1');
    const p3 = manager.execute('image', 'u3', async () => 'q2');

    // 4th request -> overflow!
    await expect(
      manager.execute('image', 'u4', async () => 'overflow')
    ).rejects.toMatchObject({
      code: ErrorCode.JOB_QUEUE_FULL,
      message: expect.stringContaining('Antrean sedang penuh'),
    });

    unblock!();
    await Promise.all([p1, p2, p3]);
  });

  it('cancels queued job automatically when queue wait timeout expires', async () => {
    const manager = new JobManager({ image: 1 });

    let unblock: () => void;
    const blocking = manager.execute('image', 'u1', () => new Promise<void>((r) => { unblock = r; }));

    let executed = false;
    const queued = manager.execute(
      'image',
      'u2',
      async () => {
        executed = true;
        return 'should-not-run';
      },
      { timeoutMs: 30 }
    );

    await expect(queued).rejects.toMatchObject({
      code: ErrorCode.PROCESSING_TIMEOUT,
    });
    expect(executed).toBe(false);

    unblock!();
    await blocking;
  });

  it('prunes completed jobs oldest-first and never prunes active jobs', () => {
    const manager = new JobManager({ image: 5 });

    // Manually add fake jobs to test pruning logic
    const baseDate = Date.now();
    for (let i = 0; i < 250; i++) {
      (manager as any).jobs.set(`job-${i}`, {
        jobId: `job-${i}`,
        type: 'image',
        ownerHash: `hash-${i}`,
        status: i === 249 ? 'PROCESSING' : 'DONE',
        createdAt: new Date(baseDate + i * 1000),
        finishedAt: new Date(baseDate + i * 1000 + 500),
      });
    }

    (manager as any).pruneOldJobs();

    // Completed jobs pruned to max 200 + active job retained
    expect((manager as any).jobs.size).toBeLessThanOrEqual(201);
    // Active job must be retained
    expect((manager as any).jobs.has('job-249')).toBe(true);
    // Oldest completed job (job-0) must be pruned
    expect((manager as any).jobs.has('job-0')).toBe(false);
  });

  it('load test: 100 image jobs with concurrency=4 and maxQueue=10 limits active<=4, queued<=10, rejects rest with JOB_QUEUE_FULL', async () => {
    const manager = new JobManager({ image: 4 }, { image: 10 });
    let unblockAll: () => void;
    const gate = new Promise<void>((resolve) => { unblockAll = resolve; });

    let activeCount = 0;
    let maxActiveSeen = 0;
    let completedCount = 0;
    let rejectedCount = 0;

    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 100; i++) {
      const p = manager.execute('image', `owner-${i % 10}`, async () => {
        activeCount++;
        if (activeCount > maxActiveSeen) maxActiveSeen = activeCount;
        await gate;
        activeCount--;
        completedCount++;
        return `done-${i}`;
      }).catch((err) => {
        if (err.code === ErrorCode.JOB_QUEUE_FULL) {
          rejectedCount++;
        } else {
          throw err;
        }
      });
      promises.push(p);
    }

    // Yield to let synchronous microtask rejections settle
    await new Promise((r) => setTimeout(r, 10));

    // Exactly 4 are active, 10 are queued in memory, and 86 were rejected immediately
    expect(maxActiveSeen).toBe(4);
    expect((manager as any).queues.image.length).toBe(10);
    expect(rejectedCount).toBe(86);

    // Unblock the active jobs so queued jobs can finish
    unblockAll!();
    await Promise.all(promises);

    // Total completed jobs should be 4 + 10 = 14
    expect(completedCount).toBe(14);
    expect(rejectedCount).toBe(86);
    expect(completedCount + rejectedCount).toBe(100);
  });
});

describe('BatchStickerService', () => {
  it('processes batch items with concurrency limit and maintains result order', async () => {
    const batchService = new BatchStickerService(10, 2);
    let active = 0;
    let maxActive = 0;

    const items = [
      { mediaUrl: 'url1' },
      { mediaUrl: 'url2' },
      { mediaUrl: 'url3' },
      { mediaUrl: 'url4' },
      { mediaUrl: 'url5' },
    ];

    const results = await batchService.process(items, async (item, idx) => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return `result-${item.mediaUrl}-${idx}`;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([
      'result-url1-0',
      'result-url2-1',
      'result-url3-2',
      'result-url4-3',
      'result-url5-4',
    ]);
  });

  it('rejects batch exceeding max items', async () => {
    const batchService = new BatchStickerService(3, 2);
    const items = [
      { mediaUrl: '1' },
      { mediaUrl: '2' },
      { mediaUrl: '3' },
      { mediaUrl: '4' },
    ];

    await expect(
      batchService.process(items, async () => 'ok')
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGUMENT,
    });
  });

  it('returns empty array when batch is empty', async () => {
    const batchService = new BatchStickerService();
    const results = await batchService.process([], async () => 'ok');
    expect(results).toEqual([]);
  });
});
