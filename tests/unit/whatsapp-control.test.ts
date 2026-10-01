import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, type App } from '../../dashboard/node_modules/vue';
import { api, ApiError, type WhatsappSession } from '../../dashboard/src/lib/api';
import { useWhatsapp } from '../../dashboard/src/composables/use-whatsapp';

vi.mock('../../dashboard/node_modules/vue-sonner', () => ({ toast: { success: vi.fn() } }));

const renderer = createRenderer({
  createElement: () => ({}), createComment: () => ({}), createText: () => ({}),
  insert: () => {}, remove: () => {}, patchProp: () => {}, setElementText: () => {},
  setText: () => {}, parentNode: () => null, nextSibling: () => null,
});
const session: WhatsappSession = {
  name: 'default', exists: true, status: 'STOPPED', engine: null,
  me: null, webhookConfigured: true,
};
let app: App | undefined;

function mount() {
  let control!: ReturnType<typeof useWhatsapp>;
  app = renderer.createApp({ setup() { control = useWhatsapp(); return () => null; } });
  app.mount({});
  return control;
}

describe('manual WhatsApp session control', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
    vi.spyOn(api, 'whatsapp').mockResolvedValue({ ...session });
    vi.spyOn(api, 'whatsappQr').mockResolvedValue({ dataUrl: 'new-qr' });
    vi.spyOn(api, 'whatsappAction').mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('makes no requests on mount, elapsed time, or tab visibility changes', async () => {
    const control = mount();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.whatsapp).not.toHaveBeenCalled();
    expect(api.whatsappQr).not.toHaveBeenCalled();
    expect(api.whatsappAction).not.toHaveBeenCalled();
    await control.refresh();
    expect(api.whatsapp).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(api.whatsapp).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts only on explicit action, ignores double clicks, and fetches one QR', async () => {
    const control = mount();
    let finish!: (value: { ok: true }) => void;
    vi.mocked(api.whatsappAction).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(api.whatsapp).mockResolvedValue({ ...session, status: 'SCAN_QR_CODE' });
    const started = control.perform('start');
    await control.perform('start');
    expect(api.whatsappAction).toHaveBeenCalledTimes(1);
    expect(api.whatsappAction).toHaveBeenCalledWith('start');
    expect(api.whatsapp).not.toHaveBeenCalled();
    finish({ ok: true });
    await started;
    expect(control.qr.value).toBe('new-qr');
    expect(api.whatsapp).toHaveBeenCalledTimes(1);
    expect(api.whatsappQr).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(api.whatsapp).toHaveBeenCalledTimes(1);
    expect(api.whatsappQr).toHaveBeenCalledTimes(1);
  });

  it('clears the old QR on restart and waits for manual refresh while starting', async () => {
    const control = mount();
    vi.mocked(api.whatsapp).mockResolvedValue({ ...session, status: 'SCAN_QR_CODE' });
    await control.refresh();
    expect(control.qr.value).toBe('new-qr');
    vi.mocked(api.whatsapp).mockResolvedValue({ ...session, status: 'STARTING' });
    const restarted = control.perform('restart');
    expect(control.qr.value).toBeNull();
    await restarted;
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(api.whatsappQr).toHaveBeenCalledTimes(1);
    vi.mocked(api.whatsapp).mockResolvedValue({ ...session, status: 'SCAN_QR_CODE' });
    await control.refresh();
    expect(api.whatsappQr).toHaveBeenCalledTimes(2);
  });

  it('does not follow a failed action with more requests or automatic retries', async () => {
    const control = mount();
    vi.mocked(api.whatsappAction).mockRejectedValue(new ApiError('upstream secret', 502));
    await control.perform('start');
    expect(control.actionError.value).not.toContain('secret');
    expect(control.actionError.value).toBeTruthy();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(api.whatsappAction).toHaveBeenCalledTimes(1);
    expect(api.whatsapp).not.toHaveBeenCalled();
    expect(api.whatsappQr).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
