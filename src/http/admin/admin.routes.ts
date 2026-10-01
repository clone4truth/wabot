import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import os from 'os';
import env from '../../config/env';
import { runtimeConfig } from '../../config/runtime-config';
import { adminAuth, AdminAuth } from '../../security/admin-auth';
import { getLogs, getErrors } from '../../observability/logger';
import { defaultJobManager } from '../../stickers/jobs/job-manager';
import { COMMAND_REGISTRY, getCommandsByCategory } from '../../commands/metadata';
import { cleanupOrphanFiles } from '../../media/temp-files';
import { WAHAClient } from '../../whatsapp/waha.client';
import { hashIdentifier } from '../../observability/privacy';
import { registerWhatsappRoutes } from './whatsapp.routes';

const startedAt = Date.now();

/** Guard: hanya request dengan session cookie valid yang boleh lewat. */
async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!adminAuth.isEnabled()) {
    // Jangan bocorkan reason sebenarnya ke klien soal env mana yang kurang.
    return reply.code(503).send({ error: 'Dashboard admin dinonaktifkan (ADMIN_PASSWORD belum diset).' });
  }
  const token = request.cookies[AdminAuth.cookieName];
  if (adminAuth.validateSession(token)) return;
  return reply.code(401).send({ error: 'Sesi tidak valid atau sudah berakhir.' });
}

/** Ambil cookie raw tanpa DependsOnCookies; dipakai di login/logout. */
function readCookie(request: FastifyRequest, name: string): string | undefined {
  return request.cookies?.[name];
}

function memoryUsage() {
  const mem = process.memoryUsage();
  return {
    rssMb: round1(mem.rss / 1024 / 1024),
    heapUsedMb: round1(mem.heapUsed / 1024 / 1024),
    heapTotalMb: round1(mem.heapTotal / 1024 / 1024),
    externalMb: round1(mem.external / 1024 / 1024),
    heapPct: mem.heapTotal > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
  const waha = new WAHAClient();

  // ---------- Auth ----------

  fastify.post('/api/admin/login', async (request, reply) => {
    const body = (request.body ?? {}) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    const clientKey = AdminAuth.clientKey(request as never);

    if (!password) {
      return reply.code(400).send({ error: 'Password wajib diisi.' });
    }

    const result = await adminAuth.login(password, clientKey);
    if (!result.ok || !result.token) {
      // Selalu 401 untuk kredensial salah; pesan dibedakan hanya antara
      // "salah" vs "terlalu banyak percobaan" (yang bukan rahasia).
      return reply.code(401).send({ error: result.reason ?? 'Login gagal.' });
    }

    reply.setCookie(AdminAuth.cookieName, result.token, adminAuth.cookieOptions());
    request.log.info('Admin login berhasil');
    return reply.code(200).send({ ok: true });
  });

  fastify.post('/api/admin/logout', async (request, reply) => {
    adminAuth.logout(readCookie(request, AdminAuth.cookieName));
    reply.clearCookie(AdminAuth.cookieName, { path: '/' });
    return reply.code(200).send({ ok: true });
  });

  // Endpoint ini TIDAP butuh auth — dipakai SPA saat boot untuk tahu apakah
  // harus redirect ke halaman login atau langsung ke dashboard.
  fastify.get('/api/admin/session', async (request, reply) => {
    const token = readCookie(request, AdminAuth.cookieName);
    return reply.code(200).send({
      enabled: adminAuth.isEnabled(),
      authenticated: adminAuth.isEnabled() && adminAuth.validateSession(token),
    });
  });

  fastify.get('/api/admin/config-status', async (_request, reply) => {
    return reply.code(200).send({ enabled: adminAuth.isEnabled() });
  });

  // Semua di bawah wajib login.
  fastify.register(async (secure) => {
    secure.addHook('preHandler', requireAuth);
    secure.register(registerWhatsappRoutes);

    // ---------- Overview ----------

    secure.get('/api/admin/overview', async (_request, reply) => {
      const stats = defaultJobManager.stats();
      const cfg = runtimeConfig.get();
      const uptimeSec = process.uptime();

      return reply.code(200).send({
        process: {
          uptimeSec: Math.round(uptimeSec),
          uptimeLabel: formatUptime(uptimeSec),
          startedAt: new Date(startedAt).toISOString(),
          nodeVersion: process.version,
          pid: process.pid,
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          cpus: os.cpus().length,
          memory: memoryUsage(),
          loadAvg: os.loadavg().map(round1),
        },
        jobs: stats,
        config: cfg,
        waha: {
          baseUrl: env.appEnv === 'production' ? '(hidden)' : env.wahaBaseUrl,
          session: env.wahaSession,
        },
        limits: {
          imageMaxBytes: env.maxImageBytes,
          videoMaxBytes: env.maxVideoBytes,
          maxInputPixels: env.maxInputPixels,
          sharpConcurrency: env.sharpConcurrency,
          tempDir: env.tempDir,
          tempFileTtlSeconds: env.tempFileTtlSeconds,
        },
      });
    });

    // ---------- Jobs ----------

    secure.get('/api/admin/jobs', async (_request, reply) => {
      return reply.code(200).send(defaultJobManager.stats());
    });

    secure.get<{ Params: { jobId: string } }>('/api/admin/jobs/:jobId', async (request, reply) => {
      const job = defaultJobManager.getJob(request.params.jobId);
      if (!job) return reply.code(404).send({ error: 'Job tidak ditemukan (mungkin sudah di-prune).' });
      return reply.code(200).send(job);
    });

    secure.post<{ Params: { jobId: string } }>('/api/admin/jobs/:jobId/cancel', async (request, reply) => {
      const { jobId } = request.params;
      const job = defaultJobManager.getJob(jobId);
      if (!job) return reply.code(404).send({ error: 'Job tidak ditemukan.' });
      const cancelled = defaultJobManager.cancelJob(jobId);
      return reply.code(200).send({
        cancelled,
        jobId,
        message: cancelled
          ? 'Job dibatalkan.'
          : 'Job tidak bisa dibatalkan: hanya job berstatus QUEUED yang bisa, atau job sudah selesai diproses.',
      });
    });

    // ---------- Logs ----------

    secure.get<{ Querystring: { level?: string; limit?: string } }>('/api/admin/logs', async (request, reply) => {
      const { level, limit } = request.query;
      const capped = Math.min(Math.max(Number(limit) || 200, 1), 200);
      let entries = getLogs();
      if (level && level !== 'all') {
        entries = entries.filter((entry) => entry.level === level || (level === 'error' && entry.errorCode));
      }
      return reply.code(200).send({ total: entries.length, entries: entries.slice(-capped) });
    });

    secure.get('/api/admin/logs/errors', async (_request, reply) => {
      return reply.code(200).send({ entries: getErrors().slice(-100) });
    });

    // ---------- Commands ----------

    secure.get('/api/admin/commands', async (_request, reply) => {
      const categories = Array.from(new Set(COMMAND_REGISTRY.map((c) => c.category)));
      return reply.code(200).send({
        total: COMMAND_REGISTRY.length,
        categories: categories.map((category) => ({
          category,
          commands: getCommandsByCategory(category),
        })),
      });
    });

    // ---------- Runtime config ----------

    secure.get('/api/admin/config', async (_request, reply) => {
      return reply.code(200).send(runtimeConfig.snapshot());
    });

    secure.put('/api/admin/config', async (request, reply) => {
      const patch = (request.body ?? {}) as Record<string, unknown>;
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        return reply.code(400).send({ error: 'Body harus berupa objek JSON.' });
      }
      const result = runtimeConfig.update(patch);
      if (!result.ok) {
        return reply.code(400).send({
          error: `Nilai tidak valid untuk: ${result.rejected.join(', ')}`,
          rejected: result.rejected,
          effective: runtimeConfig.get(),
        });
      }
      return reply.code(200).send({ ok: true, effective: runtimeConfig.get() });
    });

    secure.post('/api/admin/config/reset', async (_request, reply) => {
      return reply.code(200).send({ ok: true, effective: runtimeConfig.reset() });
    });

    // ---------- Access control / prefix ----------

    secure.get('/api/admin/access', async (_request, reply) => {
      const cfg = runtimeConfig.get();
      return reply.code(200).send({
        allowedChatIds: cfg.allowedChatIds,
        blockedSenderIds: cfg.blockedSenderIds,
        groupAdminOnly: cfg.groupAdminOnly,
        commandPrefix: cfg.commandPrefix,
        // Prefix di-hash: chatId adalah identitas pribadi, tidak perlu tampil
        // mentah di layar yang bisa saja di-share lewat screenshot.
        prefixOverrides: runtimeConfig.listPrefixes().map((entry) => ({
          chatIdHash: hashIdentifier(entry.chatId),
          prefix: entry.prefix,
        })),
      });
    });

    secure.post('/api/admin/access/prefix', async (request, reply) => {
      const body = (request.body ?? {}) as { chatId?: unknown; prefix?: unknown };
      const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
      const prefix = typeof body.prefix === 'string' ? body.prefix : '';
      if (!chatId) return reply.code(400).send({ error: 'chatId wajib diisi.' });
      if (!runtimeConfig.setPrefix(chatId, prefix)) {
        return reply.code(400).send({ error: 'Prefix harus tepat 1 karakter simbol (mis. ! ? .).' });
      }
      return reply.code(200).send({ ok: true, chatIdHash: hashIdentifier(chatId), prefix });
    });

    secure.delete<{ Params: { chatIdHash: string } }>(
      '/api/admin/access/prefix/:chatIdHash',
      async (request, reply) => {
        const { chatIdHash } = request.params;
        // Hapus berdasarkan hash: UI hanya pernah menampilkan hash, jadi
        // chatId asli tidak pernah perlu ada di browser.
        const target = runtimeConfig
          .listPrefixes()
          .find((entry) => hashIdentifier(entry.chatId) === chatIdHash);

        if (!target) return reply.code(404).send({ error: 'Prefix override tidak ditemukan.' });
        runtimeConfig.clearPrefix(target.chatId);
        return reply.code(200).send({ ok: true, chatIdHash });
      },
    );

    secure.delete('/api/admin/access/prefix', async (request, reply) => {
      const body = (request.body ?? {}) as { chatId?: unknown };
      const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
      if (!chatId) return reply.code(400).send({ error: 'chatId wajib diisi.' });
      runtimeConfig.clearPrefix(chatId);
      return reply.code(200).send({ ok: true, chatIdHash: hashIdentifier(chatId) });
    });

    // ---------- Maintenance ----------

    secure.post('/api/admin/maintenance/cleanup-temp', async (_request, reply) => {
      cleanupOrphanFiles(0); // 0 = paksa hapus semua, bukan hanya yang sudah tua
      const remaining = countTempFiles();
      return reply.code(200).send({ ok: true, remaining, tempDir: env.tempDir });
    });

    secure.get('/api/admin/maintenance/temp-files', async (_request, reply) => {
      return reply.code(200).send({ count: countTempFiles(), tempDir: env.tempDir });
    });

    secure.post('/api/admin/maintenance/restart', async (request, reply) => {
      request.log.warn('Restart bot diminta dari dashboard admin');
      // Beri waktu response terkirim dulu sebelum proses keluar.
      setTimeout(() => process.exit(0), 250).unref?.();
      return reply.code(200).send({ ok: true, message: 'Bot akan restart. Container akan start ulang otomatis.' });
    });

    secure.post('/api/admin/maintenance/test-send', async (request, reply) => {
      const body = (request.body ?? {}) as { chatId?: unknown; text?: unknown };
      const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
      const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : '✅ Test dari dashboard admin';
      if (!chatId) return reply.code(400).send({ error: 'chatId wajib diisi.' });
      try {
        await waha.sendText(chatId, text.slice(0, 1000));
        return reply.code(200).send({ ok: true, message: 'Pesan tes terkirim.' });
      } catch (err) {
        request.log.error({ err: String(err) }, 'Gagal kirim pesan tes');
        return reply.code(502).send({ error: 'Gagal mengirim via WAHA. Cek log server untuk detail.' });
      }
    });

    // ---------- Session management ----------

    secure.post('/api/admin/sessions/revoke-all', async (_request, reply) => {
      adminAuth.revokeAll();
      return reply.code(200).send({ ok: true, message: 'Semua sesi dicabut. Login ulang diperlukan.' });
    });
  });
}

function countTempFiles(): number {
  try {
    // Lazy require supaya modul ini tetap ringan bila dashboard tidak dipakai.
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(env.tempDir)) return 0;
    let count = 0;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        try {
          if (fs.statSync(full).isDirectory()) walk(full);
          else count++;
        } catch {
          // skip entri yang hilang di tengah iterasi
        }
      }
    };
    walk(env.tempDir);
    return count;
  } catch {
    return 0;
  }
}
