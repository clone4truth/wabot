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

export function runChildProcessWithTimeout(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    const child = execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      // execFile callback only fires after the process has fully exited and stdio streams closed
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      if (timedOut || (err as any)?.killed || (err as any)?.code === 'ETIMEDOUT') {
        reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout'));
        return;
      }

      if (err) {
        reject(err);
        return;
      }

      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore if already exited
      }
    }, timeoutMs);

    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  });
}

export function runFfmpegWithTimeout(
  args: string[],
  timeoutMs: number = env.videoProcessingTimeoutMs,
): Promise<{ stdout: string; stderr: string }> {
  return runChildProcessWithTimeout(getFFmpegPath(), args, timeoutMs);
}

export function runFfprobeWithTimeout(
  args: string[],
  timeoutMs: number = 5000,
): Promise<{ stdout: string; stderr: string }> {
  return runChildProcessWithTimeout(getFFprobePath(), args, timeoutMs);
}

export async function getVideoMetadata(
  inputPath: string,
  timeoutMs: number = 5000,
): Promise<VideoMetadata> {
  let stdout: string;
  try {
    const res = await runFfprobeWithTimeout([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ], timeoutMs);
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
    ], timeoutMs);
    logger.info('Video converted to animated WebP');
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('FFmpeg conversion failed', { error: String(err) });
    throw err;
  }
}
