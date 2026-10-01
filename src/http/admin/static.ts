import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import env from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * Lokasi build SPA. Di produksi file hasil `vite build` di-copy ke image pada
 * /app/dashboard-dist; saat development, `npm run dev` di dashboard/ berjalan
 * lewat Vite dev server (proxy ke Fastify), jadi folder ini tidak wajib ada.
 */
const DASHBOARD_DIST = process.env.DASHBOARD_DIST || path.join(process.cwd(), 'dashboard-dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Resolusi aman: pastikan path hasil join tetap berada di dalam dist.
 * Tanpa ini, `GET /dashboard/../../etc/passwd` bisa keluar dari folder dist.
 */
function resolveWithinDist(urlPath: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(urlPath);
    } catch {
      return null;
    }
  })();
  if (decoded === null) return null;
  if (decoded.includes('\0')) return null;

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(DASHBOARD_DIST, relative);
  const root = path.resolve(DASHBOARD_DIST);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function dashboardDistExists(): boolean {
  return fs.existsSync(path.join(DASHBOARD_DIST, 'index.html'));
}

export async function registerDashboardStatic(fastify: FastifyInstance): Promise<void> {
  if (!dashboardDistExists()) {
    logger.warn('Dashboard SPA belum di-build, route /dashboard dilewati', {
      expected: DASHBOARD_DIST,
      hint: 'cd dashboard && npm install && npm run build',
    });
    return;
  }

  const indexHtml = path.join(DASHBOARD_DIST, 'index.html');

  // Asset ber-hash nama (Vite default: /assets/index-abc123.js) boleh di-cache
  // lama; index.html dan route SPA tidak boleh (bisa menyimpan referensi asset
  // lama setelah deploy baru).
  fastify.get('/dashboard/*', async (request, reply) => {
    const target = resolveWithinDist(request.url.replace(/^\/dashboard\/?/, ''));

    if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
      const ext = path.extname(target).toLowerCase();
      const isHashedAsset = request.url.includes('/assets/');
      reply.header('content-type', MIME[ext] ?? 'application/octet-stream');
      reply.header(
        'cache-control',
        isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      return reply.send(fs.createReadStream(target));
    }

    // SPA fallback: semua route non-aset dilayani index.html agar Vue Router
    // bisa mengambil alih (mis. /dashboard/jobs saat hard refresh).
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'no-cache');
    return reply.send(fs.createReadStream(indexHtml));
  });

  fastify.get('/dashboard', async (_request, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'no-cache');
    return reply.send(fs.createReadStream(indexHtml));
  });

  logger.info('Dashboard SPA terpasang', { dist: DASHBOARD_DIST });
}