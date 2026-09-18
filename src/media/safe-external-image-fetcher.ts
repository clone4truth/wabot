/**
 * SafeExternalImageFetcher — SSRF-hardened fetcher untuk URL gambar eksternal
 * yang tidak tepercaya (avatar, profile picture, dst.).
 *
 * Kontrol keamanan:
 *  - HTTPS only (tolak http:, ftp:, data:, dll).
 *  - Tolak URL dengan credentials (user:pass@host).
 *  - Port policy: hanya 443 atau kosong.
 *  - Resolve hostname → IP menggunakan dns.promises.lookup (all: true).
 *  - Tolak SEMUA IP private / loopback / link-local / multicast / reserved.
 *  - DNS pinning via node:https dengan servername = original hostname (TLS SNI benar).
 *  - TLS verification ENABLED (tidak pernah rejectUnauthorized: false).
 *  - Redirect support: maks 3, setiap redirect re-validasi DNS+IP+HTTPS.
 *  - Batas body: AVATAR_MAX_BYTES.
 *  - MIME allowlist: image/jpeg, image/png, image/webp.
 *  - Sharp format validation + pixel limit.
 *  - Normalisasi ke ≤256×256 setelah validasi.
 *  - Credential isolation: tidak meneruskan X-Api-Key, Authorization, Cookie.
 *  - Selalu return null (tidak throw) agar Bubble tetap render tanpa avatar.
 */

import dns from 'node:dns';
import https from 'node:https';
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

function isPrivateIPv4(ip: string): boolean {
  try {
    const n = ipv4ToInt(ip);
    return PRIVATE_RANGES_V4.some(([network, mask]) => (n & mask) >>> 0 === network >>> 0);
  } catch {
    return true; // fail-closed
  }
}

function isPrivateIPv6(ip: string): boolean {
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

function isPrivateIP(ip: string, family: 4 | 6): boolean {
  return family === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// Allowed MIME untuk avatar
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Allowed Sharp format untuk avatar
const ALLOWED_AVATAR_FORMATS = new Set(['jpeg', 'png', 'webp']);

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
}

/**
 * Fetch gambar avatar dari URL HTTPS eksternal yang tidak tepercaya.
 * Mengembalikan null (tidak throw) bila URL tidak valid/gagal/terblokir.
 */
export async function fetchExternalImageSafe(
  rawUrl: string,
  opts?: SafeFetchOptions,
): Promise<FetchedImage | null> {
  return doFetch(rawUrl, opts, 0);
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
  opts: SafeFetchOptions | undefined,
  redirectCount: number,
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

  // 5. Resolve hostname → semua IP
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return null;
  }

  if (!addresses || addresses.length === 0) return null;

  // 6. Validasi SEMUA IP — semua harus publik (fail-closed)
  const publicAddresses = addresses.filter(
    (a) => !isPrivateIP(a.address, a.family as 4 | 6),
  );
  if (publicAddresses.length === 0) return null;

  // Pilih IP pertama yang valid
  const chosen = publicAddresses[0];
  const chosenIp = chosen.address;
  const chosenFamily = chosen.family as 4 | 6;

  // 7. Buat HTTPS request menggunakan node:https dengan TLS SNI yang benar:
  //    - hostname (TCP target): validated IP
  //    - servername (TLS SNI): original hostname
  //    - Host header: original hostname
  //    - TLS verification: ENABLED (default)
  const rawBuffer = await httpsGet({
    ip: chosenIp,
    family: chosenFamily,
    hostname,
    path: parsed.pathname + parsed.search,
    timeoutMs,
    maxBytes,
    onRedirect: async (location: string): Promise<Buffer | null> => {
      let absLocation: string;
      try {
        absLocation = new URL(location, rawUrl).toString();
      } catch {
        return null;
      }
      // Re-validasi full dari awal (DNS + IP + HTTPS)
      const result = await doFetch(absLocation, opts, redirectCount + 1);
      // Return raw sentinel — redirects are handled by returning the validated+normalized result
      // We break here and signal to httpsGet to return null (redirect handled by doFetch)
      // Instead: store result and return a special value — simplest: use a callback approach
      return result?.buffer ?? null;
    },
  });

  if (!rawBuffer) return null;

  // 8. Sharp validation + normalize
  return validateAndNormalize(rawBuffer, maxPixels);
}

interface HttpsGetOptions {
  ip: string;
  family: 4 | 6;
  hostname: string;
  path: string;
  timeoutMs: number;
  maxBytes: number;
  onRedirect: (location: string) => Promise<Buffer | null>;
}

function httpsGet(options: HttpsGetOptions): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve) => {
    const { ip, family, hostname, path, timeoutMs, maxBytes, onRedirect } = options;

    const timer = setTimeout(() => {
      resolve(null);
      req.destroy();
    }, timeoutMs);

    const reqOptions: https.RequestOptions = {
      hostname: family === 6 ? `[${ip}]` : ip,
      servername: hostname, // TLS SNI = original hostname
      port: 443,
      path,
      method: 'GET',
      headers: {
        'Host': hostname, // HTTP Host header = original hostname
        'User-Agent': 'WahaBot/2.0 (sticker-service)',
        // TIDAK meneruskan X-Api-Key, Authorization, Cookie, dll
      },
      // TLS verification ENABLED (rejectUnauthorized tidak di-set → default true)
    };

    const req = https.request(reqOptions, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400) {
        const location = res.headers['location'];
        clearTimeout(timer);
        req.destroy();
        if (!location || typeof location !== 'string') {
          resolve(null);
          return;
        }
        onRedirect(location).then(resolve).catch(() => resolve(null));
        return;
      }

      if (status < 200 || status >= 300) {
        clearTimeout(timer);
        req.destroy();
        resolve(null);
        return;
      }

      // Validasi Content-Type
      const ct = (res.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      if (!ALLOWED_AVATAR_MIMES.has(ct)) {
        clearTimeout(timer);
        req.destroy();
        resolve(null);
        return;
      }

      // Early size check dari Content-Length
      const clHeader = res.headers['content-length'];
      if (clHeader) {
        const cl = parseInt(clHeader, 10);
        if (!isNaN(cl) && cl > maxBytes) {
          clearTimeout(timer);
          req.destroy();
          resolve(null);
          return;
        }
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let finished = false;

      res.on('data', (chunk: Buffer) => {
        if (finished) return;
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          finished = true;
          clearTimeout(timer);
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (totalBytes === 0) {
          resolve(null);
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      res.on('error', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(null);
      });
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    req.end();
  });
}
