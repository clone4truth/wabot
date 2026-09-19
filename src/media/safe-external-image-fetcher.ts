/**
 * SafeExternalImageFetcher — SSRF-hardened fetcher untuk URL gambar eksternal
 * yang tidak tepercaya (avatar, profile picture, dst.).
 *
 * Kontrol keamanan:
 *  - HTTPS only (tolak http:, ftp:, data:, dll).
 *  - Tolak URL dengan credentials (user:pass@host).
 *  - Port policy: hanya 443 atau kosong.
 *  - Resolve hostname → IP (dns all:true), lalu terapkan DNS POLICY terdokumentasi:
 *        resolve semua alamat → buang non-publik → WAJIB ada ≥1 publik →
 *        pin SATU alamat publik tervalidasi untuk koneksi (DNS pinning).
 *  - DNS pinning via node:https dengan servername = original hostname (TLS SNI benar).
 *  - TLS verification ENABLED (tidak pernah rejectUnauthorized: false).
 *  - Redirect support: maks 3, setiap redirect re-validasi DNS+IP+HTTPS dari nol.
 *  - Batas body: AVATAR_MAX_BYTES (transport dihancurkan saat overflow).
 *  - MIME allowlist: image/jpeg, image/png, image/webp.
 *  - Sharp format validation + pixel limit.
 *  - Normalisasi ke ≤256×256 setelah validasi.
 *  - Credential isolation: tidak meneruskan X-Api-Key, Authorization, Cookie.
 *  - Selalu return null (tidak throw) agar pemanggil tetap render tanpa avatar.
 *
 * Dependency injection (untuk test deterministik — bukan bagian API user-facing):
 *  - deps.lookup   : default node:dns promises lookup
 *  - deps.request  : default node:https request
 */

import dns from 'node:dns';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import Sharp from 'sharp';
import env from '../config/env';

const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// RFC-1918 / loopback / special-purpose private ranges (IPv4).
// ---------------------------------------------------------------------------
const PRIVATE_RANGES_V4: [number, number][] = [
  [0x7f000000, 0xff000000], // 127.0.0.0/8 loopback
  [0x0a000000, 0xff000000], // 10.0.0.0/8 RFC-1918
  [0xac100000, 0xfff00000], // 172.16.0.0/12 RFC-1918
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16 RFC-1918
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 link-local
  [0xc0000000, 0xffffff00], // 192.0.0.0/24 IANA reserved
  [0xc0000200, 0xffffff00], // 192.0.2.0/24 TEST-NET-1
  [0xc6336400, 0xffffff00], // 198.51.100.0/24 TEST-NET-2
  [0xcb007100, 0xffffff00], // 203.0.113.0/24 TEST-NET-3
  [0x64400000, 0xffc00000], // 100.64.0.0/10 shared address
  [0xe0000000, 0xf0000000], // 224.0.0.0/4 multicast
  [0xf0000000, 0xf0000000], // 240.0.0.0/4 reserved
  [0xffffffff, 0xffffffff], // 255.255.255.255 broadcast
  [0x00000000, 0xff000000], // 0.0.0.0/8
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error('invalid ipv4');
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateIPv4(ip: string): boolean {
  try {
    const n = ipv4ToInt(ip);
    return PRIVATE_RANGES_V4.some(([network, mask]) => (n & mask) >>> 0 === network >>> 0);
  } catch {
    return true; // fail-closed
  }
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true; // unspecified
  if (/^fe[89ab]/i.test(lower)) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('ff')) return true; // multicast ff00::/8
  // IPv4-mapped ::ffff:x.x.x.x
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.slice(7);
    if (v4part.includes('.')) return isPrivateIPv4(v4part);
    return true; // hex-form mapped, reject
  }
  return false;
}

export function isPrivateIP(ip: string, family: 4 | 6): boolean {
  return family === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// Allowed MIME untuk avatar
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Allowed Sharp format untuk avatar
const ALLOWED_AVATAR_FORMATS = new Set(['jpeg', 'png', 'webp']);

// ---------------------------------------------------------------------------
// Injectable dependencies (produksi: node:dns + node:https; test: fake)
// ---------------------------------------------------------------------------

export interface SafeRequestOptions {
  /** IP publik tervalidasi — target TCP koneksi (DNS pinning). */
  ip: string;
  family: 4 | 6;
  /** Hostname ORIGINAL — dipakai sebagai TLS SNI (servername) & Host header. */
  hostname: string;
  port: number;
  path: string;
  headers: Record<string, string>;
  /**
   * Batas waktu TOTAL jaringan (ms) — satu wall-clock limit untuk seluruh siklus:
   * connect/TLS + menunggu response headers + membaca response body.
   * Tidak ada timeout baru setelah headers tiba; timer tetap aktif selama body
   * streaming dan menghancurkan koneksi saat habis.
   */
  timeoutMs: number;
  /** Batas byte body; transport harus dihancurkan bila terlampaui. */
  maxBytes: number;
}

export interface SafeHttpResponse {
  statusCode: number;
  headers: IncomingMessage['headers'];
  /** Stream body — dipakai via event 'data'/'end'/'error'. */
  stream: IncomingMessage;
  /** Hancurkan koneksi (abort transport). */
  destroy: () => void;
}

export interface SafeFetcherDependencies {
  lookup(hostname: string): Promise<dns.LookupAddress[]>;
  request(options: SafeRequestOptions): Promise<SafeHttpResponse>;
}

export const defaultSafeFetcherDeps: SafeFetcherDependencies = {
  async lookup(hostname: string): Promise<dns.LookupAddress[]> {
    return dns.promises.lookup(hostname, { all: true, verbatim: true });
  },
  request(options: SafeRequestOptions): Promise<SafeHttpResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;

      // TOTAL NETWORK TIMEOUT — satu timer wall-clock yang dimulai SEBELUM request
      // dan TETAP AKTIF selama body streaming. Tidak di-clear saat headers tiba,
      // sehingga server yang "accept TCP/TLS lalu tidak pernah merespons" maupun
      // "kirim headers lalu stall body" sama-sama terhenti tepat pada timeoutMs.
      // Contract: connect + headers + body ≤ timeoutMs (bukan masing-masing).
      const timer = setTimeout(() => {
        req.destroy(new Error('Avatar network timeout'));
      }, Math.max(0, options.timeoutMs));
      if (typeof (timer as any).unref === 'function') (timer as any).unref();

      const clearTimer = () => clearTimeout(timer);

      const req = https.request(
        {
          hostname: options.family === 6 ? `[${options.ip}]` : options.ip,
          servername: options.hostname, // TLS SNI = original hostname
          port: options.port,
          path: options.path,
          method: 'GET',
          headers: options.headers,
          // TLS verification ENABLED (rejectUnauthorized tidak di-set → default true)
        },
        (res) => {
          // Timer TIDAK di-clear di sini — body masih streaming dan harus tetap
          // tercakup dalam total timeout yang sama.
          res.once('end', clearTimer);      // body selesai normal
          res.once('close', clearTimer);    // koneksi tertutup
          res.once('aborted', clearTimer);  // response dibatalkan
          res.once('error', clearTimer);    // error pada response stream

          settled = true;
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            stream: res,
            destroy: () => {
              clearTimer();
              req.destroy();
            },
          });
        },
      );

      // Kegagalan sebelum headers (DNS sudah di luar; connect/TLS/socket error):
      // hentikan timer agar tidak ada handle yang bocor.
      req.once('error', (err) => {
        clearTimer();
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      req.end();
    });
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchedImage {
  buffer: Buffer;
  mimetype: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxPixels?: number;
  /** Internal: dependency injection untuk test deterministik. Bukan API user-facing. */
  deps?: SafeFetcherDependencies;
}

/**
 * Fetch gambar avatar dari URL HTTPS eksternal yang tidak tepercaya.
 * Mengembalikan null (tidak throw) bila URL tidak valid/gagal/terblokir.
 */
export async function fetchExternalImageSafe(
  rawUrl: string,
  opts?: SafeFetchOptions,
): Promise<FetchedImage | null> {
  return doFetch(rawUrl, opts ?? {}, 0, opts?.deps ?? defaultSafeFetcherDeps);
}

async function validateAndNormalize(
  raw: Buffer,
  maxPixels: number,
): Promise<FetchedImage | null> {
  let metadata: Sharp.Metadata;
  try {
    metadata = await Sharp(raw, {
      failOn: 'warning',
      limitInputPixels: maxPixels,
    }).metadata();
  } catch {
    return null;
  }

  if (!metadata.format || !ALLOWED_AVATAR_FORMATS.has(metadata.format)) return null;
  if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) return null;

  // Normalisasi ke ≤256×256
  let finalBuffer: Buffer;
  try {
    if (metadata.width > 256 || metadata.height > 256) {
      finalBuffer = await Sharp(raw)
        .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } else {
      finalBuffer = await Sharp(raw).png().toBuffer();
    }
  } catch {
    return null;
  }

  return { buffer: finalBuffer, mimetype: 'image/png' };
}

async function doFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
  redirectCount: number,
  deps: SafeFetcherDependencies,
): Promise<FetchedImage | null> {
  if (redirectCount > MAX_REDIRECTS) return null;

  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // 2. HTTPS only
  if (parsed.protocol !== 'https:') return null;

  // 3. Tolak URL credentials (user:pass@host)
  if (parsed.username || parsed.password) return null;

  // 4. Port policy: hanya 443 atau kosong
  const portStr = parsed.port;
  if (portStr && portStr !== '443') return null;

  const hostname = parsed.hostname;
  const maxBytes = opts?.maxBytes ?? env.avatarMaxBytes;
  const maxPixels = opts?.maxPixels ?? env.avatarMaxPixels;
  const timeoutMs = opts?.timeoutMs ?? 5_000;

  // 5. Resolve hostname → semua IP via injectable lookup
  let addresses: dns.LookupAddress[];
  try {
    addresses = await deps.lookup(hostname);
  } catch {
    return null;
  }

  if (!addresses || addresses.length === 0) return null;

  // 6. DNS POLICY (terdokumentasi, dipilih eksplisit):
  //    resolve semua → discard non-publik → wajib ≥1 publik → pin SATU alamat
  //    publik tervalidasi. (Bukan "semua IP harus publik"; mixed private/public
  //    DITERIMA dengan tetap memakai alamat publik tervalidasi saja.)
  const publicAddresses = addresses.filter(
    (a) => !isPrivateIP(a.address, a.family as 4 | 6),
  );
  if (publicAddresses.length === 0) return null;

  const chosen = publicAddresses[0];
  const chosenIp = chosen.address;
  const chosenFamily = chosen.family as 4 | 6;

  // 7. HTTPS request via injectable transport:
  //    - TCP target: validated public IP (DNS pinning)
  //    - TLS servername (SNI): original hostname
  //    - Host header: original hostname
  //    - TLS verification: ENABLED (default)
  //    - TIDAK meneruskan X-Api-Key / Authorization / Cookie
  const headers: Record<string, string> = {
    'Host': hostname,
    'User-Agent': 'WahaBot/2.0 (sticker-service)',
  };

  const response = await deps.request({
    ip: chosenIp,
    family: chosenFamily,
    hostname,
    port: 443,
    path: parsed.pathname + parsed.search,
    headers,
    timeoutMs,
    maxBytes,
  }).catch(() => null);

  if (!response) return null;

  const status = response.statusCode;

  // Redirect: re-validasi penuh (DNS+IP+HTTPS) pada target dari Location.
  if (status >= 300 && status < 400) {
    const location = response.headers['location'];
    response.destroy();
    if (!location || typeof location !== 'string') return null;
    let absLocation: string;
    try {
      absLocation = new URL(location, rawUrl).toString();
    } catch {
      return null;
    }
    return doFetch(absLocation, opts, redirectCount + 1, deps);
  }

  if (status < 200 || status >= 300) {
    response.destroy();
    return null;
  }

  // Validasi Content-Type (MIME allowlist)
  const ct = (response.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_AVATAR_MIMES.has(ct)) {
    response.destroy();
    return null;
  }

  // Early size check dari Content-Length
  const clHeader = response.headers['content-length'];
  if (clHeader) {
    const cl = parseInt(clHeader, 10);
    if (!isNaN(cl) && cl > maxBytes) {
      response.destroy();
      return null;
    }
  }

  // Baca body dengan batas byte aktual; hancurkan transport saat overflow.
  const rawBuffer = await readLimitedBody(response, maxBytes);
  if (!rawBuffer) return null;

  // 8. Sharp validation + normalize
  return validateAndNormalize(rawBuffer, maxPixels);
}

function readLimitedBody(
  response: SafeHttpResponse,
  maxBytes: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let finished = false;

    const finish = (value: Buffer | null) => {
      if (finished) return;
      finished = true;
      resolve(value);
    };

    response.stream.on('data', (chunk: Buffer) => {
      if (finished) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        response.destroy();
        finish(null); // transport aborted karena oversized
        return;
      }
      chunks.push(chunk);
    });

    response.stream.on('end', () => {
      if (finished) return;
      if (totalBytes === 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });

    response.stream.on('error', () => {
      if (finished) return;
      finish(null);
    });

    // Socket dihancurkan di tengah body (total network timeout / server abort):
    // pastikan Promise tetap settle — jangan biarkan fetch menggantung.
    response.stream.on('aborted', () => {
      if (finished) return;
      finish(null);
    });
    response.stream.on('close', () => {
      if (finished) return;
      finish(null);
    });
  });
}
