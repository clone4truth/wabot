import { randomUUID } from 'crypto';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

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

interface QueuedTask<T> {
  jobId: string;
  ownerHash: string;
  type: JobType;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class JobManager {
  private limits: Record<JobType, number>;
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

  constructor(customLimits?: Partial<Record<JobType, number>>) {
    this.limits = {
      image: customLimits?.image ?? env.maxImageJobs,
      video: customLimits?.video ?? env.maxVideoJobs,
      animation: customLimits?.animation ?? env.maxAnimationJobs,
      background: customLimits?.background ?? env.maxBackgroundJobs,
    };
  }

  async execute<T>(type: JobType, ownerHash: string, task: () => Promise<T>): Promise<T> {
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
      this.queues[type].push({
        jobId,
        ownerHash,
        type,
        task,
        resolve,
        reject,
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
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'QUEUED') {
      const q = this.queues[job.type];
      const idx = q.findIndex((t) => t.jobId === jobId);
      if (idx !== -1) {
        const [task] = q.splice(idx, 1);
        job.status = 'CANCELLED';
        job.finishedAt = new Date();
        task.reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan'));
        return true;
      }
    }
    return false;
  }

  private pump(type: JobType): void {
    const limit = this.limits[type];
    while (this.activeCount[type] < limit && this.queues[type].length > 0) {
      const next = this.queues[type].shift();
      if (!next) break;

      const job = this.jobs.get(next.jobId);
      if (job && job.status === 'CANCELLED') {
        continue;
      }

      this.activeCount[type]++;
      if (job) {
        job.status = 'PROCESSING';
        job.startedAt = new Date();
      }

      next.task()
        .then((result) => {
          if (job) {
            job.status = 'DONE';
            job.finishedAt = new Date();
          }
          next.resolve(result);
        })
        .catch((err) => {
          if (job) {
            job.status = 'FAILED';
            job.finishedAt = new Date();
            job.errorCode = err?.code ?? err?.message ?? 'ERROR';
          }
          next.reject(err);
        })
        .finally(() => {
          this.activeCount[type]--;
          this.pump(type);
          this.pruneOldJobs();
        });
    }
  }

  private pruneOldJobs(): void {
    // Keep max 200 completed jobs in memory
    if (this.jobs.size > 200) {
      const keys = Array.from(this.jobs.keys());
      for (let i = 0; i < 50; i++) {
        const k = keys[i];
        const j = this.jobs.get(k);
        if (j && (j.status === 'DONE' || j.status === 'FAILED' || j.status === 'CANCELLED')) {
          this.jobs.delete(k);
        }
      }
    }
  }
}

export const defaultJobManager = new JobManager();
