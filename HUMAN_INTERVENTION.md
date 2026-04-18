# Human Intervention

Pause an autonomous browser workflow, stream the live browser to your device, complete the step yourself, and resume automation — all with one tool call.

## Use cases

- Solving hCaptcha / Cloudflare Turnstile challenges
- Device verification / 2FA prompts
- Post-login challenges that can't be detected ahead of time
- Any unpredictable human-gated step

## Prerequisites

Install the ngrok Node SDK (the default tunnel adapter):

```bash
npm install @ngrok/ngrok
```

Get an ngrok authtoken at https://dashboard.ngrok.com/authtokens and set it:

```bash
export NGROK_AUTHTOKEN=your_token_here
```

## Basic usage

```typescript
import { BrowserController } from 'cdp-custodial-access';

const controller = new BrowserController();
const session = await controller.launch({ workflow: 'my-workflow', headless: true });

// ... your automation ...

// When you hit a captcha:
const { data: intervention } = await session.requestHumanIntervention({
  reason: 'Solve hCaptcha on checkout page',
  tunnel: { type: 'ngrok' },
  notifier: { type: 'slack', webhook: process.env.SLACK_WEBHOOK },
});

// The URL is live. Your notifier has already sent the link.
// Now wait for the operator to finish:
const result = await intervention.waitForCompletion();

if (result.status !== 'completed') {
  throw new Error(`Intervention did not complete: ${result.status}`);
}

// Continue automation — the human has handled the challenge.
await session.click({ selector: '#submit' });
```

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `reason` | `string` | required | Shown to the operator in the UI and notification |
| `timeoutMs` | `number` | `900000` (15 min) | How long to wait. `0` = wait forever |
| `tunnel` | `TunnelConfig` | `{ type: 'ngrok' }` | How to expose the local server |
| `notifier` | `NotifierConfig \| null` | `null` | Where to send the link |
| `streamQuality` | `'low' \| 'medium' \| 'high'` | `'medium'` | JPEG quality + framerate preset |
| `allowNavigation` | `boolean` | `false` | Allow operator to navigate cross-origin |

## Stream quality presets

| Preset | JPEG quality | Frame size | ~fps | Peak bandwidth |
|---|---|---|---|---|
| `low` | 50 | 1024×768 | 8–12 | ~1 Mbps |
| `medium` | 70 | 1280×960 | 12–18 | ~3–5 Mbps |
| `high` | 85 | 1920×1440 | 20–30 | ~8–12 Mbps |

Use `low` on cellular or VPN connections.

## Notifiers

### Slack

```typescript
notifier: { type: 'slack', webhook: 'https://hooks.slack.com/services/...' }
```

Sends a Block Kit message with an "Open Browser Session" button.

### Generic webhook

```typescript
notifier: { type: 'webhook', url: 'https://your-server.com/notify', headers: { 'Authorization': 'Bearer ...' } }
```

POSTs `{ url, reason, expiresAt }` JSON to the endpoint.

### No notifier — manual delivery

Set `notifier: null` and use the URL from the returned handle:

```typescript
const { data: intervention } = await session.requestHumanIntervention({
  reason: 'solve captcha',
  notifier: null,
});
console.log('Open this URL:', intervention.url);
const result = await intervention.waitForCompletion();
```

## Tunnel adapters

### ngrok (default)

Requires `@ngrok/ngrok` and `NGROK_AUTHTOKEN`. Free tier provides random subdomains.

```typescript
tunnel: { type: 'ngrok', authtoken: 'explicit-token', region: 'eu' }
```

### Custom tunnel

Pass any object with `expose(port)` and `close()` methods:

```typescript
tunnel: {
  type: 'custom',
  adapter: {
    async expose(port) { return { publicUrl: await myTunnel.start(port) }; },
    async close() { await myTunnel.stop(); },
  },
}
```

## Abort from the workflow side

```typescript
const { data: intervention } = await session.requestHumanIntervention({ reason: 'captcha' });

const deadline = setTimeout(() => intervention.abort('workflow deadline'), 5 * 60_000);
const result = await intervention.waitForCompletion();
clearTimeout(deadline);
```

## Pattern: post-autoLogin challenge

```typescript
const loginResult = await session.autoLogin({ loginUrl: '...', workflow: 'my-wf' });

// autoLogin may return 'existing-session' even when a post-auth challenge appeared.
const url = await (await session.page()).url();
if (url.includes('/checkpoint/') || (await (await session.page()).title()).includes('Challenge')) {
  const { data: intervention } = await session.requestHumanIntervention({
    reason: 'Complete device verification challenge',
    notifier: { type: 'slack', webhook: process.env.SLACK_WEBHOOK },
  });
  await intervention.waitForCompletion();
  await session.navigate({ url: 'https://target-page.com' });
}
```

## Security

- **One-time link** — the URL token is consumed on first WebSocket connection. A leaked link after first use is dead.
- **Navigation locked by default** — `allowNavigation: false` prevents the operator from navigating to other origins, protecting session cookies.
- **Tunnel provider sees traffic** — ngrok (and any third-party tunnel) decrypts traffic at its TLS edge. For sensitive sessions use the `custom` adapter with a self-hosted relay over a private network.
- **Operator input is not logged** — the audit trail records that an intervention happened and how long it took, never the actual keystrokes or clicks.

## Operator experience

When the operator opens the link:
- They see the live browser rendered in a dark-mode canvas
- Mouse and keyboard input is streamed back to the VM with real human timing
- A **Done** button signals completion; a **Cancel** button aborts
- The session expires after `timeoutMs` and the link becomes invalid
