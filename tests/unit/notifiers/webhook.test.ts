import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookNotifier } from '../../../src/notifiers/webhook.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WebhookNotifier', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it('POSTs JSON with url, reason, expiresAt to the configured endpoint', async () => {
    const notifier = new WebhookNotifier({ type: 'webhook', url: 'https://example.com/notify' });
    const expiresAt = new Date('2026-04-18T16:00:00Z');
    await notifier.notify({ url: 'https://abc.ngrok-free.app', reason: 'help', expiresAt });

    const [calledUrl, opts] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://example.com/notify');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.url).toBe('https://abc.ngrok-free.app');
    expect(body.reason).toBe('help');
    expect(body.expiresAt).toBe(expiresAt.toISOString());
  });

  it('forwards custom headers', async () => {
    const notifier = new WebhookNotifier({
      type: 'webhook',
      url: 'https://example.com/notify',
      headers: { 'X-Api-Key': 'secret' },
    });
    await notifier.notify({ url: 'https://x.com', reason: 'r', expiresAt: new Date() });
    expect(mockFetch.mock.calls[0][1].headers['X-Api-Key']).toBe('secret');
  });

  it('throws if webhook returns non-2xx', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const notifier = new WebhookNotifier({ type: 'webhook', url: 'https://example.com/notify' });
    await expect(
      notifier.notify({ url: 'x', reason: 'r', expiresAt: new Date() }),
    ).rejects.toThrow('500');
  });
});
