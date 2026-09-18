import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { logger, getLogs, getErrors } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

fastify.post('/webhook', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);
fastify.get('/dashboard', dashboardController);
fastify.get('/api/logs', logsController);

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
.container { max-width: 900px; margin: 0 auto; }
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
.logs { max-height: 500px; overflow-y: auto; font-family: 'Fira Code', monospace; font-size: 12px; }
.log-entry { padding: 4px 8px; border-bottom: 1px solid #1e293b; display: flex; gap: 12px; }
.log-entry.error { background: #1a0a0a; border-left: 3px solid #ef4444; }
.log-entry.warn { background: #1a150a; border-left: 3px solid #f59e0b; }
.log-entry.info { border-left: 3px solid #3b82f6; }
.log-time { color: #64748b; min-width: 80px; }
.log-level { min-width: 60px; font-weight: bold; }
.log-level.info { color: #3b82f6; }
.log-level.warn { color: #f59e0b; }
.log-level.error { color: #ef4444; }
.log-msg { color: #e2e8f0; flex: 1; word-break: break-all; }
.tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; background: #0f172a; color: #94a3b8; border: 1px solid #334155; }
.tab.active { background: #38bdf8; color: #000; border-color: #38bdf8; }
</style>
</head>
<body>
<div class="container">
<h1>🤖 WAHA Sticker Bot Dashboard</h1>

<div class="card">
<h2>Status</h2>
<div class="status">
<div class="dot" id="statusDot"></div>
<span id="statusText">Loading...</span>
</div>
<div id="wahaStatus" style="margin-top:8px;font-size:13px;color:#94a3b8"></div>
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
<h2>Realtime Logs</h2>
<div class="tabs">
<span class="tab active" onclick="filterLogs('all')">All</span>
<span class="tab" onclick="filterLogs('error')">Errors</span>
<span class="tab" onclick="filterLogs('warn')">Warnings</span>
<span class="tab" onclick="filterLogs('info')">Info</span>
</div>
<div class="logs" id="logsContainer"></div>
</div>

<div class="footer">
WAHA Sticker Bot V1 • ${new Date().getFullYear()}<br>
Auto-refresh logs setiap 5 detik
</div>
</div>

<script>
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    renderLogs(logs);
  } catch(e) {
    document.getElementById('logsContainer').innerHTML = '<div class="log-entry error"><span class="log-msg">Gagal fetch logs</span></div>';
  }
}

function renderLogs(logs) {
  const container = document.getElementById('logsContainer');
  const activeTab = document.querySelector('.tab.active')?.textContent?.toLowerCase() || 'all';
  const filtered = activeTab === 'all' ? logs : logs.filter(l => l.level === activeTab || l.errorCode);
  container.innerHTML = filtered.slice(-50).reverse().map(l => {
    const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '--';
    const level = l.level || (l.errorCode ? 'error' : 'info');
    const msg = l.message || l.error || JSON.stringify(l).slice(0, 200);
    return '<div class="log-entry ' + level + '">' +
      '<span class="log-time">' + time + '</span>' +
      '<span class="log-level ' + level + '">' + level.toUpperCase() + '</span>' +
      '<span class="log-msg">' + msg + '</span>' +
      '</div>';
  }).join('');
}

function filterLogs(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  fetchLogs();
}

async function fetchHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const waha = document.getElementById('wahaStatus');
    if (data.status === 'ok') {
      dot.className = 'dot';
      text.textContent = 'Online';
    } else {
      dot.className = 'dot offline';
      text.textContent = 'Degraded';
    }
    waha.textContent = 'WAHA: ' + data.waha + ' (' + data.wahaUrl + ')';
    waha.style.color = data.waha === 'connected' ? '#22c55e' : '#ef4444';
  } catch(e) {
    document.getElementById('statusText').textContent = 'Error';
  }
}

fetchLogs();
setInterval(fetchLogs, 5000);
fetchHealth();
setInterval(fetchHealth, 30000);
</script>
</body>
</html>`;

  reply.type('text/html').send(html);
}

async function logsController(_req: FastifyRequest, reply: FastifyReply) {
  const logs = getLogs();
  reply.type('application/json').send(logs);
}
