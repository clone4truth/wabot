import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveMediaUrl } from '../../src/media/downloader';
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
