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

  it('exact origin: hanya origin WAHA persis yang lolos', () => {
    expect(isAllowedOrigin('https://waha.example.com/a')).toBe(true);
    expect(isAllowedOrigin('http://waha.example.com/a')).toBe(false);
    expect(isAllowedOrigin('https://waha.example.com:8443/a')).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:3000/a')).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000/a')).toBe(false);
    expect(isAllowedOrigin('https://evil.com/a')).toBe(false);
    expect(isAllowedOrigin('bukan-url')).toBe(false);
  });

  it('localhost tidak di-whitelist setelah rewrite (rewrite dulu, validasi final)', () => {
    // resolveMediaUrl menulis ulang loopback -> base, lalu exact-check final URL.
    expect(isAllowedOrigin(resolveMediaUrl('http://localhost:3000/api/files/a.jpg'))).toBe(true);
  });

  it('allowlist bekerja untuk base URL ber-port (regresi host-vs-hostname)', () => {
    env.wahaBaseUrl = 'http://localhost:3001';
    expect(isAllowedOrigin('http://localhost:3001/api/files/a.jpg')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3002/api/files/a.jpg')).toBe(false);
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


describe('downloadMedia size limits + redirect SSRF', () => {
  let server: http.Server;
  let baseUrl: string;
  let savedBase: string;
  let savedKey: string;
  let savedImgMax: number;
  let savedVidMax: number;

  const jpeg = (size: number) => {
    const buf = Buffer.alloc(size);
    Buffer.from([0xff, 0xd8, 0xff]).copy(buf, 0);
    return buf;
  };
  const mp4 = (size: number) => {
    const buf = Buffer.alloc(size);
    buf.write('ftyp', 4);
    return buf;
  };
  const portOf = (url: string) => new URL(url).port;

  beforeAll(async () => {
    savedBase = env.wahaBaseUrl;
    savedKey = env.wahaApiKey;
    savedImgMax = env.maxImageBytes;
    savedVidMax = env.maxVideoBytes;
    env.maxImageBytes = 100;
    env.maxVideoBytes = 200;
    server = http.createServer((req, res) => {
      if (req.url === '/img100.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': 100 }); res.end(jpeg(100)); }
      else if (req.url === '/img101.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(jpeg(101)); }
      else if (req.url === '/vid200.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': 200 }); res.end(mp4(200)); }
      else if (req.url === '/vid201.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(mp4(201)); }
      else if (req.url === '/huge.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': 99999 }); res.end(jpeg(50)); }
      else if (req.url === '/redir') { res.writeHead(302, { Location: '/img100.jpg' }); res.end(); }
      else if (req.url === '/rel') { res.writeHead(302, { Location: 'img100.jpg' }); res.end(); }
      else if (req.url === '/redir-evil') { res.writeHead(302, { Location: 'http://evil.invalid/x.jpg' }); res.end(); }
      else if (req.url === '/redir-scheme') { res.writeHead(302, { Location: `https://localhost:${portOf(baseUrl)}/img100.jpg` }); res.end(); }
      else if (req.url === '/redir-port') { res.writeHead(302, { Location: 'http://localhost:1/img100.jpg' }); res.end(); }
      else if (req.url === '/redir-local') { res.writeHead(302, { Location: `http://127.0.0.1:${portOf(baseUrl)}/img100.jpg` }); res.end(); }
      else if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); res.end(); }
      else { res.writeHead(404); res.end('{}'); }
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
    env.wahaBaseUrl = baseUrl;
    env.wahaApiKey = 'k';
  });

  afterAll(async () => {
    env.wahaBaseUrl = savedBase;
    env.wahaApiKey = savedKey;
    env.maxImageBytes = savedImgMax;
    env.maxVideoBytes = savedVidMax;
    await new Promise((r) => server.close(r));
  });

  it('image pas limit lolos, +1 ditolak', async () => {
    const ok = await downloadMedia(`${baseUrl}/img100.jpg`);
    expect(ok.size).toBe(100);
    await expect(downloadMedia(`${baseUrl}/img101.jpg`)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
  });

  it('video pas limit lolos, +1 ditolak', async () => {
    const ok = await downloadMedia(`${baseUrl}/vid200.mp4`);
    expect(ok.size).toBe(200);
    await expect(downloadMedia(`${baseUrl}/vid201.mp4`)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
  });

  it('Content-Length raksasa ditolak sebelum download', async () => {
    await expect(downloadMedia(`${baseUrl}/huge.jpg`)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
  });

  it('batas produksi riil: image 15MB+ dan video 20MB+ ditolak', async () => {
    env.maxImageBytes = 15 * 1024 * 1024;
    env.maxVideoBytes = 20 * 1024 * 1024;
    const bigJpg = (size: number) => {
      const buf = Buffer.alloc(size);
      Buffer.from([0xff, 0xd8, 0xff]).copy(buf, 0);
      return buf;
    };
    const bigMp4 = (size: number) => {
      const buf = Buffer.alloc(size);
      buf.write('ftyp', 4);
      return buf;
    };
    const srv = http.createServer((req, res) => {
      if (req.url === '/big.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(bigJpg(15 * 1024 * 1024 + 1)); }
      else if (req.url === '/big.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(bigMp4(20 * 1024 * 1024 + 1)); }
      else { res.writeHead(404); res.end('{}'); }
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as AddressInfo).port;
    const savedBase = env.wahaBaseUrl;
    env.wahaBaseUrl = `http://localhost:${port}`;
    try {
      await expect(downloadMedia(`${env.wahaBaseUrl}/big.jpg`)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
      await expect(downloadMedia(`${env.wahaBaseUrl}/big.mp4`)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    } finally {
      env.wahaBaseUrl = savedBase;
      await new Promise((r) => srv.close(r));
    }
  }, 120000);

  it('scheme non-http ditolak', async () => {
    await expect(downloadMedia('file:///etc/passwd')).rejects.toThrow(/SSRF/);
    await expect(downloadMedia('ftp://x/y.jpg')).rejects.toThrow(/SSRF/);
  });

  it('redirect se-origin + relatif diikuti', async () => {
    expect((await downloadMedia(`${baseUrl}/redir`)).size).toBe(100);
    expect((await downloadMedia(`${baseUrl}/rel`)).size).toBe(100);
  });

  it('redirect ke evil + loop ditolak', async () => {
    await expect(downloadMedia(`${baseUrl}/redir-evil`)).rejects.toThrow(/SSRF|evil/);
    await expect(downloadMedia(`${baseUrl}/loop`)).rejects.toThrow(/redirect/i);
  });

  it('redirect beda scheme/port/loopback ditolak', async () => {
    await expect(downloadMedia(`${baseUrl}/redir-scheme`)).rejects.toThrow(/SSRF/);
    await expect(downloadMedia(`${baseUrl}/redir-port`)).rejects.toThrow(/SSRF/);
    await expect(downloadMedia(`${baseUrl}/redir-local`)).rejects.toThrow(/SSRF/);
  });
});
