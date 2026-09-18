/**
 * DeadlineContext — helper untuk mengelola deadline end-to-end pada sebuah job.
 *
 * Menggabungkan:
 * - Internal AbortController dengan timer berdasarkan remaining budget
 * - External AbortSignal dari caller (best-effort merge, Node 20 compatible)
 *
 * Invariant: `cleanup()` HARUS dipanggil setelah task selesai agar timer dibersihkan.
 */

import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export interface DeadlineContext {
  /** AbortSignal yang sudah digabung (internal deadline + external signal). */
  readonly signal: AbortSignal;
  /** Timestamp Unix ms batas akhir. undefined bila tidak ada batas waktu. */
  readonly deadlineAt: number | undefined;

  /** Sisa waktu dalam ms. undefined bila tidak ada batas waktu. */
  remainingMs(): number | undefined;

  /** Throw PROCESSING_TIMEOUT AppError bila deadline sudah lewat. */
  throwIfExpired(): void;

  /** Bersihkan internal timer. Harus dipanggil di finally. */
  cleanup(): void;
}

class NoopDeadlineContext implements DeadlineContext {
  private readonly _controller = new AbortController();
  readonly deadlineAt = undefined;

  get signal(): AbortSignal {
    return this._controller.signal;
  }

  remainingMs(): undefined {
    return undefined;
  }

  throwIfExpired(): void {
    // Tidak ada deadline — tidak pernah expired
  }

  cleanup(): void {
    // Tidak ada timer untuk dibersihkan
  }
}

class TimedDeadlineContext implements DeadlineContext {
  readonly deadlineAt: number;
  private readonly _internal: AbortController;
  private _timer: NodeJS.Timeout | undefined;
  private _externalHandler: (() => void) | undefined;

  constructor(
    remainingMs: number,
    externalSignal?: AbortSignal,
  ) {
    this.deadlineAt = Date.now() + remainingMs;
    this._internal = new AbortController();

    // Set internal deadline timer
    this._timer = setTimeout(() => {
      if (!this._internal.signal.aborted) {
        this._internal.abort(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout'));
      }
    }, Math.max(0, remainingMs));

    if (typeof (this._timer as any).unref === 'function') {
      (this._timer as any).unref();
    }

    // Merge external signal: bila external abort → abort internal juga
    if (externalSignal && !externalSignal.aborted) {
      this._externalHandler = () => {
        if (!this._internal.signal.aborted) {
          this._internal.abort(externalSignal.reason ?? new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan'));
        }
      };
      externalSignal.addEventListener('abort', this._externalHandler, { once: true });
    } else if (externalSignal?.aborted) {
      // External signal already aborted
      this._internal.abort(externalSignal.reason ?? new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan'));
    }
  }

  get signal(): AbortSignal {
    return this._internal.signal;
  }

  remainingMs(): number | undefined {
    return Math.max(0, this.deadlineAt - Date.now());
  }

  throwIfExpired(): void {
    if (this._internal.signal.aborted || Date.now() >= this.deadlineAt) {
      throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout');
    }
  }

  cleanup(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    // Tidak perlu hapus event listener external secara eksplisit karena { once: true }
  }
}

/**
 * Buat DeadlineContext.
 *
 * @param remainingMs  Sisa budget dalam ms. Bila undefined/null/0, kembalikan noop (no deadline).
 * @param externalSignal  AbortSignal dari caller (opsional).
 */
export function createDeadline(
  remainingMs: number | undefined,
  externalSignal?: AbortSignal,
): DeadlineContext {
  if (!remainingMs || remainingMs <= 0) {
    return new NoopDeadlineContext();
  }
  return new TimedDeadlineContext(remainingMs, externalSignal);
}
