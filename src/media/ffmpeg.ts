import fs from 'fs';
import env from '../config/env';
import { logger } from '../observability/logger';
import { createTempFile } from './temp-files';

const ffmpeg = require('fluent-ffmpeg');

export async function getVideoMetadata(inputPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  format: string;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
      if (err) { reject(err); return; }
      const stream = metadata.streams?.find((s: any) => s.codec_type === 'video');
      resolve({
        duration: Number(metadata.format?.duration) || 0,
        width: Number(stream?.width) || 0,
        height: Number(stream?.height) || 0,
        format: metadata.format?.format_name || 'unknown',
      });
    });
  });
}

export async function convertVideoToAnimatedWebp(
  inputPath: string,
  outputPath: string,
  maxWidth: number = 512,
  maxDurationSec: number = env.maxVideoDurationSeconds,
  fps: number = 15
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${maxWidth}:-1:force_original_aspect_ratio=decrease`,
        `-t ${maxDurationSec}`,
        `-r ${fps}`,
        '-c:v libwebp',
        '-lossless 0',
        '-quality 80',
        '-loop 0',
        `-delay ${1000 / fps}`,
      ])
      .outputOptions(['-an'])
      .outputFormat('webp')
      .on('end', () => {
        logger.info('Video converted to animated WebP', { inputPath, outputPath });
        resolve();
      })
      .on('error', (err: Error) => {
        logger.error('FFmpeg conversion failed', { inputPath, error: String(err) });
        reject(err);
      })
      .save(outputPath);
  });
}

export function getFFmpegPath(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
