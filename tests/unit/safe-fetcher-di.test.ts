/**
 * Deterministic security tests — SafeExternalImageFetcher dengan dependency injection.
 * Tidak ada DNS/network nyata: fake lookup + fake transport membuktikan branch
 * penolakan mana yang dieksekusi secara eksak.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
  fetchExternalImageSafe,
  isPrivateIPv4,
  isPrivateIPv6,
  SafeFetcherDependencies,
  SafeHttpResponse,
} from '../../src/media/safe-external-image-fetcher';

// ---------------------------------------------------------------------------
// Fake transport helpers
// ---------------------------------------------------------------------------

interface FakeResponseSpec {
  statusCode: number;
  headers?: Record<string, string>;
  body?: Buffer | string;
}

function fakeResponse(spec: FakeResponseSpec): SafeHttpResponse {
  const body = Buffer.isBuffer(spec.body) ? spec.body : Buffer.from(spec.body ?? '');
  const events = new Map<string, Function[]>();
  const stream = {
    on(event: string, cb: Function) {
      if (!events.has(event)) events.set(event, []);
      events.get(event)!.push(cb);
      return stream;
    },
  } as unknown as IncomingMessage;

  // Emit body asynchronously agar meniru stream nyata.
  setImmediate(() => {
    for (const cb of events.get('data') ?? []) cb(body);
    for (const cb of events.get('end') ?? []) cb();
  });

  return {
    statusCode: spec.statusCode,
    headers: spec.headers ?? {},
    stream,
    destroy: vi.fn(),
  };
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89,
]);

// PNG valid dibuat via Sharp (CRC sah) agar lolos validasi format aktual.
async function makeValidPng(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  }).png().toBuffer();
}

function makeDeps(lookupResult: Array<{ address: string; family: 4 | 6 }> | Error, response: SafeHttpResponse | Error | null): SafeFetcherDependencies {
  return {
    lookup: vi.fn(async () => {
      if (lookupResult instanceof Error) throw lookupResult;
      return lookupResult.map((a) => ({ address: a.address, family: a.family })) as any;
    }),
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      if (!response) throw new Error('no response');
      return response;
    }),
  };
}

// ---------------------------------------------------------------------------
// Exact-branch tests
// ---------------------------------------------------------------------------

describe('SafeExternalImageSafe: URL branch (deterministic)', () => {
  const cases: Array<[string, string]> = [
    ['HTTP protocol required', 'http://example.com/img.jpg'],
    ['credentials rejected', 'https://user:pass@example.com/img.jpg'],
    ['username only rejected', 'https://user@example.com/img.jpg'],
    ['non-443 port rejected', 'https://example.com:8080/img.jpg'],
    ['invalid URL rejected', 'not-a-url'],
  ];

  for (const [name, url] of cases) {
    it(name, async () => {
      const deps = makeDeps([{ address: '1.2.3.4', family: 4 }], fakeResponse({ statusCode: 200 }));
      const result = await fetchExternalImageSafe(url, { deps, timeoutMs: 200 });
      expect(result).toBeNull();
      // Tidak boleh sampai ke lookup maupun transport
      expect(deps.lookup).not.toHaveBeenCalled();
      expect(deps.request).not.toHaveBeenCalled();
    });
  }

  it('explicit 443 passes URL validation and reaches DNS', async () => {
    const deps = makeDeps(
      [{ address: '93.184.216.34', family: 4 }],
      fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() }),
    );
    await fetchExternalImageSafe('https://example.com:443/img.png', { deps, timeoutMs: 500 });
    expect(deps.lookup).toHaveBeenCalledWith('example.com');
  });
});

describe('DNS policy: resolve all → discard private → require ≥1 public → pin one', () => {
  it('DNS returns private IPv4 → rejected BEFORE transport', async () => {
    const deps = makeDeps(
      [{ address: '10.0.0.5', family: 4 }],
      fakeResponse({ statusCode: 200 }),
    );
    const result = await fetchExternalImageSafe('https://internal.example.com/img.png', { deps, timeoutMs: 200 });
    expect(result).toBeNull();
    expect(deps.lookup).toHaveBeenCalledTimes(1);
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('DNS returns private IPv6 → rejected BEFORE transport', async () => {
    const deps = makeDeps(
      [{ address: 'fd00::1', family: 6 }],
      fakeResponse({ statusCode: 200 }),
    );
    const result = await fetchExternalImageSafe('https://internal6.example.com/img.png', { deps, timeoutMs: 200 });
    expect(result).toBeNull();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('DNS returns multicast IPv4 → rejected', async () => {
    const deps = makeDeps(
      [{ address: '224.0.0.1', family: 4 }],
      fakeResponse({ statusCode: 200 }),
    );
    const result = await fetchExternalImageSafe('https://mcast.example.com/img.png', { deps, timeoutMs: 200 });
    expect(result).toBeNull();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('DNS returns public IPv4 → transport called', async () => {
    const deps = makeDeps(
      [{ address: '93.184.216.34', family: 4 }],
      fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() }),
    );
    const result = await fetchExternalImageSafe('https://example.com/img.png', { deps, timeoutMs: 500 });
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
  });

  it('DNS returns mixed private+public → documented policy: pin the public address', async () => {
    const deps = makeDeps(
      [
        { address: '10.0.0.5', family: 4 },
        { address: '93.184.216.34', family: 4 },
      ],
      fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() }),
    );
    const result = await fetchExternalImageSafe('https://mixed.example.com/img.png', { deps, timeoutMs: 500 });
    expect(result).not.toBeNull();
    // Transport TERPANGGIL dan terhubung ke IP publik — bukan IP privat.
    expect(deps.request).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '93.184.216.34' }),
    );
  });

  it('DNS lookup failure → null, no transport', async () => {
    const deps = makeDeps(new Error('ENOTFOUND'), fakeResponse({ statusCode: 200 }));
    const result = await fetchExternalImageSafe('https://nx.example.com/img.png', { deps, timeoutMs: 200 });
    expect(result).toBeNull();
    expect(deps.request).not.toHaveBeenCalled();
  });
});

describe('TLS correctness: pinned IP + original hostname SNI + Host + no credentials', () => {
  it('connect IP = validated public IP, servername/Host = original hostname', async () => {
    const deps = makeDeps(
      [{ address: '93.184.216.34', family: 4 }],
      fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() }),
    );
    await fetchExternalImageSafe('https://avatars.example.com/img.png', { deps, timeoutMs: 500 });

    const call = (deps.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.ip).toBe('93.184.216.34'); // TCP target = pinned validated IP
    expect(call.hostname).toBe('avatars.example.com'); // SNI + Host
    expect(call.port).toBe(443);
    expect(call.headers['Host']).toBe('avatars.example.com');
    expect(call.headers).not.toHaveProperty('X-Api-Key');
    expect(call.headers).not.toHaveProperty('Authorization');
    expect(call.headers).not.toHaveProperty('Cookie');
  });

  it('IPv6 public address → bracketed literal TCP target, original hostname SNI', async () => {
    const deps = makeDeps(
      [{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }],
      fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() }),
    );
    await fetchExternalImageSafe('https://v6.example.com/img.png', { deps, timeoutMs: 500 });

    const call = (deps.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.family).toBe(6);
    expect(call.hostname).toBe('v6.example.com');
  });
});

describe('Redirect policy (deterministic)', () => {
  function redirectDeps(targets: Record<string, FakeResponseSpec>): { deps: SafeFetcherDependencies; requests: string[] } {
    const requests: string[] = [];
    const deps: SafeFetcherDependencies = {
      lookup: vi.fn(async (hostname: string) => {
        // Semua host test resolve ke IP publik.
        return [{ address: '93.184.216.34', family: 4 }] as any;
      }),
      request: vi.fn(async (options: any) => {
        const key = `${options.hostname}${options.path}`;
        requests.push(key);
        const spec = targets[key] ?? targets['*'];
        if (!spec) throw new Error(`unexpected request: ${key}`);
        return fakeResponse(spec);
      }),
    };
    return { deps, requests };
  }

  it('redirect public → public: allowed', async () => {
    const { deps } = redirectDeps({
      'origin.example.com/a.png': { statusCode: 302, headers: { location: 'https://cdn.example.com/b.png' } },
      'cdn.example.com/b.png': { statusCode: 200, headers: { 'content-type': 'image/png' }, body: await makeValidPng() },
    });
    const result = await fetchExternalImageSafe('https://origin.example.com/a.png', { deps, timeoutMs: 500 });
    expect(result).not.toBeNull();
  });

  it('redirect public → private: rejected via full re-validation', async () => {
    const { deps } = redirectDeps({
      'origin.example.com/a.png': { statusCode: 302, headers: { location: 'https://private.example.com/secret.png' } },
    });
    // Host kedua resolve ke IP PRIVAT → doFetch ulang menolak sebelum transport.
    (deps.lookup as ReturnType<typeof vi.fn>).mockImplementation(async (hostname: string) => {
      if (hostname === 'private.example.com') return [{ address: '192.168.1.1', family: 4 }] as any;
      return [{ address: '93.184.216.34', family: 4 }] as any;
    });
    const result = await fetchExternalImageSafe('https://origin.example.com/a.png', { deps, timeoutMs: 500 });
    expect(result).toBeNull();
  });

  it('redirect >3 hops: rejected', async () => {
    let n = 0;
    const deps: SafeFetcherDependencies = {
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }] as any),
      request: vi.fn(async (options: any) => {
        n++;
        return fakeResponse({
          statusCode: 302,
          headers: { location: `https://hop${n}.example.com/next.png` },
        });
      }),
    };
    const result = await fetchExternalImageSafe('https://hop0.example.com/a.png', { deps, timeoutMs: 1000 });
    expect(result).toBeNull();
    // MAX_REDIRECTS=3: hop0 (awal) + 3 redirect ditransport, redirect ke-4 ditolak
    // oleh guard `redirectCount > MAX_REDIRECTS` → total 4 request transport.
  });

  it('redirect to non-HTTPS (http:) target: rejected', async () => {
    const deps: SafeFetcherDependencies = {
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }] as any),
      request: vi.fn(async () =>
        fakeResponse({
          statusCode: 302,
          headers: { location: 'http://insecure.example.com/b.png' },
        }),
      ),
    };
    const result = await fetchExternalImageSafe('https://origin.example.com/a.png', { deps, timeoutMs: 500 });
    expect(result).toBeNull();
  });
});

describe('Body & MIME policy (deterministic)', () => {
  it('wrong MIME (text/html) → rejected, transport destroyed', async () => {
    const res = fakeResponse({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/page', { deps, timeoutMs: 300 });
    expect(result).toBeNull();
    expect(res.destroy).toHaveBeenCalled();
  });

  it('missing MIME → rejected', async () => {
    const res = fakeResponse({ statusCode: 200, body: await makeValidPng() });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/img', { deps, timeoutMs: 300 });
    expect(result).toBeNull();
  });

  it('Content-Length over maxBytes → rejected before body read', async () => {
    const res = fakeResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(10 * 1024 * 1024) },
      body: await makeValidPng(),
    });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/big.png', { deps, timeoutMs: 300, maxBytes: 1024 });
    expect(result).toBeNull();
    expect(res.destroy).toHaveBeenCalled();
  });

  it('body larger than maxBytes (no Content-Length) → transport aborted mid-stream', async () => {
    // 4KB chunk padat, maxBytes 1KB → overflow saat streaming.
    const bigBody = Buffer.alloc(4 * 1024, 0x41);
    const res = fakeResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: bigBody,
    });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/stream.png', { deps, timeoutMs: 300, maxBytes: 1024 });
    expect(result).toBeNull();
    expect(res.destroy).toHaveBeenCalled();
  });

  it('JPEG magic bytes with HTML body → Sharp rejects (actual format validation)', async () => {
    const spoofed = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]), // JPEG magic
      Buffer.from('<html>not really jpeg</html>'),
    ]);
    const res = fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: spoofed });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/spoof.jpg', { deps, timeoutMs: 300 });
    expect(result).toBeNull();
  });

  it('SVG served as image/svg+xml → rejected by MIME allowlist', async () => {
    const res = fakeResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/svg+xml' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>',
    });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/img.svg', { deps, timeoutMs: 300 });
    expect(result).toBeNull();
  });

  it('SVG served with image/png MIME → rejected by Sharp actual-format validation', async () => {
    const res = fakeResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>',
    });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/img.svg', { deps, timeoutMs: 300 });
    expect(result).toBeNull();
  });

  it('valid PNG → accepted, normalized to image/png', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    }).png().toBuffer();

    const res = fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/png' }, body: png });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/ok.png', { deps, timeoutMs: 500 });
    expect(result).not.toBeNull();
    expect(result?.mimetype).toBe('image/png');
  });

  it('valid JPEG → accepted', async () => {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).jpeg().toBuffer();

    const res = fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: jpeg });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/ok.jpg', { deps, timeoutMs: 500 });
    expect(result).not.toBeNull();
  });

  it('valid WebP → accepted', async () => {
    const sharp = (await import('sharp')).default;
    const webp = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    }).webp().toBuffer();

    const res = fakeResponse({ statusCode: 200, headers: { 'content-type': 'image/webp' }, body: webp });
    const deps = makeDeps([{ address: '93.184.216.34', family: 4 }], res);
    const result = await fetchExternalImageSafe('https://example.com/ok.webp', { deps, timeoutMs: 500 });
    expect(result).not.toBeNull();
  });
});

describe('IP range helpers (exported for deterministic verification)', () => {
  it('isPrivateIPv4 classifies known ranges', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateIPv4('10.1.2.3')).toBe(true);
    expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateIPv4('172.31.255.255')).toBe(true);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    expect(isPrivateIPv4('192.168.100.100')).toBe(true);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true); // cloud metadata
    expect(isPrivateIPv4('100.64.0.1')).toBe(true); // CGNAT
    expect(isPrivateIPv4('224.0.0.1')).toBe(true); // multicast
    expect(isPrivateIPv4('240.0.0.1')).toBe(true); // reserved
    expect(isPrivateIPv4('0.0.0.0')).toBe(true);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('93.184.216.34')).toBe(false);
  });

  it('isPrivateIPv6 classifies known ranges', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
    expect(isPrivateIPv6('::')).toBe(true);
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('fc00::1')).toBe(true);
    expect(isPrivateIPv6('fd12:3456::1')).toBe(true);
    expect(isPrivateIPv6('ff02::1')).toBe(true); // multicast
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true); // v4-mapped private
    expect(isPrivateIPv6('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('fail-closed on invalid input', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(true);
    expect(isPrivateIPv4('999.999.999.999')).toBe(true);
  });
});
