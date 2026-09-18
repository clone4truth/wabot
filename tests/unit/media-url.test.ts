import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import Sharp from 'sharp';
import { resolveMediaUrl, downloadMedia } from '../../src/media/downloader';
import { isAllowedOrigin } from '../../src/media/validator';
import env from '../../src/config/env';
// WAHA mengisi media.url dengan host lokalnya sendiri bila WAHA_BASE_URL
// sisi WAHA tidak diset publik -> bot harus menulis ulang origin-nya.
describe('Media URL (WAHA localhost rewrite + SSRF allowlist)', () => {
  let savedBase: string;

  beforeAll(() => {
    savedBase = env.wahaBaseUrl;
    env.wahaBaseUrl = 'https://waha.example.com';
  });

  afterAll(() => {
    env.wahaBaseUrl = savedBase;
  });

  it('menulis ulang localhost (+port) ke origin publik', () => {
    expect(resolveMediaUrl('http://localhost:3000/api/files/a.jpg')).toBe(
      'https://waha.example.com/api/files/a.jpg',
    );
    expect(resolveMediaUrl('http://127.0.0.1:3000/api/files/a.jpg')).toBe(
      'https://waha.example.com/api/files/a.jpg',
    );
  });

  it('tidak mengubah URL publik', () => {
    const url = 'https://waha.example.com/api/files/a.jpg';
    expect(resolveMediaUrl(url)).toBe(url);
  });

  it('URL rusak dikembalikan apa adanya', () => {
    expect(resolveMediaUrl('bukan-url')).toBe('bukan-url');
  });

  it('allowlist: host WAHA + loopback lolos, evil ditolak', () => {
    expect(isAllowedOrigin('https://waha.example.com/api/files/a.jpg')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000/api/files/a.jpg')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000/api/files/a.jpg')).toBe(true);
    expect(isAllowedOrigin('https://evil.com/x.jpg')).toBe(false);
    expect(isAllowedOrigin('bukan-url')).toBe(false);
  });

  it('allowlist bekerja untuk base URL ber-port (regresi host-vs-hostname)', () => {
    env.wahaBaseUrl = 'http://localhost:3001';
    expect(isAllowedOrigin('http://localhost:3001/api/files/a.jpg')).toBe(true);
    env.wahaBaseUrl = 'https://waha.example.com';
  });
});

describe('downloadMedia mengirim X-Api-Key (file WAHA butuh auth)', () => {
  let server: http.Server;
  let baseUrl: string;
  let savedBase: string;
  let savedKey: string;

  beforeAll(async () => {
    savedBase = env.wahaBaseUrl;
    savedKey = env.wahaApiKey;
    const img = await Sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 10, g: 200, b: 100 } },
    }).jpeg().toBuffer();
    server = http.createServer((req, res) => {
      if (req.url === '/api/files/a.jpg' && req.headers['x-api-key'] === 'test-key') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(img);
      } else {
        res.writeHead(401);
        res.end('{}');
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
    env.wahaBaseUrl = baseUrl;
    env.wahaApiKey = 'test-key';
  });

  afterAll(async () => {
    env.wahaBaseUrl = savedBase;
    env.wahaApiKey = savedKey;
    await new Promise((r) => server.close(r));
  });

  it('berhasil dengan API key yang benar', async () => {
    const result = await downloadMedia(`${baseUrl}/api/files/a.jpg`);
    expect(result.size).toBeGreaterThan(0);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('gagal 401 dengan API key salah (URL belum tercache)', async () => {
    env.wahaApiKey = 'salah';
    await expect(downloadMedia(`${baseUrl}/api/files/other.jpg`)).rejects.toThrow('401');
    env.wahaApiKey = 'test-key';
  });
});

describe('downloadMedia cache (hemat download berulang)', () => {
  let server: http.Server;
  let baseUrl: string;
  let savedBase: string;
  let savedKey: string;
  let savedDataDir: string;
  let hits = 0;

  beforeAll(async () => {
    savedBase = env.wahaBaseUrl;
    savedKey = env.wahaApiKey;
    savedDataDir = env.dataDir;
    const img = await Sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 9, g: 9, b: 9 } },
    }).jpeg().toBuffer();
    server = http.createServer((req, res) => {
      if (req.url === '/api/files/c.jpg' && req.headers['x-api-key'] === 'cache-key') {
        hits++;
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(img);
      } else {
        res.writeHead(401);
        res.end('{}');
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
    env.wahaBaseUrl = baseUrl;
    env.wahaApiKey = 'cache-key';
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    env.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediacache-'));
  });

  afterAll(async () => {
    env.wahaBaseUrl = savedBase;
    env.wahaApiKey = savedKey;
    env.dataDir = savedDataDir;
    await new Promise((r) => server.close(r));
  });

  it('download kedua URL sama -> cache hit tanpa hit jaringan', async () => {
    const first = await downloadMedia(`${baseUrl}/api/files/c.jpg`);
    const second = await downloadMedia(`${baseUrl}/api/files/c.jpg`);
    expect(hits).toBe(1);
    expect(second.size).toBe(first.size);
    expect(second.filePath).not.toBe(first.filePath);
  });
});
