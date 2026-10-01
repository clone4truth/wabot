import { randomBytes, timingSafeEqual, createHmac } from 'crypto';
import env from '../config/env';
import { JsonFileStore, getSharedStore } from '../storage/json-store';
import { MemoryRateLimiter } from './memory-rate-limiter';
import { hashIdentifier } from '../observability/privacy';

const SESSION_COOKIE = 'stb_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam
const SESSION_PREFIX = 'admin:session:';
const LOGIN_PREFIX = 'admin:login:';
// Batas percobaan login memakai angka sendiri, bukan USER_RATE_LIMIT — nilai itu
// diatur untuk chat WhatsApp dan tidak ada hubungannya dengan auth dashboard.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000;

/**
 * Auth dashboard admin: satu password dari env, session token acak yang disimpan
 * server-side, cookie HttpOnly.
 *
 * Kenapa bukan stateless JWT: tokennya bisa dicabut dari server (logout / ganti
 * password langsung berlaku), dan tidak ada secret yang perlu dibocorkan ke SPA.
 * Sifat cookie SameSite=Strict + Secure(production) membuat cookie tidak
 * dikirim lintas-situs, dan browser tidak akan mengirimnya ke request yang
 * dipicu situs lain (CSRF untuk state-changing request blocked oleh SameSite).
 */
export class AdminAuth {
  private readonly store: JsonFileStore;
  private readonly loginLimiter: MemoryRateLimiter;

  constructor(store?: JsonFileStore) {
    this.store = store ?? getSharedStore(env.dataDir);
    this.loginLimiter = new MemoryRateLimiter(10_000);
  }

  /** True bila dashboard boleh dibuka (password sudah dikonfigurasi). */
  isEnabled(): boolean {
    return env.adminPassword.length > 0;
  }

  /**
   * Bandingkan password dengan constant-time compare.
   * `timingSafeEqual` melempar error kalau panjang buffer beda, jadi samakan
   * panjang lebih dulu dengan hash.
   */
  private passwordMatches(candidate: string): boolean {
    const expected = createHmac('sha256', 'stb-compare').update(env.adminPassword).digest();
    const actual = createHmac('sha256', 'stb-compare').update(candidate).digest();
    return timingSafeEqual(expected, actual);
  }

  async login(password: string, clientKey: string): Promise<{ ok: boolean; reason?: string; token?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, reason: 'ADMIN_PASSWORD belum dikonfigurasi di environment.' };
    }

    const limitKey = `${LOGIN_PREFIX}${clientKey}`;

    // Rate limit per sumber (IP + user-agent), dengan batas sendiri.
    const consumed = await this.loginLimiter.consume(limitKey, 1, LOGIN_MAX_ATTEMPTS);
    if (!consumed.allowed) {
      const waitSec = Math.max(1, Math.ceil((consumed.resetAt - Date.now()) / 1000));
      return {
        ok: false,
        reason: `Terlalu banyak percobaan login. Coba lagi dalam ${waitSec} detik.`,
      };
    }

    if (!this.passwordMatches(password)) {
      return { ok: false, reason: 'Password salah.' };
    }

    // Berhasil → buang bucket, bukan mengurangi count: count negatif membuat
    // batas tidak berlaku dan tebakan jadi tanpa batas sampai jendela berganti.
    this.loginLimiter.reset(limitKey);

    const token = randomBytes(32).toString('base64url');
    this.store.set(SESSION_PREFIX + token, Date.now() + SESSION_TTL_MS, SESSION_TTL_MS);
    return { ok: true, token };
  }

  validateSession(token: string | undefined): boolean {
    if (!token) return false;
    const expiresAt = this.store.get(SESSION_PREFIX + token);
    return typeof expiresAt === 'number' && expiresAt > Date.now();
  }

  logout(token: string | undefined): void {
    if (!token) return;
    this.store.delete(SESSION_PREFIX + token);
  }

  /** Buang semua session (dipakai saat password diubah). */
  revokeAll(): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(SESSION_PREFIX)) this.store.delete(key);
    }
  }

  cookieOptions(): {
    httpOnly: boolean;
    sameSite: 'strict';
    secure: boolean;
    path: string;
    maxAge: number;
  } {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.appEnv === 'production',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    };
  }

  static get cookieName(): string {
    return SESSION_COOKIE;
  }

  /** Kunci rate limit: IP remote (di-backup hash user-agent agar tidak easy reset). */
  static clientKey(request: { ip?: string; headers: Record<string, unknown> }): string {
    const ip = request.ip ?? 'unknown';
    const ua = String(request.headers['user-agent'] ?? '');
    return `${hashIdentifier(ip)}:${hashIdentifier(ua)}`;
  }

  stop(): void {
    this.loginLimiter.stop();
  }
}

export const adminAuth = new AdminAuth();