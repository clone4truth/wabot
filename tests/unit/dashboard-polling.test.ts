import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, nextTick } from '../../dashboard/node_modules/vue';
import { usePolling } from '../../dashboard/src/composables/use-polling';
import { ApiError, api, setUnauthorizedHandler } from '../../dashboard/src/lib/api';

// A Vue renderer is sufficient for lifecycle tests; no browser/DOM dependency.
const renderer = createRenderer({
  createElement: () => ({}), createComment: () => ({}), createText: () => ({}),
  insert: () => {}, remove: () => {}, patchProp: () => {}, setElementText: () => {},
  setText: () => {}, parentNode: () => null, nextSibling: () => null,
});

function mount<T>(loader: (signal: AbortSignal) => Promise<T>) {
  let poll!: ReturnType<typeof usePolling<T>>;
  const app = renderer.createApp({ setup() {
    poll = usePolling(loader, { intervalMs: 1_000 });
    poll.start();
    return () => null;
  } });
  app.mount({});
  return { poll, app };
}

const settle = async () => { await Promise.resolve(); await nextTick(); };

describe('dashboard polling lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('waits for in-flight work, backs off errors and recovers', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ready');
    const { poll, app } = mount(loader);
    await settle();
    expect(poll.error.value).toBe('Gagal memuat data. Coba lagi.');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll.data.value).toBe('ready');
    expect(poll.error.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loader).toHaveBeenCalledTimes(3);
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts on unmount and ignores late results', async () => {
    let finish!: (value: string) => void;
    let signal!: AbortSignal;
    const { poll, app } = mount(s => { signal = s; return new Promise<string>(resolve => { finish = resolve; }); });
    await poll.refresh();
    app.unmount();
    expect(signal.aborted).toBe(true);
    finish('stale');
    await settle();
    expect(poll.data.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an aborted request overwrite a restarted poll', async () => {
    let finish!: (value: string) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValue('new');
    const { poll, app } = mount(loader);
    poll.stop();
    poll.start();
    await settle();
    finish('old');
    await settle();
    expect(poll.data.value).toBe('new');
    app.unmount();
  });

  it('suspends in background tabs and refreshes on returning', async () => {
    const loader = vi.fn().mockResolvedValue('ready');
    const { app } = mount(loader);
    await settle();
    Object.assign(document, { hidden: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).toHaveBeenCalledTimes(1);
    Object.assign(document, { hidden: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('stops retries when the admin session expires', async () => {
    const loader = vi.fn().mockRejectedValue(new ApiError('expired', 401));
    const { app } = mount(loader);
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(loader).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});

describe('dashboard API session handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges JSON headers and keeps credentials for state-changing requests', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"ok":true}')));
    vi.stubGlobal('fetch', fetch);
    await api.whatsappAction('connect');
    expect(fetch.mock.calls[0]).toMatchObject(['/api/admin/whatsapp/connect', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } }]);
    await api.login('test');
    expect(fetch.mock.calls[1][1].headers['content-type']).toBe('application/json');
  });

  it('invalidates admin login on 401 but not on upstream WAHA errors or failed login', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"WAHA error"}', { status: 502 })));
    await expect(api.whatsapp()).rejects.toThrow('WAHA error');
    expect(unauthorized).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"error":"expired"}', { status: 401 }))));
    await expect(api.login('wrong')).rejects.toThrow();
    expect(unauthorized).not.toHaveBeenCalled();
    await expect(api.jobs()).rejects.toThrow();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });
});
