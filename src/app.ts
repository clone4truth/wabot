import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { logger } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

fastify.post('/webhook', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);
fastify.get('/dashboard', dashboardController);

export { fastify };

function dashboardController(_req: FastifyRequest, reply: FastifyReply) {
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WAHA Sticker Bot - Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
.container { max-width: 800px; margin: 0 auto; }
h1 { font-size: 24px; margin-bottom: 24px; color: #38bdf8; }
.card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #334155; }
.card h2 { font-size: 16px; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
.status { display: flex; align-items: center; gap: 8px; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
.dot.offline { background: #ef4444; animation: none; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.metric { background: #0f172a; border-radius: 8px; padding: 16px; text-align: center; }
.metric .value { font-size: 28px; font-weight: bold; color: #38bdf8; }
.metric .label { font-size: 12px; color: #64748b; margin-top: 4px; }
.commands { display: flex; flex-wrap: wrap; gap: 8px; }
.command { background: #0f172a; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-family: monospace; }
.command.active { background: #22c55e; color: #000; }
.footer { margin-top: 24px; text-align: center; color: #475569; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
<h1>🤖 WAHA Sticker Bot Dashboard</h1>

<div class="card">
<h2>Status</h2>
<div class="status">
<div class="dot" id="statusDot"></div>
<span id="statusText">Online</span>
</div>
</div>

<div class="card">
<h2>Info</h2>
<div class="metrics">
<div class="metric"><div class="value">${env.appEnv}</div><div class="label">Environment</div></div>
<div class="metric"><div class="value">${uptimeStr}</div><div class="label">Uptime</div></div>
<div class="metric"><div class="value">${env.appPort}</div><div class="label">Port</div></div>
<div class="metric"><div class="value">${env.wahaSession}</div><div class="label">WAHA Session</div></div>
</div>
</div>

<div class="card">
<h2>Rate Limits</h2>
<div class="metrics">
<div class="metric"><div class="value">${env.userRateLimit}/60s</div><div class="label">Per User</div></div>
<div class="metric"><div class="value">${env.groupRateLimit}/60s</div><div class="label">Per Group</div></div>
</div>
</div>

<div class="card">
<h2>Commands</h2>
<div class="commands">
<span class="command active">!stiker</span>
<span class="command active">!toimg</span>
<span class="command active">!togif</span>
<span class="command active">!menu</span>
<span class="command active">!help</span>
<span class="command active">!ping</span>
</div>
</div>

<div class="card">
<h2>Endpoints</h2>
<div class="commands">
<span class="command">GET /health</span>
<span class="command">GET /dashboard</span>
<span class="command">POST /webhook</span>
</div>
</div>

<div class="footer">
WAHA Sticker Bot V1 • ${new Date().getFullYear()}<br>
Auto-refresh setiap 30 detik
</div>
</div>

<script>
setTimeout(() => location.reload(), 30000);
</script>
</body>
</html>`;

  reply.type('text/html').send(html);
}
