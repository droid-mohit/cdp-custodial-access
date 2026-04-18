import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackNotifier } from '../../../src/notifiers/slack.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SlackNotifier', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: async () => 'ok' });
  });

  it('POSTs a Block Kit payload to the webhook URL', async () => {
    const notifier = new SlackNotifier('https://hooks.slack.com/test');
    await notifier.notify({
      url: 'https://abc.ngrok-free.app/?t=abc',
      reason: 'Solve captcha',
      expiresAt: new Date('2026-04-18T15:00:00Z'),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.blocks).toBeDefined();
    expect(JSON.stringify(body)).toContain('Solve captcha');
    expect(JSON.stringify(body)).toContain('https://abc.ngrok-free.app/?t=abc');
  });

  it('throws if Slack webhook returns a non-2xx status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_payload' });
    const notifier = new SlackNotifier('https://hooks.slack.com/test');
    await expect(
      notifier.notify({ url: 'https://x.com', reason: 'r', expiresAt: new Date() }),
    ).rejects.toThrow('400');
  });
});
