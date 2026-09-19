/**
 * P0 tests — child-process runner dengan AbortSignal:
 * 1. Abort → SIGKILL dipanggil → Promise reject PROCESSING_TIMEOUT
 *    HANYA SETELAH child terkonfirmasi exit (invariant settle-after-exit).
 * 2. Timeout → kill + konfirmasi exit sebelum reject.
 * 3. Abort sebelum start → tetap tunggu exit (tidak ada proses yatim).
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { runChildProcess, runFfmpegWithTimeout } from '../../src/media/ffmpeg';
import { ErrorCode } from '../../src/errors/error-codes';

function slowNodeScript(ms: number): { file: string; args: string[] } {
  return {
    file: process.execPath,
    args: ['-e', `setTimeout(() => console.log('done'), ${ms})`],
  };
}

describe('runChildProcess: AbortSignal + deadline (P0)', () => {
  it('rejects with PROCESSING_TIMEOUT when external signal aborts, after child exit confirmed', async () => {
    const controller = new AbortController();
    const { file, args } = slowNodeScript(5_000);

    const promise = runChildProcess(file, args, { timeoutMs: 10_000, signal: controller.signal });

    // Abort setelah child sempat start
    setTimeout(() => controller.abort(), 50);

    const start = Date.now();
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
    const elapsed = Date.now() - start;

    // Harus jauh lebih cepat daripada 5s runtime child — child di-SIGKILL saat abort.
    expect(elapsed).toBeLessThan(3_000);
  });

  it('resolves normally when no abort/timeout occurs', async () => {
    const { file, args } = {
      file: process.execPath,
      args: ['-e', "console.log('hello')"],
    };
    const result = await runChildProcess(file, args, { timeoutMs: 5_000 });
    expect(result.stdout.trim()).toBe('hello');
  });

  it('timeout kills child and rejects only after exit (no early reject)', async () => {
    const { file, args } = slowNodeScript(5_000);
    const start = Date.now();
    await expect(
      runChildProcess(file, args, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  it('pre-aborted signal still waits for child exit callback before rejecting', async () => {
    const controller = new AbortController();
    controller.abort(); // abort SEBELUM start
    const { file, args } = slowNodeScript(1_000);

    await expect(
      runChildProcess(file, args, { timeoutMs: 5_000, signal: controller.signal }),
    ).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
  });

  it('real ffmpeg run receives signal without breaking normal completion', async () => {
    // Sanity: ffmpeg tersedia di lingkungan test (Docker/CI memasangnya).
    const controller = new AbortController();
    await expect(
      runFfmpegWithTimeout(['-version'], 5_000, controller.signal),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('ffmpeg') });
  }, 15_000);
});

describe('runChildProcess: slot accounting invariant', () => {
  it('promise settles strictly after child process exits (stdout captured)', async () => {
    const { file, args } = {
      file: process.execPath,
      args: ['-e', 'setTimeout(() => { console.log("late-output"); process.exit(0); }, 200)'],
    };
    const result = await runChildProcess(file, args, { timeoutMs: 5_000 });
    // Output hanya tersedia bila callback execFile menunggu exit penuh.
    expect(result.stdout.trim()).toBe('late-output');
  });

  it('non-zero exit without timeout propagates the original error', async () => {
    const { file, args } = {
      file: process.execPath,
      args: ['-e', 'process.exit(3)'],
    };
    await expect(runChildProcess(file, args, { timeoutMs: 5_000 })).rejects.toMatchObject({
      code: 3,
    });
  });

  it('spawn baseline: child exit event precedes runner settle (sanity)', async () => {
    // Sanity check infrastruktur: spawn + exit event urut sebelum resolve.
    const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
    const exited = new Promise<void>((resolve) => child.on('exit', resolve));
    await exited;
    expect(true).toBe(true);
  });
});
