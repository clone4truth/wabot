import { randomUUID } from 'crypto';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { createDeadline } from './deadline';

export type JobType = 'image' | 'video' | 'animation' | 'background';
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED';

export interface JobMetadata {
  jobId: string;
  type: JobType;
  ownerHash: string;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  errorCode?: string;
}

export interface JobLimits {
  concurrency: number;
  maxQueue: number;
}

export interface ExecuteOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface QueuedTask<T> {
  jobId: string;
  ownerHash: string;
  type: JobType;
  task: (context?: { remainingTimeoutMs?: number; signal?: AbortSignal }) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
  queueTimer?: NodeJS.Timeout;
}

export class JobManager {
  private limits: Record<JobType, JobLimits>;
  private activeCount: Record<JobType, number> = {
    image: 0,
    video: 0,
    animation: 0,
    background: 0,
  };
  private queues: Record<JobType, Array<QueuedTask<any>>> = {
    image: [],
    video: [],
    animation: [],
    background: [],
  };
  private jobs = new Map<string, JobMetadata>();

  constructor(
    customConcurrency?: Partial<Record<JobType, number>>,
    customMaxQueue?: Partial<Record<JobType, number>>,
  ) {
    this.limits = {
      image: {
        concurrency: customConcurrency?.image ?? env.maxImageJobs,
        maxQueue: customMaxQueue?.image ?? env.maxImageQueue,
      },
      video: {
        concurrency: customConcurrency?.video ?? env.maxVideoJobs,
        maxQueue: customMaxQueue?.video ?? env.maxVideoQueue,
      },
      animation: {
        concurrency: customConcurrency?.animation ?? env.maxAnimationJobs,
        maxQueue: customMaxQueue?.animation ?? env.maxAnimationQueue,
      },
      background: {
        concurrency: customConcurrency?.background ?? env.maxBackgroundJobs,
        maxQueue: customMaxQueue?.background ?? env.maxBackgroundQueue,
      },
    };
  }

  async execute<T>(
    type: JobType,
    ownerHash: string,
    task: (context?: { remainingTimeoutMs?: number; signal?: AbortSignal }) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    const limits = this.limits[type];
    if (this.queues[type].length >= limits.maxQueue) {
      throw new AppError(ErrorCode.JOB_QUEUE_FULL, '⏳ Antrean sedang penuh. Coba lagi sebentar.');
    }

    if (options?.signal?.aborted) {
      throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan');
    }

    const jobId = randomUUID();
    const meta: JobMetadata = {
      jobId,
      type,
      ownerHash,
      status: 'QUEUED',
      createdAt: new Date(),
    };
    this.jobs.set(jobId, meta);

    return new Promise<T>((resolve, reject) => {
      let queueTimer: NodeJS.Timeout | undefined;
      if (options?.timeoutMs && options.timeoutMs > 0) {
        queueTimer = setTimeout(() => {
          this.cancelQueuedJob(jobId, new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Queue wait timeout'));
        }, options.timeoutMs);
        if (typeof (queueTimer as any).unref === 'function') (queueTimer as any).unref();
      }

      const abortHandler = () => {
        this.cancelQueuedJob(jobId, new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan'));
      };
      if (options?.signal) {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.queues[type].push({
        jobId,
        ownerHash,
        type,
        task,
        resolve: (val) => {
          if (options?.signal) options.signal.removeEventListener('abort', abortHandler);
          resolve(val);
        },
        reject: (err) => {
          if (options?.signal) options.signal.removeEventListener('abort', abortHandler);
          reject(err);
        },
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
        queueTimer,
      });

      this.pump(type);
    });
  }

  getJob(jobId: string): JobMetadata | undefined {
    return this.jobs.get(jobId);
  }

  getActiveJobs(ownerHash?: string): JobMetadata[] {
    const active: JobMetadata[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
        if (!ownerHash || job.ownerHash === ownerHash) {
          active.push(job);
        }
      }
    }
    return active;
  }

  cancelJob(jobId: string): boolean {
    return this.cancelQueuedJob(jobId);
  }

  private cancelQueuedJob(jobId: string, reason?: Error): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'QUEUED') {
      const q = this.queues[job.type];
      const idx = q.findIndex((t) => t.jobId === jobId);
      if (idx !== -1) {
        const [task] = q.splice(idx, 1);
        if (task.queueTimer) clearTimeout(task.queueTimer);
        job.status = 'CANCELLED';
        job.finishedAt = new Date();
        task.reject(reason ?? new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan'));
        return true;
      }
    }
    return false;
  }

  private pump(type: JobType): void {
    const limit = this.limits[type];
    while (this.activeCount[type] < limit.concurrency && this.queues[type].length > 0) {
      const next = this.queues[type].shift();
      if (!next) break;

      if (next.queueTimer) {
        clearTimeout(next.queueTimer);
        next.queueTimer = undefined;
      }

      const job = this.jobs.get(next.jobId);
      if (!job || job.status === 'CANCELLED') {
        continue;
      }

      const elapsed = Date.now() - job.createdAt.getTime();
      let remainingTimeoutMs: number | undefined;
      if (next.timeoutMs && next.timeoutMs > 0) {
        remainingTimeoutMs = next.timeoutMs - elapsed;
        if (remainingTimeoutMs <= 0) {
          job.status = 'CANCELLED';
          job.finishedAt = new Date();
          next.reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Queue wait timeout'));
          continue;
        }
      }

      this.activeCount[type]++;
      job.status = 'PROCESSING';
      job.startedAt = new Date();

      // Buat DeadlineContext dengan sisa budget yang tersisa setelah menunggu di queue.
      // Signal yang diteruskan ke task menggabungkan:
      //   - Internal deadline timer (remainingTimeoutMs)
      //   - External AbortSignal dari caller (jika ada)
      const deadline = createDeadline(remainingTimeoutMs, next.signal);

      next.task({ remainingTimeoutMs: deadline.remainingMs(), signal: deadline.signal })
        .then((result) => {
          job.status = 'DONE';
          job.finishedAt = new Date();
          next.resolve(result);
        })
        .catch((err) => {
          job.status = 'FAILED';
          job.finishedAt = new Date();
          job.errorCode = err?.code ?? err?.message ?? 'ERROR';
          next.reject(err);
        })
        .finally(() => {
          // Slot HANYA dilepas setelah task Promise benar-benar settle.
          // Ini memastikan concurrency accounting yang benar:
          // meski deadline sudah lewat, activeCount tidak berkurang
          // hingga underlying work selesai.
          deadline.cleanup();
          this.activeCount[type]--;
          this.pump(type);
          this.pruneOldJobs();
        });
    }
  }

  private pruneOldJobs(): void {
    const ttlMs = (env.jobHistoryTtlSeconds || 3600) * 1000;
    const now = Date.now();

    // 1. Delete completed jobs older than TTL
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'DONE' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        const finishedTime = (job.finishedAt ?? job.createdAt).getTime();
        if (now - finishedTime > ttlMs) {
          this.jobs.delete(id);
        }
      }
    }

    // 2. Retain max 200 completed jobs (oldest-first eviction)
    const completed: Array<{ id: string; time: number }> = [];
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'DONE' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        completed.push({ id, time: (job.finishedAt ?? job.createdAt).getTime() });
      }
    }

    if (completed.length > 200) {
      completed.sort((a, b) => a.time - b.time);
      const toDelete = completed.length - 200;
      for (let i = 0; i < toDelete; i++) {
        this.jobs.delete(completed[i].id);
      }
    }
  }
}

export const defaultJobManager = new JobManager();
