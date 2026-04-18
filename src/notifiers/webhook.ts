import type { Notifier, NotifyOptions, WebhookNotifierConfig } from './types.js';

export class WebhookNotifier implements Notifier {
  constructor(private readonly config: WebhookNotifierConfig) {}

  async notify(opts: NotifyOptions): Promise<void> {
    const res = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify({
        url: opts.url,
        reason: opts.reason,
        expiresAt: opts.expiresAt.toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }
  }
}
