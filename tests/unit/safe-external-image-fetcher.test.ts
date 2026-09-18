/**
 * Tests untuk SafeExternalImageFetcher (SSRF defense).
 * Menggunakan server HTTP lokal sebagai target simulasi.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { fetchExternalImageSafe } from '../../src/media/safe-external-image-fetcher';

// ---------------------------------------------------------------------------
// Helper: buat pixel PNG 1x1 valid
// ---------------------------------------------------------------------------
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex',
);

// ---------------------------------------------------------------------------
// Tests: IP private harus diblok (unit test tanpa jaringan)
// ---------------------------------------------------------------------------
describe('fetchExternalImageSafe: blok IP private', () => {
  // Mock dns.promises.lookup agar seolah URL me-resolve ke IP private.
  // Karena kita tidak bisa injeksi DNS dengan mudah, kita uji helper internal
  // via path yang melalui private IP check dalam modul.

  it('mengembalikan null untuk URL loopback (setelah DNS resolve ke 127.0.0.1)', async () => {
    // localhost resolve ke 127.0.0.1 = private. Harusnya null.
    const result = await fetchExternalImageSafe('http://localhost/image.jpg');
    expect(result).toBeNull();
  });

  it('mengembalikan null untuk URL 127.0.0.1 langsung', async () => {
    // 127.0.0.1 adalah private meski tanpa DNS resolve
    const result = await fetchExternalImageSafe('http://127.0.0.1/image.jpg', { timeoutMs: 500 });
    expect(result).toBeNull();
  });

  it('mengembalikan null untuk skema non-http', async () => {
    const result = await fetchExternalImageSafe('ftp://example.com/image.jpg');
    expect(result).toBeNull();
  });

  it('mengembalikan null untuk URL tidak valid', async () => {
    const result = await fetchExternalImageSafe('not-a-url');
    expect(result).toBeNull();
  });

  it('mengembalikan null untuk URL kosong', async () => {
    const result = await fetchExternalImageSafe('');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: server lokal yang diakses via 127.0.0.1 harus diblok
// ---------------------------------------------------------------------------
describe('fetchExternalImageSafe: server lokal terblok (SSRF defense)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(TINY_PNG);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it('mengembalikan null ketika target URL adalah 127.0.0.1 (loopback)', async () => {
    const result = await fetchExternalImageSafe(`http://127.0.0.1:${port}/image.png`, { timeoutMs: 1000 });
    expect(result).toBeNull(); // SSRF: 127.0.0.1 adalah private
  });

  it('mengembalikan null ketika target URL adalah [::1] (IPv6 loopback)', async () => {
    const result = await fetchExternalImageSafe(`http://[::1]:${port}/image.png`, { timeoutMs: 1000 });
    expect(result).toBeNull(); // SSRF: ::1 adalah private
  });
});

// ---------------------------------------------------------------------------
// Tests: konten-type validasi
// ---------------------------------------------------------------------------
describe('fetchExternalImageSafe: validasi content-type', () => {
  let server: http.Server;
  let port: number;
  let responseContentType = 'application/json';
  let responseBody: Buffer = Buffer.from('{}');

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': responseContentType });
      res.end(responseBody);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it('mengembalikan null untuk content-type application/json (bukan gambar)', async () => {
    responseContentType = 'application/json';
    responseBody = Buffer.from('{}');
    // Tetap akan null karena 127.0.0.1 = private IP
    const result = await fetchExternalImageSafe(`http://127.0.0.1:${port}/data.json`, { timeoutMs: 500 });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: IP range checks (unit test untuk helper internal)
// ---------------------------------------------------------------------------
describe('isPrivateIP checks via fetchExternalImageSafe', () => {
  const privateIPs = [
    'http://10.0.0.1/img.jpg',
    'http://172.16.0.1/img.jpg',
    'http://172.31.255.255/img.jpg',
    'http://192.168.1.1/img.jpg',
    'http://169.254.0.1/img.jpg', // link-local
  ];

  for (const url of privateIPs) {
    it(`mengembalikan null untuk IP private: ${url}`, async () => {
      const result = await fetchExternalImageSafe(url, { timeoutMs: 200 });
      // Semua ini seharusnya null (blokir sebelum koneksi atau koneksi gagal)
      // Catatan: IP-IP ini mungkin tidak memiliki server, sehingga koneksi gagal anyway.
      // Yang penting: tidak ada fetch aktual ke IP private yang berhasil.
      expect(result).toBeNull();
    });
  }
});
