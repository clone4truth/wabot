import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { BackgroundRemovalOptions } from './types';

const MODEL_EDGE = 320;
const MODEL_PATH = path.resolve(__dirname, '../../../assets/background-removal/u2netp.onnx');

// A dedicated worker keeps CPU inference off the HTTP event loop. The WASM
// runtime also works on Alpine, without a native glibc/CUDA dependency.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const ort = require(workerData.runtimePath);
ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
let session;
parentPort.on('message', async (data) => {
  try {
    session ??= await ort.InferenceSession.create(fs.readFileSync(workerData.modelPath), {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      enableCpuMemArena: false, enableMemPattern: false,
    });
    const tensor = new ort.Tensor('float32', data, [1, 3, 320, 320]);
    const outputName = session.outputNames[0];
    const result = await session.run({ [session.inputNames[0]]: tensor }, [outputName]);
    const probabilities = result[outputName].data;
    let min = Infinity, max = -Infinity;
    for (const value of probabilities) { min = Math.min(min, value); max = Math.max(max, value); }
    const mask = new Uint8Array(320 * 320);
    const range = max - min;
    for (let i = 0; i < mask.length; i++) {
      mask[i] = range > 1e-6 ? Math.round(255 * (probabilities[i] - min) / range) : 0;
    }
    tensor.dispose();
    for (const value of Object.values(result)) value.dispose();
    parentPort.postMessage({ mask }, [mask.buffer]);
  } catch (error) {
    parentPort.postMessage({ error: String(error && error.message || error) });
  }
});
`;

let worker: Worker | undefined;
let idleTimer: NodeJS.Timeout | undefined;
let queue = Promise.resolve();

function timeoutError(): AppError {
  return new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Pemrosesan background dibatalkan atau melewati batas waktu');
}

async function runInference(data: Float32Array, options: BackgroundRemovalOptions, deadline: number): Promise<Buffer> {
  if (options.signal?.aborted || Date.now() >= deadline) throw timeoutError();
  if (idleTimer) clearTimeout(idleTimer);
  worker ??= new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: { runtimePath: require.resolve('onnxruntime-web'), modelPath: MODEL_PATH },
  });
  const activeWorker = worker;
  activeWorker.ref();

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const finish = async (error?: Error, mask?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      activeWorker.removeListener('message', onMessage);
      activeWorker.removeListener('error', onError);
      activeWorker.removeListener('exit', onExit);
      if (error) {
        if (worker === activeWorker) worker = undefined;
        // Await termination before the next queued task starts: a cancelled
        // inference must release its WASM heap rather than overlap its retry.
        await activeWorker.terminate();
        reject(error);
      } else {
        activeWorker.unref();
        idleTimer = setTimeout(() => {
          if (worker === activeWorker) worker = undefined;
          void activeWorker.terminate();
        }, 30_000);
        idleTimer.unref();
        resolve(Buffer.from(mask!));
      }
    };
    const onAbort = () => { void finish(timeoutError()); };
    const onMessage = (message: { mask?: Uint8Array; error?: string }) => {
      if (message.error || !message.mask || message.mask.length !== MODEL_EDGE * MODEL_EDGE) {
        void finish(new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Model lokal gagal memisahkan subjek gambar'));
      } else {
        void finish(undefined, message.mask);
      }
    };
    const onError = () => { void finish(new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Model background lokal tidak dapat dijalankan')); };
    const onExit = () => { void finish(new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Worker background berhenti sebelum gambar selesai')); };
    const timer = setTimeout(onAbort, Math.max(1, deadline - Date.now()));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    activeWorker.once('message', onMessage);
    activeWorker.once('error', onError);
    activeWorker.once('exit', onExit);
    if (options.signal?.aborted) onAbort();
    else activeWorker.postMessage(data, [data.buffer as ArrayBuffer]);
  });
}

/** Share one bounded CPU session even if callers construct several providers. */
export function inferForegroundMask(data: Float32Array, options: BackgroundRemovalOptions, deadline: number): Promise<Buffer> {
  const task = queue.then(() => runInference(data, options, deadline));
  queue = task.then(() => undefined, () => undefined);
  return task;
}

export { MODEL_EDGE };
