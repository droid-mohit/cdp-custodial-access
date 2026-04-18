import type { Notifier, NotifyOptions } from './types.js';

export class SlackNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async notify(opts: NotifyOptions): Promise<void> {
    const expiryStr = opts.expiresAt.toUTCString();
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Browser Session — Human Intervention Required' },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:* ${opts.reason}` },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Open Browser Session' },
              url: opts.url,
              style: 'primary',
            },
          ],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Expires: ${expiryStr}` }],
        },
      ],
    };

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}: ${await res.text()}`);
    }
  }
}
