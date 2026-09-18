/**
 * SafeExternalImageFetcher — SSRF-hardened fetcher untuk URL gambar eksternal
 * yang tidak tepercaya (avatar, profile picture, dst.).
 *
 * Kontrol keamanan:
 *  - Hanya terima URL http:// dan https://.
 *  - Resolve hostname → IP menggunakan dns.promises.lookup (Node built-in).
 *  - Tolak IP private / loopback / link-local / multicast / reserved.
 *  - Pin koneksi ke IP yang sudah divalidasi (via URL + `Host` header).
 *  - Batas ukuran body: MAX_BYTES (2MiB default).
 *  - Tolak Content-Type yang bukan `image/*`.
 *  - Tidak mengikuti redirect otomatis (redirect: 'manual').
 */

import dns from 'dns';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const FETCH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// RFC-1918 / loopback / special-purpose private ranges (IPv4 & IPv6 common).
// ---------------------------------------------------------------------------
const PRIVATE_RANGES_V4: [number, number][] = [
  // loopback
  [0x7f000000, 0xff000000],
  // RFC-1918
  [0x0a000000, 0xff000000],
  [0xac100000, 0xfff00000],
  [0xc0a80000, 0xffff0000],
  // link-local
  [0xa9fe0000, 0xffff0000],
  // IANA reserved / documentation
  [0xc0000000, 0xffffff00], // 192.0.0.0/24
  [0xc0000200, 0xffffff00], // 192.0.2.0/24 (TEST-NET-1)
  [0xc6336400, 0xffffff00], // 198.51.100.0/24 (TEST-NET-2)
  [0xcb007100, 0xffffff00], // 203.0.113.0/24 (TEST-NET-3)
  // Shared address space
  [0x64400000, 0xffc00000], // 100.64.0.0/10
  // Multicast
  [0xe0000000, 0xf0000000],
  // Broadcast / limited
  [0xffffffff, 0xffffffff],
  // 0.0.0.0/8
  [0x00000000, 0xff000000],
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  try {
    const n = ipv4ToInt(ip);
    return PRIVATE_RANGES_V4.some(([net, mask]) => (n & mask) >>> 0 === net >>> 0);
  } catch {
    return true; // fail-closed
  }
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/[\[\]]/g, '');
  if (lower === '::1') return true; // loopback
  // link-local fe80::/10
  if (/^fe[89ab]/i.test(lower)) return true;
  // unique-local fc00::/7
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // unspecified ::
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  // IPv4-mapped ::ffff:x.x.x.x
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.slice(7);
    if (v4part.includes('.')) return isPrivateIPv4(v4part);
    return true; // hex-form mapped address, reject
  }
  return false;
}

function isPrivateIP(ip: string, family: 4 | 6): boolean {
  return family === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchedImage {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Fetch gambar dari URL eksternal yang tidak tepercaya secara aman.
 * Mengembalikan null (bukan throw) bila URL tidak bisa diambil / tidak valid,
 * sehingga caller dapat fallback secara graceful.
 */
export async function fetchExternalImageSafe(
  rawUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number },
): Promise<FetchedImage | null> {
  // 1. Parse & validasi protokol
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const hostname = parsed.hostname;
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? MAX_BYTES;

  // 2. Resolve hostname → IP (DNS lookup menggunakan built-in Node dns)
  let resolvedIp: string;
  let family: 4 | 6;
  try {
    const result = await dns.promises.lookup(hostname, { verbatim: false });
    resolvedIp = result.address;
    family = result.family as 4 | 6;
  } catch {
    return null;
  }

  // 3. Tolak IP private / loopback (SSRF defense)
  if (isPrivateIP(resolvedIp, family)) {
    return null;
  }

  // 4. Pin koneksi ke IP yang sudah divalidasi
  const pinnedUrl = new URL(rawUrl);
  const originalHost = pinnedUrl.hostname;
  const originalPort = pinnedUrl.port;
  pinnedUrl.hostname = family === 6 ? `[${resolvedIp}]` : resolvedIp;
  if (originalPort) pinnedUrl.port = originalPort;

  const hostHeader = originalPort
    ? `${originalHost}:${originalPort}`
    : originalHost;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(pinnedUrl.toString(), {
      redirect: 'manual', // Tidak mengikuti redirect tanpa re-validasi
      headers: { Host: hostHeader },
      signal: controller.signal,
    });

    // 5. Tolak redirect
    if (response.status >= 300 && response.status < 400) {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    // 6. Validasi Content-Type
    const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      return null;
    }

    // 7. Baca body dengan batas byte
    if (!response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            return null;
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (totalBytes === 0) return null;

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { buffer, mimetype: contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
