import { execFile } from 'child_process';
import env from '../config/env';
import { logger } from '../observability/logger';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  codec?: string;
  pixelFormat?: string;
}

export function getFFmpegPath(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

export function getFFprobePath(): string {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

/**
 * Opsi runner child process.
 * - timeoutMs: budget ms untuk child process ini (harus SISA budget deadline, bukan budget baru).
 * - signal:    AbortSignal dari deadline; saat abort → child di-SIGKILL.
 */
export interface ChildProcessRunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Jalankan child process TANPA shell (execFile, tidak pernah shell:true) dengan:
 *  - timeout berbasis sisa budget deadline
 *  - AbortSignal → SIGKILL + konfirmasi exit
 *
 * INVARIANT (P0): Promise hanya settle SETELAH child benar-benar exit dan
 * callback stdio execFile selesai. Ini menjaga akurasi slot JobManager
 * (slot dilepas hanya setelah pekerjaan underlying benar-benar berhenti).
 */
export function runChildProcess(
  file: string,
  args: string[],
  options: ChildProcessRunOptions,
): Promise<{ stdout: string; stderr: string }> {
  const { timeoutMs, signal } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let timer: NodeJS.Timeout | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      if (settled) return;
      aborted = true;
      if (timer) clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore jika child sudah exit
      }
      // TIDAK reject di sini — reject hanya terjadi di callback execFile
      // setelah child terkonfirmasi exit (invariant di atas).
    };

    const child = execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      // Callback execFile hanya dipanggil setelah proses exit penuh + stdio ditutup.
      if (settled) return;
      settle(() => {
        if (timedOut || aborted || (err as any)?.killed || (err as any)?.code === 'ETIMEDOUT') {
          reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout'));
          return;
        }
        if (err) {
          reject(err);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      });
    });

    if (signal) {
      if (signal.aborted) {
        // Sudah expired sebelum start — langsung kill agar tidak ada kerja sia-sia.
        // Tetap tunggu callback 'error' execFile agar invariant tetap terpenuhi.
        aborted = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore jika sudah exit
      }
      // Reject tetap menunggu konfirmasi exit di callback execFile.
    }, Math.max(0, timeoutMs));

    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  });
}

/**
 * Backward-compatible wrapper. Gunakan runChildProcess dengan options object
 * untuk mendukung AbortSignal.
 */
export function runChildProcessWithTimeout(
  file: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return runChildProcess(file, args, { timeoutMs, signal });
}

export function runFfmpegWithTimeout(
  args: string[],
  timeoutMs: number = env.videoProcessingTimeoutMs,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return runChildProcess(getFFmpegPath(), args, { timeoutMs, signal });
}

export function runFfprobeWithTimeout(
  args: string[],
  timeoutMs: number = 5000,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return runChildProcess(getFFprobePath(), args, { timeoutMs, signal });
}

export async function getVideoMetadata(
  inputPath: string,
  timeoutMs: number = 5000,
  signal?: AbortSignal,
): Promise<VideoMetadata> {
  let stdout: string;
  try {
    const res = await runFfprobeWithTimeout([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ], timeoutMs, signal);
    stdout = res.stdout;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, `Gagal membaca metadata video: ${String(err)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Gagal parsing metadata video');
  }

  const stream = parsed.streams?.find((s: any) => s.codec_type === 'video');
  return {
    duration: Number(parsed.format?.duration) || 0,
    width: Number(stream?.width) || 0,
    height: Number(stream?.height) || 0,
    format: parsed.format?.format_name || 'unknown',
    codec: stream?.codec_name,
    pixelFormat: stream?.pix_fmt,
  };
}

export async function convertVideoToAnimatedWebp(
  inputPath: string,
  outputPath: string,
  maxWidth: number = 512,
  maxDurationSec: number = env.maxVideoDurationSeconds,
  fps: number = 15,
  timeoutMs: number = env.videoProcessingTimeoutMs,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await runFfmpegWithTimeout([
      '-y',
      '-loglevel', 'error',
      '-i', inputPath,
      '-vf', `scale=${maxWidth}:${maxWidth}:force_original_aspect_ratio=decrease`,
      '-t', String(maxDurationSec),
      '-r', String(fps),
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-quality', '80',
      '-loop', '0',
      '-delay', String(1000 / fps),
      '-an',
      outputPath,
    ], timeoutMs, signal);
    logger.info('Video converted to animated WebP');
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('FFmpeg conversion failed', { error: String(err) });
    throw err;
  }
}
