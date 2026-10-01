import fetch from 'node-fetch';
import env from '../config/env';

export interface WahaSession {
  name: string;
  status: string;
  engine?: { engine?: string } | string;
  me?: { id?: string; pushName?: string } | null;
}

export interface WahaProfile {
  id: string;
  name: string | null;
  picture: string | null;
}

export class WahaSessionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WahaSessionError';
  }
}

/** Lifecycle API is separate from message delivery: no send retries or chat IDs. */
export class WahaSessionClient {
  constructor(
    private readonly baseUrl = env.wahaBaseUrl,
    private readonly apiKey = env.wahaApiKey,
    readonly session = env.wahaSession,
    private readonly timeoutMs = 10_000,
  ) {}

  private get sessionPath(): string {
    return `/api/sessions/${encodeURIComponent(this.session)}`;
  }

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          'X-Api-Key': this.apiKey,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        size: 1_048_576,
        redirect: 'error',
      });
      // Drain the body on both success and failure so sockets return to the pool.
      const text = await response.text();
      if (!response.ok) {
        throw new WahaSessionError('WAHA menolak permintaan sesi.', response.status);
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new WahaSessionError('Respons WAHA tidak valid.');
      }
    } catch (error) {
      if (error instanceof WahaSessionError) throw error;
      throw new WahaSessionError(
        controller.signal.aborted
          ? 'WAHA terlalu lama merespons. Coba lagi.'
          : 'Tidak dapat menghubungi WAHA. Periksa koneksi server.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getSession(): Promise<WahaSession | null> {
    try {
      const session = await this.request<WahaSession>(this.sessionPath);
      if (!session || typeof session.status !== 'string' || session.name !== this.session) {
        throw new WahaSessionError('Respons sesi WAHA tidak valid.');
      }
      return session;
    } catch (error) {
      if (error instanceof WahaSessionError && error.status === 404) return null;
      throw error;
    }
  }

  async createSession(webhookUrl: string): Promise<void> {
    await this.request('/api/sessions', 'POST', {
      name: this.session,
      start: true,
      config: {
        webhooks: [{
          url: webhookUrl,
          events: ['message'],
          ...(env.wahaWebhookHmacKey ? { hmac: { key: env.wahaWebhookHmacKey } } : {}),
          retries: { policy: 'constant', delaySeconds: 2, attempts: 5 },
        }],
      },
    });
  }

  async action(action: 'start' | 'stop' | 'restart' | 'logout'): Promise<void> {
    await this.request(`${this.sessionPath}/${action}`, 'POST');
  }

  async getProfile(): Promise<WahaProfile> {
    const profile = await this.request<{ id?: unknown; name?: unknown; picture?: unknown }>(
      `/api/${encodeURIComponent(this.session)}/profile`,
    );
    if (!profile || typeof profile.id !== 'string' || !profile.id) {
      throw new WahaSessionError('Profil WhatsApp belum tersedia. Coba perbarui.');
    }
    let picture: string | null = null;
    if (typeof profile.picture === 'string') {
      // Only passive image sources; never expose embedded URL credentials or SVG.
      if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profile.picture)) {
        picture = profile.picture;
      } else {
        try {
          const url = new URL(profile.picture);
          if (url.protocol === 'https:' && !url.username && !url.password) picture = url.href;
        } catch { /* Missing or invalid photo uses the avatar fallback. */ }
      }
    }
    return { id: profile.id, name: typeof profile.name === 'string' ? profile.name : null, picture };
  }

  async getQr(): Promise<{ dataUrl: string }> {
    const qr = await this.request<{ data?: unknown; mimetype?: unknown }>(
      `/api/${encodeURIComponent(this.session)}/auth/qr`,
    );
    if (!qr || qr.mimetype !== 'image/png' || typeof qr.data !== 'string' || !qr.data ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(qr.data) ||
        !Buffer.from(qr.data, 'base64').subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      throw new WahaSessionError('QR dari WAHA tidak valid. Coba perbarui QR.');
    }
    return { dataUrl: `data:image/png;base64,${qr.data}` };
  }
}
