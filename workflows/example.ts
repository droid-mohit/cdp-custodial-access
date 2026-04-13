/**
 * Example Workflow: ChatGPT Trending AI Query
 *
 * Goes to chatgpt.com, submits a prompt about AI trends, waits for the
 * response, and saves the complete page HTML to the output directory.
 *
 * Output storage nomenclature:
 *   ~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/
 *     page.html      — full page HTML after response
 *     metadata.json  — run metadata (timestamp, url, prompt, duration)
 *
 * Usage:
 *   npx tsx workflows/example.ts [--headed]
 */

import { BrowserController } from '../src/sdk/browser-controller.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Config ──────────────────────────────────────────────────────────

const PROMPT = 'What is trending in the world of AI';
/** Derive workflow name from the script filename (e.g. example.ts → example) */
const WORKFLOW_NAME = path.basename(import.meta.filename, path.extname(import.meta.filename));
const CHATGPT_URL = 'https://chatgpt.com/';

/** ChatGPT's prompt textarea — multiple selectors for resilience */
const PROMPT_SELECTORS = [
  'div#prompt-textarea',
  'textarea[placeholder="Ask anything"]',
  'div[contenteditable="true"][id="prompt-textarea"]',
];

/** Send button selectors */
const SEND_BUTTON_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send"]',
];

/** How long to wait for ChatGPT to finish responding (ms) */
const RESPONSE_TIMEOUT = 120_000;
/** Polling interval to check if response is complete (ms) */
const RESPONSE_POLL_INTERVAL = 3_000;

// ─── Output Directory ────────────────────────────────────────────────

/**
 * Build the output directory path using the nomenclature:
 *   ~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/
 *
 * This gives:
 * - Grouping by filename (multiple workflows don't collide)
 * - Date-based partitioning (easy to find runs from a specific day)
 * - Time-based uniqueness (multiple runs per day don't collide)
 * - Chronological sorting by default (ls sorts correctly)
 */
function buildOutputDir(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-mm-ss

  const baseDir = path.join(os.homedir(), '.cdp-custodial-access', 'runs');
  return path.join(baseDir, WORKFLOW_NAME, date, time);
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function trySelector(
  session: Awaited<ReturnType<BrowserController['launch']>>,
  selectors: string[],
  timeout: number,
): Promise<string | null> {
  for (const sel of selectors) {
    const result = await session.click({ selector: sel, timeout });
    if (result.success) return sel;
  }
  return null;
}

/**
 * Wait until ChatGPT finishes generating its response.
 *
 * Strategy: poll the page for assistant message content. Once the content
 * stabilizes (same length for 2 consecutive polls), we consider the
 * response complete. This is more resilient than looking for specific
 * button selectors which change across ChatGPT versions.
 */
async function waitForResponse(
  session: Awaited<ReturnType<BrowserController['launch']>>,
  timeoutMs: number,
): Promise<void> {
  const page = await session.page();
  const start = Date.now();

  // Wait for the first sign of a response (assistant message appearing)
  console.log('[workflow] Waiting for response to start...');
  while (Date.now() - start < timeoutMs) {
    const hasResponse = await page.evaluate(() => {
      // Look for assistant message containers
      const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      if (assistantMsgs.length > 0) return true;
      // Fallback: look for the thinking/loading indicator
      const thinkingDot = document.querySelector('.result-thinking');
      if (thinkingDot) return true;
      // Fallback: any markdown content in the conversation
      const markdown = document.querySelectorAll('.markdown');
      return markdown.length > 0;
    });

    if (hasResponse) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Now wait for the response to stabilize (content stops changing)
  console.log('[workflow] Response started, waiting for completion...');
  let lastLength = 0;
  let stableCount = 0;
  const STABLE_THRESHOLD = 3; // Must be stable for 3 consecutive polls

  while (Date.now() - start < timeoutMs) {
    const currentLength = await page.evaluate(() => {
      // Measure total text length of all assistant messages
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      if (msgs.length === 0) {
        // Fallback: measure all markdown blocks
        const markdown = document.querySelectorAll('.markdown');
        let len = 0;
        markdown.forEach((el) => { len += (el.textContent?.length ?? 0); });
        return len;
      }
      let len = 0;
      msgs.forEach((el) => { len += (el.textContent?.length ?? 0); });
      return len;
    });

    if (currentLength > 0 && currentLength === lastLength) {
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD) {
        // Double-check: make sure no stop/generating button is still visible
        const stillGenerating = await page.evaluate(() => {
          const stopBtn = document.querySelector('button[aria-label="Stop generating"]');
          const stopBtn2 = document.querySelector('[data-testid="stop-button"]');
          return !!(stopBtn || stopBtn2);
        });
        if (!stillGenerating) {
          console.log(`[workflow] Response stabilized at ${currentLength} chars.`);
          await new Promise((r) => setTimeout(r, 1000)); // Final settle
          return;
        }
        stableCount = 0; // Still generating, reset
      }
    } else {
      stableCount = 0;
    }

    lastLength = currentLength;
    await new Promise((r) => setTimeout(r, RESPONSE_POLL_INTERVAL));
  }

  console.warn('[workflow] Response timeout reached — saving whatever is on the page.');
}

// ─── Main Workflow ───────────────────────────────────────────────────

async function run() {
  const headed = process.argv.includes('--headed');
  const startTime = Date.now();

  console.log(`[workflow] Starting: ${WORKFLOW_NAME}`);
  console.log(`[workflow] Prompt: "${PROMPT}"`);
  console.log(`[workflow] Mode: ${headed ? 'headed' : 'headless'}`);

  const controller = new BrowserController({
    stealth: { level: 'none' },
    profileDir: path.join(os.homedir(), '.cdp-custodial-access', 'profiles'),
  });

  const session = await controller.launch({
    profile: 'chatgpt-workflow',
    headless: !headed,
    locale: 'en-US',
    timezone: 'America/New_York',
  });

  try {
    // 1. Navigate to ChatGPT
    console.log('[workflow] Navigating to ChatGPT...');
    const navResult = await session.navigate({
      url: CHATGPT_URL,
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });

    if (!navResult.success) {
      throw new Error(`Navigation failed: ${navResult.error}`);
    }
    console.log(`[workflow] Page loaded: ${navResult.data?.title}`);

    // 2. Wait for the page to fully settle
    await session.wait({ ms: 3000 });

    // 3. Find and click the prompt textarea
    console.log('[workflow] Looking for prompt input...');
    const promptSel = await trySelector(session, PROMPT_SELECTORS, 15_000);
    if (!promptSel) {
      throw new Error('Could not find ChatGPT prompt textarea');
    }
    console.log(`[workflow] Found prompt input: ${promptSel}`);

    // 4. Type the prompt with human-like delays
    console.log('[workflow] Typing prompt...');
    await session.input({ selector: promptSel, text: PROMPT, timeout: 10_000 });

    // 5. Small pause before sending (like a human reviewing their prompt)
    await session.wait({ ms: 1000 });

    // 6. Submit — try send button, fall back to Enter key
    console.log('[workflow] Submitting prompt...');
    const sendSel = await trySelector(session, SEND_BUTTON_SELECTORS, 5_000);
    if (!sendSel) {
      console.log('[workflow] Send button not found, pressing Enter...');
      await session.sendKeys({ keys: 'Enter' });
    }

    // 7. Wait for ChatGPT to finish responding
    console.log('[workflow] Waiting for response...');
    await waitForResponse(session, RESPONSE_TIMEOUT);
    console.log('[workflow] Response complete.');

    // 8. Extract the complete page HTML
    const page = await session.page();
    const fullHtml = await page.content();

    // 9. Save to output directory
    const outputDir = buildOutputDir();
    fs.mkdirSync(outputDir, { recursive: true });

    const htmlPath = path.join(outputDir, 'page.html');
    fs.writeFileSync(htmlPath, fullHtml, 'utf-8');

    const metadata = {
      workflow: WORKFLOW_NAME,
      prompt: PROMPT,
      url: page.url(),
      title: await page.title(),
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      outputDir,
      files: ['page.html', 'metadata.json'],
    };

    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    console.log(`[workflow] Saved to: ${outputDir}`);
    console.log(`[workflow]   page.html     (${(fullHtml.length / 1024).toFixed(1)} KB)`);
    console.log(`[workflow]   metadata.json`);
    console.log(`[workflow] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  } finally {
    // 10. Persist session (keeps cookies/localStorage for next run) and close
    await session.close({ persist: true });
    console.log('[workflow] Session persisted and closed.');
  }
}

run().catch((err) => {
  console.error('[workflow] Fatal error:', err);
  process.exit(1);
});