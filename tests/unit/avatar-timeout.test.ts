/**
 * Focused tests — avatar network timeout pada PRODUCTION transport
 * (defaultSafeFetcherDeps.request).
 *
 * Contract: timeoutMs adalah SATU wall-clock limit total jaringan:
 * connect/TLS + headers + body ≤ timeoutMs. Timer dimulai sebelum request,
 * TIDAK di-clear saat headers tiba, tetap aktif selama body streaming,
 * menghancurkan request saat habis, dan di-clear pada selesai/gagal.
 *
 * Strategi: spy pada https.request (module singleton yang sama dipakai kode
 * produksi) lalu drive fake req/res EventEmitter — perilaku timeout nyata
 * (setTimeout + destroy) dieksekusi tanpa jaringan sungguhan. Fake timers
 * menjaga tes tetap cepat.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import https from 'node:https';
import Sharp from 'sharp';
import {
  fetchExternalImageSafe,
  defaultSafeFetcherDeps,
} from '../../src/media/safe-external-image-fetcher';

interface FakeReq extends EventEmitter {
  destroy: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroyedWith?: unknown;
}

function makeFakeReq(): FakeReq {
  const req = new EventEmitter() as FakeReq;
  req.destroy = vi.fn((err?: unknown) => {
    req.destroyedWith = err;
    // Mirror real Node teardown: req.destroy() saat response in-flight memicu
    // 'error' pada request DAN 'aborted'/'close' pada response stream.
    req.emit('error', err ?? new Error('socket hang up'));
    if (currentRes) {
      currentRes.emit('aborted');
      currentRes.emit('close');
    }
  });
  req.end = vi.fn();
  return req;
}

interface FakeRes extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
}

function makeFakeRes(statusCode = 200, headers: Record<string, string> = {}): FakeRes {
  const res = new EventEmitter() as FakeRes;
  res.statusCode = statusCode;
  res.headers = headers;
  return res;
}

let requests: FakeReq[] = [];
let nextRes: FakeRes | null = null;
let currentRes: FakeRes | null = null;
let httpsSpy: ReturnType<typeof vi.spyOn> | null = null;
let lookupSpy: ReturnType<typeof vi.spyOn> | null = null;

/**
 * Pasang spy https.request + lookup publik. Bila makeRes mengembalikan res,
 * callback headers dipanggil via setImmediate (meniru jaringan).
 */
function stubTransport(makeRes: () => FakeRes | null): void {
  nextRes = null;
  currentRes = null;
  requests = [];
  httpsSpy = vi.spyOn(https, 'request').mockImplementation(((...args: any[]) => {
    const req = makeFakeReq();
    requests.push(req);
    const cb = args.find((a: any) => typeof a === 'function');
    const res = makeRes();
    if (cb && res) {
      nextRes = res;
      currentRes = res;
      setImmediate(() => (cb as Function)(res));
    }
    return req as any;
  }) as any);
  // lookup spy berlaku hanya dalam cakupan restoreAllMocks per-test.
  lookupSpy = vi
    .spyOn(defaultSafeFetcherDeps, 'lookup')
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
}

async function makeValidPng(): Promise<Buffer> {
  return Sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } },
  }).png().toBuffer();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (httpsSpy) httpsSpy.mockRestore();
  if (lookupSpy) lookupSpy.mockRestore();
  httpsSpy = null;
  lookupSpy = null;
});

const VALID_URL = 'https://93.184.216.34.example/img.png';

describe('avatar network timeout: production transport (total wall-clock)', () => {
  it('Test 1: server never sends response headers → request destroyed at timeout, fetch = null', async () => {
    stubTransport(() => null); // tidak pernah memanggil callback headers

    const promise = fetchExternalImageSafe(VALID_URL, { timeoutMs: 50, deps: defaultSafeFetcherDeps });
    const assertion = expect(promise).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(60);

    expect(requests.length).toBe(1);
    expect(requests[0].destroy).toHaveBeenCalled();
    expect(requests[0].destroyedWith).toBeInstanceOf(Error);
    expect((requests[0].destroyedWith as Error).message).toBe('Avatar network timeout');

    await assertion;
  });

  it('Test 2: headers received (200, image/png) but body stalls → destroyed at timeout, fetch = null', async () => {
    stubTransport(() => makeFakeRes(200, { 'content-type': 'image/png' }));

    const promise = fetchExternalImageSafe(VALID_URL, { timeoutMs: 50, deps: defaultSafeFetcherDeps });

    await vi.advanceTimersByTimeAsync(1); // headers tiba
    expect(requests.length).toBe(1);
    expect(requests[0].destroy).not.toHaveBeenCalled(); // belum timeout

    // Body TIDAK pernah emit 'end' — majukan melewati total timeout.
    await vi.advanceTimersByTimeAsync(60);

    expect(requests[0].destroy).toHaveBeenCalledTimes(1);
    expect(requests[0].destroyedWith).toBeInstanceOf(Error);
    expect((requests[0].destroyedWith as Error).message).toBe('Avatar network timeout');

    await expect(promise).resolves.toBeNull(); // tidak ada hanging Promise
  });

  it('Test 3: normal response finishing before timeout → success, timer cleared (no late destroy)', async () => {
    const validPng = await makeValidPng();
    stubTransport(() => makeFakeRes(200, { 'content-type': 'image/png' }));

    const promise = fetchExternalImageSafe(VALID_URL, { timeoutMs: 5_000, deps: defaultSafeFetcherDeps });
    await vi.advanceTimersByTimeAsync(1); // headers tiba

    // Body streaming lalu selesai — seperti server normal.
    (nextRes as unknown as EventEmitter).emit('data', validPng);
    (nextRes as unknown as EventEmitter).emit('end');

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result?.mimetype).toBe('image/png');

    // Timer di-clear saat body 'end': maju jauh melewati timeout tidak boleh
    // menghancurkan request yang sudah selesai.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests[0].destroy).not.toHaveBeenCalled();
  });

  it('Test 4: request error before headers clears timer (no leak) and fetch = null', async () => {
    stubTransport(() => null);

    const promise = fetchExternalImageSafe(VALID_URL, { timeoutMs: 5_000, deps: defaultSafeFetcherDeps });

    await vi.advanceTimersByTimeAsync(1);
    // Simulasi socket/TLS failure sebelum headers.
    requests[0].emit('error', new Error('ECONNRESET'));

    await expect(promise).resolves.toBeNull();

    // Timer sudah di-clear oleh error handler: maju melewati timeout tidak menembak.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests[0].destroy).not.toHaveBeenCalled();
  });

  it('Test 5: timeout covers connect + headers + body combined (no fresh budget after headers)', async () => {
    stubTransport(() => makeFakeRes(200, { 'content-type': 'image/png' }));

    const promise = fetchExternalImageSafe(VALID_URL, { timeoutMs: 100, deps: defaultSafeFetcherDeps });
    await vi.advanceTimersByTimeAsync(1); // headers tiba di ~1ms

    // Headers diterima pada 1ms, body stall → tetap dihancurkan pada 100ms TOTAL
    // (bukan 100ms tambahan setelah headers).
    await vi.advanceTimersByTimeAsync(98);
    expect(requests[0].destroy).not.toHaveBeenCalled(); // 100ms belum penuh

    await vi.advanceTimersByTimeAsync(1);
    expect(requests[0].destroy).toHaveBeenCalledTimes(1);

    await expect(promise).resolves.toBeNull();
  });
});
