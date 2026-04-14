/**
 * @prompt I want to access linkedin and extract all the latest happenings from my feed. No llm extraction, just pure html extraction. store it in feed.txt
 *
 * Workflow: LinkedIn Feed Extractor
 *
 * Navigates to LinkedIn feed, scrolls to load posts, and extracts the full
 * feed text content into feed.txt using pure HTML extraction (no LLM).
 *
 * Output: ~/.cdp-custodial-access/runs/linkedin-feed/{YYYY-MM-DD}/{HH-mm-ss}/
 *
 * Usage: npx tsx workflows/simple/linkedin-feed.ts [--headed]
 */

import { BrowserController } from '../../src/sdk/browser-controller.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Config ──────────────────────────────────────────────────────────

const WORKFLOW_NAME = path.basename(import.meta.filename, path.extname(import.meta.filename));
const LINKEDIN_FEED_URL = 'https://www.linkedin.com/feed/';
const LINKEDIN_LOGIN_URL = 'https://www.linkedin.com/login';

/** Number of scroll iterations to load more feed posts */
const SCROLL_ITERATIONS = 8;
/** Pause between scrolls to let content load (ms) */
const SCROLL_SETTLE_MS = 3000;
/** Login timeout for headed mode (ms) */
const LOGIN_TIMEOUT = 120_000;

/** Selectors indicating a logged-in state */
const LOGGED_IN_SELECTORS = [
  '[data-testid="mainFeed"]',
  '[data-testid="primary-nav"]',
  '[role="main"]',
];

/** Selectors for feed post containers */
const FEED_POST_SELECTORS = [
  '[data-testid="mainFeed"] > div',
  '[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]',
  '[data-testid="mainFeed"] [role="listitem"]',
];

// ─── Output Directory ────────────────────────────────────────────────

function buildOutputDir(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const baseDir = path.join(os.homedir(), '.cdp-custodial-access', 'runs');
  return path.join(baseDir, WORKFLOW_NAME, date, time);
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Try multiple selectors to detect element presence on page.
 * Returns the first selector that matches, or null.
 */
async function detectSelector(
  session: Awaited<ReturnType<BrowserController['launch']>>,
  selectors: string[],
): Promise<string | null> {
  const page = await session.page();
  for (const sel of selectors) {
    const found = await page.evaluate((s: string) => !!document.querySelector(s), sel);
    if (found) return sel;
  }
  return null;
}

/**
 * Scroll down multiple times to trigger LinkedIn's lazy-loading feed.
 * Returns the total text length after scrolling for logging.
 */
async function scrollToLoadFeed(
  session: Awaited<ReturnType<BrowserController['launch']>>,
  iterations: number,
  settleMs: number,
): Promise<number> {
  for (let i = 0; i < iterations; i++) {
    await session.scroll({ direction: 'down', amount: 3 });
    await session.wait({ ms: settleMs });

    try {
      const page = await session.page();
      const postCount = await page.evaluate((selectors: string[]) => {
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) return els.length;
        }
        return 0;
      }, FEED_POST_SELECTORS);
      session.tracer.log(`[workflow] Scroll ${i + 1}/${iterations} — ${postCount} posts loaded`);
    } catch {
      session.tracer.log(`[workflow] Scroll ${i + 1}/${iterations} — post count unavailable`);
    }
  }

  // Scroll back to top for a clean final snapshot
  try {
    const page = await session.page();
    await page.evaluate(() => window.scrollTo(0, 0));
    await session.wait({ ms: 1000 });
    return await page.evaluate(() => document.body.innerText.length);
  } catch {
    return 0;
  }
}

// ─── Main Workflow ───────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

async function run() {
  const headed = process.argv.includes('--headed');
  const profile = getArg('--profile') ?? 'default';
  const startTime = Date.now();

  console.log(`[workflow] Starting: ${WORKFLOW_NAME}`);
  console.log(`[workflow] Profile: ${profile}`);
  console.log(`[workflow] Mode: ${headed ? 'headed' : 'headless'}`);

  const controller = new BrowserController({
    stealth: { level: 'none' },
    profileDir: path.join(os.homedir(), '.cdp-custodial-access', 'profiles'),
  });

  const session = await controller.launch({
    workflow: WORKFLOW_NAME,
    profile,
    headless: !headed,
    locale: 'en-US',
    timezone: 'America/New_York',
  });

  // Close extra tabs from Chrome session restore
  const openPages = await session.pages();
  if (openPages.length > 1) {
    session.tracer.log(`[workflow] Closing ${openPages.length - 1} restored tab(s)...`);
    for (let i = 1; i < openPages.length; i++) {
      await openPages[i].close();
    }
  }

  // Set up audit trail
  const outputDir = buildOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });
  session.tracer.setOutputDir(outputDir);

  try {
    // 1. Navigate to LinkedIn feed
    session.tracer.log('[workflow] Navigating to LinkedIn feed...');
    const navResult = await session.navigate({
      url: LINKEDIN_FEED_URL,
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    if (!navResult.success) {
      throw new Error(`Navigation failed: ${navResult.error}`);
    }
    session.tracer.log(`[workflow] Page loaded: ${navResult.data?.title}`);
    await session.wait({ ms: 3000 });

    // 2. Check login status
    const loginCheck = await session.checkLogin({
      checkUrl: LINKEDIN_FEED_URL,
      loggedInSelector: LOGGED_IN_SELECTORS[0],
    });

    if (!loginCheck.data?.isLoggedIn) {
      // Try other selectors before giving up
      const foundSel = await detectSelector(session, LOGGED_IN_SELECTORS);

      if (!foundSel) {
        if (!headed) {
          throw new Error(
            'Not logged in to LinkedIn. Run with --headed to login:\n' +
            `  npx tsx workflows/${WORKFLOW_NAME}.ts --headed`,
          );
        }

        // Headed mode — manual login
        session.tracer.log('[workflow] Not logged in. Please log in via the browser window...');
        await session.navigate({ url: LINKEDIN_LOGIN_URL });
        await session.waitForLogin({
          loginUrl: LINKEDIN_LOGIN_URL,
          successSelector: LOGGED_IN_SELECTORS[0],
          timeout: LOGIN_TIMEOUT,
        });
        session.tracer.log('[workflow] Login successful!');

        // waitForLogin already lands on the feed — just let it settle
        await session.wait({ ms: 5000 });
      }
    }

    session.tracer.log('[workflow] Logged in — feed is accessible.');

    // 3. Scroll to load feed posts
    session.tracer.log('[workflow] Scrolling to load feed posts...');
    const totalTextLen = await scrollToLoadFeed(session, SCROLL_ITERATIONS, SCROLL_SETTLE_MS);
    session.tracer.log(`[workflow] Feed loaded — ${(totalTextLen / 1024).toFixed(1)} KB of text content`);

    // 4. Extract full page text (no LLM — pure HTML text extraction)
    session.tracer.log('[workflow] Extracting feed content...');
    const contentResult = await session.getPageContent();

    if (!contentResult.success || !contentResult.data) {
      throw new Error(`Content extraction failed: ${contentResult.error}`);
    }

    const feedText = contentResult.data.text;
    session.tracer.log(`[workflow] Extracted ${feedText.length} characters of feed text`);

    // 5. Save feed.txt
    const feedPath = path.join(outputDir, 'feed.txt');
    fs.writeFileSync(feedPath, feedText, 'utf-8');

    // 6. Save traces
    session.tracer.save();

    // 7. Save metadata
    const metadata = {
      workflow: WORKFLOW_NAME,
      url: contentResult.data.url,
      title: contentResult.data.title,
      scrollIterations: SCROLL_ITERATIONS,
      feedTextLength: feedText.length,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalSteps: session.tracer.stepCount,
      outputDir,
      files: ['feed.txt', 'metadata.json', 'traces/'],
    };

    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    session.tracer.log(`[workflow] Saved to: ${outputDir}`);
    session.tracer.log(`[workflow]   feed.txt      (${(feedText.length / 1024).toFixed(1)} KB)`);
    session.tracer.log(`[workflow]   metadata.json`);
    session.tracer.log(`[workflow]   traces/       (${session.tracer.stepCount} steps)`);
    session.tracer.log(`[workflow] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  } finally {
    session.tracer.save();
    await session.close({ persist: true });
    session.tracer.log('[workflow] Session persisted and closed.');
  }
}

run().catch((err) => {
  console.error('[workflow] Fatal error:', err);
  process.exit(1);
});