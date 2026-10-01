/**
 * Client API terpusat untuk dashboard admin.
 *
 * Semua request memakai `credentials: 'same-origin'` supaya cookie session
 * ikut terkirim. API dan SPA di-origin yang sama (Fastify menyajikan keduanya),
 * jadi tidak perlu token di localStorage — dengan begitu XSS tidak punya
 * akses ke kredensial.
 */

export class ApiError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

let unauthorizedHandler: (() => void) | undefined

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
    headers: {
      'accept': 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const text = await res.text()
  let payload: unknown = undefined
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/api/admin/login') unauthorizedHandler?.()
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === 'string' && payload
          ? payload
          : `HTTP ${res.status}`) || `HTTP ${res.status}`
    throw new ApiError(message, res.status, payload)
  }

  return payload as T
}

// ---- Types (cerminan respons /api/admin/*) ----

export interface MemoryUsage {
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  heapPct: number
}

export interface ProcessInfo {
  uptimeSec: number
  uptimeLabel: string
  startedAt: string
  nodeVersion: string
  pid: number
  platform: string
  cpus: number
  memory: MemoryUsage
  loadAvg: number[]
}

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED'

export interface JobMeta {
  jobId: string
  type: string
  ownerHash: string
  status: JobStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  errorCode?: string
}

export interface QueueStat {
  depth: number
  limit: number
  active: number
  maxQueue: number
}

export interface JobStats {
  byStatus: Record<JobStatus, number>
  active: number
  queues: Record<string, QueueStat>
  recent: JobMeta[]
}

export interface RuntimeConfigShape {
  userRateLimit: number
  groupRateLimit: number
  videoConcurrencyPerUser: number
  maxImageJobs: number
  maxVideoJobs: number
  maxAnimationJobs: number
  maxBackgroundJobs: number
  maxTextLength: number
  maxImageBytes: number
  maxVideoBytes: number
  groupAdminOnly: boolean
  commandPrefix: string
  allowedChatIds: string[]
  blockedSenderIds: string[]
}

export interface ConfigSnapshot {
  effective: RuntimeConfigShape
  defaults: RuntimeConfigShape
  limits: Record<string, { min: number; max: number }>
}

export interface Overview {
  process: ProcessInfo
  jobs: JobStats
  config: RuntimeConfigShape
  waha: { baseUrl: string; session: string }
  limits: {
    imageMaxBytes: number
    videoMaxBytes: number
    maxInputPixels: number
    sharpConcurrency: number
    tempDir: string
    tempFileTtlSeconds: number
  }
}

export interface LogEntry {
  level: string
  message: string
  timestamp: string
  component?: string
  errorCode?: string
  error?: string
  [key: string]: unknown
}

export interface CommandMeta {
  name: string
  description: string
  usage: string
  category: string
  aliases?: string[]
}

export interface AccessInfo {
  allowedChatIds: string[]
  blockedSenderIds: string[]
  groupAdminOnly: boolean
  commandPrefix: string
  prefixOverrides: Array<{ chatIdHash: string; prefix: string }>
}

export interface SessionState {
  enabled: boolean
  authenticated: boolean
}

export interface WhatsappSession {
  name: string
  exists: boolean
  status: string
  engine: string | null
  me: { id?: string; pushName?: string } | null
  webhookConfigured: boolean
}

export type WhatsappAction = 'start' | 'connect' | 'stop' | 'restart' | 'logout'

// ---- Endpoints ----

export const api = {
  session: () => request<SessionState>('/api/admin/session'),

  login: (password: string) =>
    request<{ ok: true }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST' }),

  overview: (signal?: AbortSignal) => request<Overview>('/api/admin/overview', { signal }),

  jobs: (signal?: AbortSignal) => request<JobStats>('/api/admin/jobs', { signal }),

  whatsapp: (signal?: AbortSignal) => request<WhatsappSession>('/api/admin/whatsapp', { signal }),

  whatsappQr: (signal?: AbortSignal) => request<{ dataUrl: string }>('/api/admin/whatsapp/qr', { signal }, 25_000),

  whatsappAction: (action: WhatsappAction) =>
    request<{ ok: true }>(`/api/admin/whatsapp/${action}`, { method: 'POST' }, 25_000),

  cancelJob: (jobId: string) =>
    request<{ cancelled: boolean; message: string }>(
      `/api/admin/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: 'POST' },
    ),

  logs: (level = 'all', limit = 200, signal?: AbortSignal) =>
    request<{ total: number; entries: LogEntry[] }>(
      `/api/admin/logs?level=${encodeURIComponent(level)}&limit=${limit}`,
      { signal },
    ),

  commands: () =>
    request<{ total: number; categories: Array<{ category: string; commands: CommandMeta[] }> }>(
      '/api/admin/commands',
    ),

  config: () => request<ConfigSnapshot>('/api/admin/config'),

  updateConfig: (patch: Partial<Record<keyof RuntimeConfigShape, unknown>>) =>
    request<{ ok: true; effective: RuntimeConfigShape }>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  resetConfig: () =>
    request<{ ok: true; effective: RuntimeConfigShape }>('/api/admin/config/reset', {
      method: 'POST',
    }),

  access: () => request<AccessInfo>('/api/admin/access'),

  setPrefix: (chatId: string, prefix: string) =>
    request<{ ok: true; chatIdHash: string; prefix: string }>('/api/admin/access/prefix', {
      method: 'POST',
      body: JSON.stringify({ chatId, prefix }),
    }),

  // Delete berdasarkan hash: UI hanya menyimpan/menampilkan hash chat, bukan
  // chatId asli, jadi client tidak pernah memegang identitas mentah.
  clearPrefix: (chatIdHash: string) =>
    request<{ ok: true }>(`/api/admin/access/prefix/${encodeURIComponent(chatIdHash)}`, {
      method: 'DELETE',
    }),

  tempFiles: () =>
    request<{ count: number; tempDir: string }>('/api/admin/maintenance/temp-files'),

  cleanupTemp: () =>
    request<{ ok: true; remaining: number; tempDir: string }>(
      '/api/admin/maintenance/cleanup-temp',
      { method: 'POST' },
    ),

  restart: () =>
    request<{ ok: true; message: string }>('/api/admin/maintenance/restart', {
      method: 'POST',
    }),

  testSend: (chatId: string, text?: string) =>
    request<{ ok: true; message: string }>('/api/admin/maintenance/test-send', {
      method: 'POST',
      body: JSON.stringify({ chatId, text }),
    }),

  revokeAllSessions: () =>
    request<{ ok: true; message: string }>('/api/admin/sessions/revoke-all', {
      method: 'POST',
    }),
}
