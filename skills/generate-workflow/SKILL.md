---
name: generate-workflow
description: Use when the user asks to create a browser workflow, automation script, or describes a use case involving visiting websites, clicking, typing, extracting data, or taking screenshots. Triggers on phrases like "create a workflow", "automate", "go to site X and do Y", "scrape", "extract from".
---

# Generate Browser Workflow

Create a workflow script in `workflows/simple/` from a plain English use case description.

## Process

1. Clarify what the user wants (site, actions, what to extract/save)
2. Identify which tools are needed from the reference below
3. Generate the workflow file at `workflows/simple/{name}.ts`
4. Add entry to `workflows/registry.json` with name, description, file, type (`SIMPLE`), and params
5. Verify it compiles with `npx tsc --noEmit`

## Workflow Template

Every workflow MUST follow this structure. The `@prompt` tag at the top preserves the user's original request verbatim — this is used by `/improve-workflow` to understand intent. The `@steps` tag documents the high-level sequence of actions the workflow performs.

```typescript
/**
 * @prompt {The user's original plain-English use case, copied verbatim}
 *
 * @steps
 * 1. {First action — e.g., Navigate to https://example.com}
 * 2. {Second action — e.g., Authenticate via autoLogin}
 * 3. {Third action — e.g., Extract pricing table via CSS selectors}
 * 4. {Fourth action — e.g., Save to pricing.json + metadata.json}
 *
 * Workflow: {Title}
 *
 * {One-line description}
 *
 * Output: ~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/
 *
 * Usage: npx tsx workflows/simple/{name}.ts [--headed]
 */

import { BrowserController } from '../../src/sdk/browser-controller.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Config ──────────────────────────────────────────────────────────

const WORKFLOW_NAME = path.basename(import.meta.filename, path.extname(import.meta.filename));
// ... site-specific config (URLs, selectors, timeouts)

// ─── Output Directory ────────────────────────────────────────────────

function buildOutputDir(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const baseDir = path.join(os.homedir(), '.cdp-custodial-access', 'runs');
  return path.join(baseDir, WORKFLOW_NAME, date, time);
}

// ─── Helpers ─────────────────────────────────────────────────────────

// ... site-specific helpers (selector fallbacks, wait-for-content, etc.)

// ─── Main Workflow ───────────────────────────────────────────────────

async function run() {
  const headed = process.argv.includes('--headed');
  const networkTrace = process.argv.includes('--network-trace=full')
    ? 'full' as const
    : process.argv.includes('--network-trace')
      ? true
      : undefined;
  const startTime = Date.now();
  console.log(`[workflow] Starting: ${WORKFLOW_NAME}`);

  const controller = new BrowserController({
    stealth: { level: 'none' },
    profileDir: path.join(os.homedir(), '.cdp-custodial-access', 'profiles'),
  });

  const session = await controller.launch({
    workflow: WORKFLOW_NAME,
    headless: !headed,
    locale: 'en-US',
    timezone: 'America/New_York',
    networkTrace,
  });

  // Set up audit trail
  const outputDir = buildOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });
  session.tracer.setOutputDir(outputDir);

  try {
    // ... workflow steps

    // Save traces + output
    session.tracer.save();
    // ... save files + metadata.json
  } finally {
    session.tracer.save();
    await session.close({ persist: true });
  }
}

run().catch((err) => {
  console.error('[workflow] Fatal error:', err);
  process.exit(1);
});
```

## Tool Quick Reference

All tools are methods on `session` (EnrichedSession). They return `ToolResult<T>` — check `result.success` before using `result.data`.

### Navigation
| Method | Params | Description |
|--------|--------|-------------|
| `session.navigate({url, waitUntil?, timeout?})` | `url: string`, `waitUntil: 'load'\|'domcontentloaded'\|'networkidle0'\|'networkidle2'` | Go to URL |
| `session.search({query, engine?})` | `engine: 'duckduckgo'\|'google'\|'bing'` | Search via engine |
| `session.goBack()` | — | Browser back |
| `session.wait({ms})` | `ms: number` | Pause execution |

### Interaction
| Method | Params | Description |
|--------|--------|-------------|
| `session.click({selector, timeout?})` | CSS/XPath/text/aria selector | Click with Bezier mouse movement |
| `session.input({selector, text, timeout?})` | | Type with human-like delays |
| `session.scroll({direction, amount?})` | `direction: 'up'\|'down'\|'left'\|'right'` | Smooth momentum scroll |
| `session.sendKeys({keys})` | e.g. `'Enter'`, `'Escape'`, `'Tab'` | Keyboard shortcuts |
| `session.findText({text})` | | Find and scroll to text on page |
| `session.uploadFile({selector, filePath})` | | Upload file to input |

### Forms
| Method | Params | Description |
|--------|--------|-------------|
| `session.getDropdownOptions({selector})` | | List `<select>` options |
| `session.selectDropdown({selector, value})` | | Choose dropdown value |

### Extraction
| Method | Params | Description |
|--------|--------|-------------|
| `session.extract({selector?})` | CSS selector or omit for full page text | Extract elements or text |
| `session.screenshot({fullPage?})` | | Capture as base64 PNG |
| `session.getPageContent()` | — | Clean text + title + URL |
| `(await session.page()).content()` | — | Raw full HTML (escape hatch) |
| `session.llmExtract({instruction, schema?, llm, selector?})` | `llm: {provider, model}`, JSON schema for structured output | Extract structured data from visited pages via LLM |

### Tabs
| Method | Params | Description |
|--------|--------|-------------|
| `session.listTabs()` | — | All tabs with URLs/titles |
| `session.switchTab({index})` | 0-based index | Switch to tab |
| `session.closeTab({index?})` | | Close tab |

### Authentication
| Method | Params | Description |
|--------|--------|-------------|
| `session.autoLogin({loginUrl, successSelector, workflow, profile?, timeout?})` | | Auto-login: check session → replay stored credentials → fall back to manual |
| `session.promptCredentialSave({loginUrl, workflow, profile?})` | | Post-workflow CLI prompt to capture and store credentials |
| `session.checkLogin({loggedInSelector?, loggedOutSelector?, checkUrl?})` | | Verify if session is authenticated |
| `session.waitForLogin({loginUrl?, successSelector?, timeout?})` | | Wait for manual login in headed mode |
| `session.exportCookies({domains?})` | | Export all cookies as portable JSON |
| `session.importCookies({cookies})` | | Import cookies from exported JSON |
| `session.requestHumanIntervention({reason, tunnel?, notifier?, timeoutMs?, streamQuality?, allowNavigation?})` | | Pause automation, stream live browser to a public URL for human to complete a step (captcha, verification, etc.), resume when Done clicked. Returns a handle — call `handle.waitForCompletion()` to block until done. Requires `@ngrok/ngrok` + `NGROK_AUTHTOKEN` for default tunnel. |

### Site Discovery (session-independent)
| Function | Params | Description |
|----------|--------|-------------|
| `fetchSitemap({url, maxEntries?})` | Import from `../src/tools/sitemap.js` | Parse sitemap.xml, handles sitemap index |
| `fetchRobots({url})` | Import from `../src/tools/robots.js` | Parse robots.txt rules + sitemap URLs |
| `isUrlAllowed({url, rules})` | Import from `../src/tools/robots.js` | Check if URL is allowed by robots.txt |

## Conventions

- **Stealth**: Always use `level: 'none'` — the stealth plugin alone is sufficient and custom patches trigger detection on aggressive sites.
- **Locale**: Always set `locale: 'en-US'` and `timezone` explicitly — random fingerprint picks can cause foreign language pages.
- **Profile**: Pass `workflow: WORKFLOW_NAME` to auto-namespace profiles. Uses `'default'` profile unless user specifies otherwise. Profiles persist cookies across runs.
- **Selectors**: Provide multiple fallback selectors for critical elements (sites change markup). Use a `trySelector()` helper that tries each in order.
- **Waiting**: After navigation, add `session.wait({ms: 2000-3000})` for page settle. For dynamic content, poll with `page.evaluate()` until content stabilizes.
- **Output**: Always save `metadata.json` alongside extracted data. Include workflow name, timestamps, duration, URL, and file list.
- **Logging**: Use `console.log('[workflow] ...')` prefix for all output.
- **Error handling**: Check `result.success` after each tool call. Throw on critical failures (navigation), warn on non-critical ones.
- **Auth workflows**: If the use case involves a site requiring login, add the login gate pattern (see below). First run with `--headed` for manual login, subsequent runs use persisted cookies.

## Selector Resilience Pattern

```typescript
const SELECTORS = [
  'button[data-testid="submit"]',    // Most stable: data-testid
  'button[aria-label="Submit"]',      // Accessible
  'button.submit-btn',                // Class-based
  'button[type="submit"]',            // Semantic fallback
];

async function trySelector(session, selectors, timeout) {
  for (const sel of selectors) {
    const result = await session.click({ selector: sel, timeout });
    if (result.success) return sel;
  }
  return null;
}
```

## Wait-for-Content Pattern

For pages with dynamic/streaming content:

```typescript
async function waitForContent(session, timeoutMs) {
  const page = await session.page();
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    const len = await page.evaluate(() => document.body.innerText.length);
    if (len > 0 && len === lastLength) {
      stableCount++;
      if (stableCount >= 3) return; // Stable for 3 polls
    } else {
      stableCount = 0;
    }
    lastLength = len;
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

## Authenticated Workflow Pattern

For sites requiring login (LinkedIn, Gmail, etc.), use `autoLogin` which handles the full flow: check existing session → replay stored credentials → fall back to manual login in headed mode → prompt to save credentials after.

**Important:** `autoLogin` can report `existing-session` success even when the site triggers a post-auth challenge (device verification, app confirmation). Always verify the target page actually loaded after `autoLogin` before proceeding with workflow logic.

```typescript
import { CredentialStore } from '../../src/core/credential-store.js';

// After launch + close extra tabs...

// Declare loginResult outside try so it's accessible in finally
let loginResult: Awaited<ReturnType<typeof session.autoLogin>> | undefined;
let challengeEncountered = false;

try {
  // Navigate to a page that requires auth
  await session.navigate({ url: 'https://linkedin.com/feed' });
  await session.wait({ ms: 2000 });

  // Auto-login: checks session → tries stored credentials → falls back to manual
  loginResult = await session.autoLogin({
    loginUrl: 'https://linkedin.com/login',
    successSelector: '.feed-identity-module',
    workflow: WORKFLOW_NAME,
    profile,
  });

  if (!loginResult.success) {
    throw new Error(`Login failed: ${loginResult.error}`);
  }

  // Let the page settle after login
  if (loginResult.data?.method !== 'existing-session') {
    await session.wait({ ms: 5000 });
  }

  // IMPORTANT: Verify target page loaded (detect post-auth challenges)
  // Check URL for /checkpoint/ or /challenge, title for "Challenge"/"Verify"
  // In headed mode: poll and wait for user to resolve challenge
  // In headless mode: throw with --headed suggestion
  // See ensureFeedLoaded() in linkedin-feed.ts for full pattern

  // ... workflow logic ...

} finally {
  // Prompt to save credentials if:
  //  - manual login was used, or
  //  - a challenge required manual interaction, or
  //  - no credentials are stored yet (proactive save for future headless runs)
  const store = new CredentialStore();
  const hasStoredCreds = store.exists(WORKFLOW_NAME, profile);
  if (loginResult?.data?.promptSaveAfter || challengeEncountered || !hasStoredCreds) {
    await session.promptCredentialSave({
      loginUrl: 'https://linkedin.com/login',
      workflow: WORKFLOW_NAME,
      profile,
    });
  }
  session.tracer.save();
  await session.close({ persist: true });
}
```

The profile persists cookies automatically via `session.close({ persist: true })`. Credentials are stored at `~/.cdp-custodial-access/credentials/{workflow}/{profile}.json` and replayed automatically on session expiry.

## Registry Entry

After generating the workflow, add an entry to `workflows/registry.json`:

```json
"{name}": {
  "description": "{one-line description from workflow comment}",
  "file": "simple/{name}.ts",
  "type": "SIMPLE",
  "params": {
    // Add an entry for each CLI parameter the workflow accepts (excluding --headed)
    // Example:
    // "url": { "type": "string", "required": true, "hint": "The URL to process" }
  }
}
```

## Reference Workflow

See `workflows/simple/example.ts` for a complete working ChatGPT workflow demonstrating all patterns.