import Sharp from 'sharp';
import { randomUUID } from 'crypto';
import { VideoResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { getVideoMetadata, runFfmpegWithTimeout } from '../../media/ffmpeg';
import env from '../../config/env';
import fs from 'fs';
import path from 'path';

export class ToGifProcessor {
  async process(stickerBuffer: Buffer, timeoutMs: number = env.videoProcessingTimeoutMs): Promise<VideoResult> {
    let meta;
    try {
      meta = await Sharp(stickerBuffer).metadata();
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Format media tidak didukung atau rusak');
    }

    if (meta.format !== 'webp') {
      throw new AppError(
        ErrorCode.UNSUPPORTED_STICKER_TYPE,
        'Reply sticker animasi lalu gunakan !togif',
        { userMessage: '❌ Reply sticker animasi lalu gunakan !togif.' },
      );
    }

    const pages = meta.pages ?? 1;
    if (pages <= 1) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_STICKER_TYPE,
        'Sticker static. Gunakan !toimg',
        { userMessage: '❌ Sticker static. Gunakan !toimg.' },
      );
    }

    // Ekstrak delay tiap frame dari metadata WebP (default 100ms bila tidak tersedia)
    const delays: number[] = Array.isArray(meta.delay) && meta.delay.length > 0
      ? meta.delay.map((d: number) => (typeof d === 'number' && d > 0 ? d : 100))
      : Array.from({ length: pages }, () => 100);

    while (delays.length < pages) {
      delays.push(delays[delays.length - 1] ?? 100);
    }

    // Sampling frame bila pages > 30, akumulasi durasi frame yang dilewati agar durasi total tetap akurat
    const MAX_FRAMES = 30;
    interface FramePlan {
      pageIndex: number;
      durationSec: number;
    }
    const framePlans: FramePlan[] = [];

    if (pages <= MAX_FRAMES) {
      for (let i = 0; i < pages; i++) {
        framePlans.push({
          pageIndex: i,
          durationSec: Math.max(0.02, delays[i] / 1000),
        });
      }
    } else {
      const sampledIndices = Array.from({ length: MAX_FRAMES }, (_, k) =>
        Math.min(pages - 1, Math.round((k * (pages - 1)) / (MAX_FRAMES - 1))),
      );

      for (let k = 0; k < MAX_FRAMES; k++) {
        const startIdx = sampledIndices[k];
        const nextIdx = k < MAX_FRAMES - 1 ? sampledIndices[k + 1] : pages;
        let aggregatedDelayMs = 0;
        for (let j = startIdx; j < nextIdx; j++) {
          aggregatedDelayMs += delays[j];
        }
        if (aggregatedDelayMs <= 0) {
          aggregatedDelayMs = delays[startIdx] || 100;
        }

        framePlans.push({
          pageIndex: startIdx,
          durationSec: Math.max(0.02, aggregatedDelayMs / 1000),
        });
      }
    }

    const workdir = path.join(env.tempDir, `togif-${randomUUID()}`);
    fs.mkdirSync(workdir, { recursive: true });
    const outputPath = createTempFile('.mp4');

    try {
      const concatLines: string[] = [];
      for (let i = 0; i < framePlans.length; i++) {
        const plan = framePlans[i];
        const frameFileName = `${i}.png`;
        const framePath = path.join(workdir, frameFileName);
        const png = await Sharp(stickerBuffer, { page: plan.pageIndex }).png().toBuffer();
        await fs.promises.writeFile(framePath, png);

        concatLines.push(`file '${frameFileName}'`);
        concatLines.push(`duration ${plan.durationSec.toFixed(4)}`);
      }

      // Quirks concat demuxer FFmpeg: ulangi file terakhir agar durasi frame terakhir ditampilkan penuh
      if (framePlans.length > 0) {
        const lastFileName = `${framePlans.length - 1}.png`;
        concatLines.push(`file '${lastFileName}'`);
      }

      const concatFilePath = path.join(workdir, 'frames.txt');
      await fs.promises.writeFile(concatFilePath, concatLines.join('\n'));

      await runFfmpegWithTimeout([
        '-y',
        '-loglevel', 'error',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        outputPath,
      ], timeoutMs);

      const outMeta = await getVideoMetadata(outputPath);
      if (
        !outMeta.format.toLowerCase().includes('mp4') ||
        outMeta.codec !== 'h264' ||
        outMeta.width <= 0 || outMeta.width > 512 ||
        outMeta.height <= 0 || outMeta.height > 512 ||
        outMeta.duration <= 0
      ) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Output MP4 tidak valid');
      }

      const mp4Buffer = await fs.promises.readFile(outputPath).catch(() => {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      });
      if (mp4Buffer.length === 0) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      }

      return {
        buffer: mp4Buffer,
        mimetype: 'video/mp4',
        width: outMeta.width,
        height: outMeta.height,
        animated: true,
        size: mp4Buffer.length,
      };
    } finally {
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      cleanupTempFile(outputPath);
    }
  }
}
