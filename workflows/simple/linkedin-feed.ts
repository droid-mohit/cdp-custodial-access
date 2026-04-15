/**
 * @prompt I want to access linkedin and extract all the latest happenings from my feed. No llm extraction, just pure html extraction. store it in feed.txt
 *
 * @steps
 * 1. Navigate to linkedin.com/feed
 * 2. Authenticate via autoLogin (manual fallback on first run)
 * 3. Verify feed loaded — detect challenge pages, wait for resolution in headed mode
 * 4. Scroll 8 iterations to load feed posts (lazy-loading)
 * 5. Extract full page text via getPageContent() (pure HTML, no LLM)
 * 6. Save feed.txt + metadata.json
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
import { CredentialStore } from '../../src/core/credential-store.js';
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

/** Patterns that indicate a LinkedIn challenge/checkpoint page */
const CHALLENGE_INDICATORS = {
  urlPatterns: ['/checkpoint/', '/challenge'],
  titlePatterns: ['Challenge', 'Security Verification', 'Verify'],
};

/** Max time to wait for a challenge to be resolved in headed mode (ms) */
const CHALLENGE_TIMEOUT_MS = 120_000;
/** Poll interval when waiting for challenge resolution (ms) */
const CHALLENGE_POLL_MS = 3000;

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
 * Detect whether the current page is a LinkedIn challenge/checkpoint.
 */
function isChallengePage(url: string, title: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  return (
    CHALLENGE_INDICATORS.urlPatterns.some((p) => lowerUrl.includes(p.toLowerCase())) ||
    CHALLENGE_INDICATORS.titlePatterns.some((p) => lowerTitle.includes(p.toLowerCase()))
  );
}

/**
 * After autoLogin, verify we actually landed on the feed.
 * If a challenge page is detected:
 *   - Headed mode: wait for the user to resolve it, then verify feed loaded.
 *   - Headless mode: throw with an actionable error.
 */
async function ensureFeedLoaded(
  session: Awaited<ReturnType<BrowserController['launch']>>,
  headed: boolean,
): Promise<{ challengeEncountered: boolean }> {
  const page = await session.page();
  let url = page.url();
  let title = await page.title();

  if (!isChallengePage(url, title)) {
    // No challenge — confirm feed selector is present
    try {
      await page.waitForSelector(LOGGED_IN_SELECTORS[0], { timeout: 10_000 });
      return { challengeEncountered: false }; // Feed is loaded
    } catch {
      // Selector not found — re-check URL in case a redirect happened
      url = page.url();
      title = await page.title();
      if (!isChallengePage(url, title)) {
        throw new Error(
          `Feed did not load. Page title: "${title}", URL: ${url}. ` +
          'Try running with --headed to diagnose.',
        );
      }
    }
  }

  // Challenge page detected
  session.tracer.log(`[workflow] Challenge detected: "${title}" — ${url}`);

  if (!headed) {
    throw new Error(
      `LinkedIn triggered a security challenge ("${title}"). ` +
      'Run with --headed to resolve it manually:\n' +
      `  npx tsx workflows/simple/linkedin-feed.ts --headed`,
    );
  }

  // Headed mode: wait for the user to clear the challenge
  session.tracer.log('[workflow] Waiting for challenge resolution (complete it in the browser)...');
  const deadline = Date.now() + CHALLENGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await session.wait({ ms: CHALLENGE_POLL_MS });
    url = page.url();
    title = await page.title();

    if (!isChallengePage(url, title)) {
      session.tracer.log('[workflow] Challenge resolved. Verifying feed...');
      try {
        await page.waitForSelector(LOGGED_IN_SELECTORS[0], { timeout: 10_000 });
        session.tracer.log('[workflow] Feed loaded after challenge resolution.');
        return { challengeEncountered: true };
      } catch {
        // Might need more time for feed to render after challenge
      }
    }
  }

  throw new Error(
    'Challenge was not resolved within the timeout. ' +
    'Please complete the verification in the browser and re-run the workflow.',
  );
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
  const networkTrace = process.argv.includes('--network-trace=full')
    ? 'full' as const
    : process.argv.includes('--network-trace')
      ? true
      : undefined;
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
    networkTrace,
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

  let loginResult: Awaited<ReturnType<typeof session.autoLogin>> | undefined;
  let challengeEncountered = false;

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

    // 2. Auto-login (checks session → tries stored credentials → falls back to manual)
    session.tracer.log('[workflow] Checking authentication...');
    loginResult = await session.autoLogin({
      loginUrl: LINKEDIN_LOGIN_URL,
      successSelector: LOGGED_IN_SELECTORS[0],
      workflow: WORKFLOW_NAME,
      profile,
    });

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }
    session.tracer.log(`[workflow] Authenticated via ${loginResult.data?.method}.`);

    // Let the feed settle after login
    if (loginResult.data?.method !== 'existing-session') {
      await session.wait({ ms: 5000 });
    }

    // 3. Verify feed loaded (detect challenge pages)
    session.tracer.log('[workflow] Verifying feed is accessible...');
    const feedCheck = await ensureFeedLoaded(session, headed);
    challengeEncountered = feedCheck.challengeEncountered;

    // 4. Scroll to load feed posts
    session.tracer.log('[workflow] Scrolling to load feed posts...');
    const totalTextLen = await scrollToLoadFeed(session, SCROLL_ITERATIONS, SCROLL_SETTLE_MS);
    session.tracer.log(`[workflow] Feed loaded — ${(totalTextLen / 1024).toFixed(1)} KB of text content`);

    // 5. Extract full page text (no LLM — pure HTML text extraction)
    // Verify we're still on the feed (challenge could have appeared mid-scroll)
    const prePage = await session.page();
    const preUrl = prePage.url();
    const preTitle = await prePage.title();
    if (isChallengePage(preUrl, preTitle)) {
      throw new Error(
        `LinkedIn triggered a security challenge during scrolling ("${preTitle}"). ` +
        'Re-run with --headed to resolve it.',
      );
    }

    session.tracer.log('[workflow] Extracting feed content...');
    const contentResult = await session.getPageContent();

    if (!contentResult.success || !contentResult.data) {
      throw new Error(`Content extraction failed: ${contentResult.error}`);
    }

    const feedText = contentResult.data.text;
    session.tracer.log(`[workflow] Extracted ${feedText.length} characters of feed text`);

    // 6. Save feed.txt
    const feedPath = path.join(outputDir, 'feed.txt');
    fs.writeFileSync(feedPath, feedText, 'utf-8');

    // 7. Save traces
    session.tracer.save();

    // 8. Save metadata
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
      ...(networkTrace ? {
        networkTrace: true,
        networkEntries: session.networkTracer?.getEntryCount() ?? 0,
      } : {}),
      outputDir,
      files: ['feed.txt', 'metadata.json', 'traces/', ...(networkTrace ? ['traces/network.har'] : [])],
    };

    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    session.tracer.log(`[workflow] Saved to: ${outputDir}`);
    session.tracer.log(`[workflow]   feed.txt      (${(feedText.length / 1024).toFixed(1)} KB)`);
    session.tracer.log(`[workflow]   metadata.json`);
    session.tracer.log(`[workflow]   traces/       (${session.tracer.stepCount} steps)`);
    session.tracer.log(`[workflow] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  } finally {
    // Prompt to save credentials if:
    //  - manual login was used, or
    //  - a challenge required manual interaction, or
    //  - no credentials are stored yet (so future headless runs can auto-fill)
    const store = new CredentialStore();
    const hasStoredCreds = store.exists(WORKFLOW_NAME, profile);
    if (loginResult?.data?.promptSaveAfter || challengeEncountered || !hasStoredCreds) {
      await session.promptCredentialSave({
        loginUrl: LINKEDIN_LOGIN_URL,
        workflow: WORKFLOW_NAME,
        profile,
      });
    }
    session.tracer.save();
    await session.close({ persist: true });
    session.tracer.log('[workflow] Session persisted and closed.');
  }
}

run().catch((err) => {
  console.error('[workflow] Fatal error:', err);
  process.exit(1);
});