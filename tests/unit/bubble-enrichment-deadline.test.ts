import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { TextGenerator } from '../../src/stickers/generators/text.generator';
import { WAHAClient } from '../../src/whatsapp/waha.client';

function pipeline(waha?: any) {
  const generator = new TextGenerator();
  const render = vi.fn().mockResolvedValue({
    buffer: Buffer.from('webp'), mimetype: 'image/webp', width: 512, height: 512, animated: false, size: 4,
  });
  (generator as any).bubbleProcessor = { process: render };
  const client = waha ?? {
    getContactSavedName: vi.fn().mockResolvedValue(undefined),
    getChatInfo: vi.fn().mockResolvedValue(null),
    getProfilePicture: vi.fn().mockResolvedValue(null),
    fetchExternalImage: vi.fn().mockResolvedValue(null),
  };
  const run = (signal?: AbortSignal, timeoutMs = 5000) => generator.process({
    type: 'text', modifier: 'bubble', text: 'Halo', timeoutMs, signal,
    content: { senderId: '1@c.us', senderName: 'Budi', timestamp: Date.parse('2026-10-08T06:19:00Z') },
  }, { chatId: 'group@g.us', senderId: 'requester@c.us', session: 'quoted/session', wahaClient: client });
  return { run, client, render };
}

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('TZ', 'Asia/Jakarta'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('bubble optional enrichment deadline', () => {
  it('renders without a stalled avatar before the job deadline and skips further picture retries', async () => {
    const test = pipeline();
    test.client.getChatInfo.mockResolvedValue({ picture: 'https://avatar.example/picture.png' });
    test.client.fetchExternalImage.mockImplementation(() => new Promise(() => {}));
    const pending = test.run();
    await vi.advanceTimersByTimeAsync(4249);
    expect(test.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ mimetype: 'image/webp' });
    expect(test.render).toHaveBeenCalledWith('Halo', 'Budi', '1@c.us', undefined, null, '13:19', 'incoming', true);
    expect(test.client.getProfilePicture).not.toHaveBeenCalled();
    expect(test.client.fetchExternalImage.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('uses the payload display name when metadata stalls and preserves render budget', async () => {
    const test = pipeline();
    test.client.getContactSavedName.mockImplementation(() => new Promise(() => {}));
    test.client.getChatInfo.mockImplementation(() => new Promise(() => {}));
    const pending = test.run();
    await vi.advanceTimersByTimeAsync(4250);
    await pending;
    expect(test.render).toHaveBeenCalledWith('Halo', 'Budi', '1@c.us', undefined, null, '13:19', 'incoming', true);
    expect(test.client.getProfilePicture).not.toHaveBeenCalled();
    expect(test.client.getChatInfo).toHaveBeenCalledWith('1@c.us', 'quoted/session', expect.anything());
  });

  it('does not render or start lookups for an already aborted job', async () => {
    const test = pipeline();
    await expect(test.run(AbortSignal.abort())).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    expect(test.client.getChatInfo).not.toHaveBeenCalled();
    expect(test.render).not.toHaveBeenCalled();
  });

  it('stops rendering when a job is cancelled during optional avatar lookup', async () => {
    const test = pipeline();
    test.client.getProfilePicture.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = test.run(controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await assertion;
    expect(test.render).not.toHaveBeenCalled();
  });

  it('aborts real WAHA metadata response bodies at the enrichment limit and renders using payload metadata', async () => {
    vi.useRealTimers();
    let closed = 0;
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url ?? '');
      req.on('close', () => closed++);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{'); // Stall body, not only response headers.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const test = pipeline(new WAHAClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'test', 'configured'));
      const started = Date.now();
      await test.run(undefined, 950);
      expect(Date.now() - started).toBeLessThan(750);
      expect(test.render).toHaveBeenCalledWith('Halo', 'Budi', '1@c.us', undefined, null, '13:19', 'incoming', true);
      expect(requests).toContain('/api/quoted%2Fsession/chats/overview?limit=1&ids=1%40c.us');
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(closed).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
