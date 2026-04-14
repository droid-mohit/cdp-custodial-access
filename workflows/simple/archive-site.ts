/**
 * @prompt Archive a website to PDF — crawl all same-domain links 1 level deep from the start page and merge into a single PDF
 *
 * Workflow: Website Archiver
 *
 * Crawls a website 1 level deep (start page + all same-domain links found on it),
 * captures each page as PDF, and merges into a single archive.pdf.
 *
 * Output: ~/.cdp-custodial-access/runs/archive-site/{YYYY-MM-DD}/{HH-mm-ss}/
 *
 * Usage:
 *   npx tsx workflows/simple/archive-site.ts <url> [--headed] [--max-pages N]
 *
 * Examples:
 *   npx tsx workflows/simple/archive-site.ts https://docs.example.com
 *   npx tsx workflows/simple/archive-site.ts https://example.com --max-pages 20
 */

import { BrowserController } from '../../src/sdk/browser-controller.js';
import { fetchSitemap } from '../../src/tools/sitemap.js';
import { fetchRobots, isUrlAllowed } from '../../src/tools/robots.js';
import type { RobotsRule } from '../../src/tools/robots.js';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Config ──────────────────────────────────────────────────────────

const WORKFLOW_NAME = path.basename(import.meta.filename, path.extname(import.meta.filename));
const DEFAULT_MAX_PAGES = 50;
const PAGE_SETTLE_MS = 500;
const NAV_TIMEOUT_MS = 30000;

// ─── CLI Args ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith('http'));
  const headed = args.includes('--headed');
  const maxPagesIdx = args.indexOf('--max-pages');
  const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : DEFAULT_MAX_PAGES;

  if (!url) {
    console.error('Usage: npx tsx workflows/simple/archive-site.ts <url> [--headed] [--max-pages N]');
    process.exit(1);
  }

  return { url, headed, maxPages };
}

// ─── Output Directory ────────────────────────────────────────────────

function buildOutputDir(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const baseDir = path.join(os.homedir(), '.cdp-custodial-access', 'runs');
  return path.join(baseDir, WORKFLOW_NAME, date, time);
}

// ─── Main Workflow ───────────────────────────────────────────────────

async function run() {
  const { url, headed, maxPages } = parseArgs();
  const networkTrace = process.argv.includes('--network-trace=full')
    ? 'full' as const
    : process.argv.includes('--network-trace')
      ? true
      : undefined;
  const startTime = Date.now();

  // PDF generation requires headless mode
  if (headed) {
    console.warn('[archive] Warning: --headed mode does not support PDF generation. Running in headless mode instead.');
  }

  console.log(`[archive] Starting: ${WORKFLOW_NAME}`);
  console.log(`[archive] URL: ${url}`);
  console.log(`[archive] Max pages: ${maxPages}`);

  const controller = new BrowserController({
    stealth: { level: 'none' },
    profileDir: path.join(os.homedir(), '.cdp-custodial-access', 'profiles'),
  });

  const session = await controller.launch({
    workflow: WORKFLOW_NAME,
    headless: true, // PDF requires headless
    locale: 'en-US',
    timezone: 'America/New_York',
    networkTrace,
  });

  const outputDir = buildOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });
  session.tracer.setOutputDir(outputDir);

  const captured: Array<{ url: string; title: string; pdf: Uint8Array }> = [];
  const failed: Array<{ url: string; error: string }> = [];

  try {
    const page = await session.page();
    const baseUrl = url.replace(/\/$/, '');
    const baseDomain = new URL(baseUrl).hostname;

    // 1. Fetch robots.txt — respect crawl restrictions
    console.log(`[archive] Checking robots.txt...`);
    let robotsRules: RobotsRule[] = [];
    const robotsResult = await fetchRobots({ url: baseUrl });
    if (robotsResult.success && robotsResult.data) {
      robotsRules = robotsResult.data.rules;
      const disallowCount = robotsRules.reduce((sum, r) => sum + r.disallow.length, 0);
      console.log(`[archive] robots.txt: ${robotsRules.length} rule(s), ${disallowCount} disallowed path(s)`);

      // Check if robots.txt declares sitemaps
      if (robotsResult.data.sitemaps.length > 0) {
        console.log(`[archive] robots.txt declares ${robotsResult.data.sitemaps.length} sitemap(s)`);
      }
    } else {
      console.log(`[archive] No robots.txt found — all paths allowed`);
    }

    // 2. Discover pages — try sitemap first, fall back to link crawling
    let discoveredUrls: string[] = [];
    let discoveryMethod: 'sitemap' | 'crawl';

    // Try sitemap.xml (also try URLs from robots.txt Sitemap directives)
    console.log(`[archive] Looking for sitemap.xml...`);
    const sitemapUrlsToTry = [baseUrl];
    if (robotsResult.success && robotsResult.data?.sitemaps.length) {
      sitemapUrlsToTry.push(...robotsResult.data.sitemaps);
    }

    for (const sitemapUrl of sitemapUrlsToTry) {
      const sitemapResult = await fetchSitemap({ url: sitemapUrl, maxEntries: maxPages });
      if (sitemapResult.success && sitemapResult.data && sitemapResult.data.entries.length > 0) {
        discoveredUrls = sitemapResult.data.entries
          .filter((e) => {
            try { return new URL(e.url).hostname === baseDomain; } catch { return false; }
          })
          .map((e) => e.url);
        discoveryMethod = 'sitemap';
        console.log(`[archive] Sitemap found: ${sitemapResult.data.totalFound} URLs (using ${sitemapResult.data.sitemapUrls.join(', ')})`);
        break;
      }
    }

    // Fallback: crawl start page for same-domain links
    if (discoveredUrls.length === 0) {
      console.log(`[archive] No sitemap found — falling back to link discovery from start page`);
      discoveryMethod = 'crawl';

      await session.navigate({ url, waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
      await session.wait({ ms: PAGE_SETTLE_MS });

      discoveredUrls = await page.evaluate((domain: string) => {
        const links = new Set<string>();
        const anchors = document.querySelectorAll('a[href]');
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          try {
            const u = new URL(href);
            if (u.hostname === domain && u.protocol.startsWith('http')) {
              u.hash = '';
              links.add(u.toString());
            }
          } catch { /* skip invalid */ }
        }
        return Array.from(links);
      }, baseDomain);
    }

    // 3. Filter by robots.txt and deduplicate
    const preFilterCount = discoveredUrls.length;
    discoveredUrls = discoveredUrls.filter((u) =>
      isUrlAllowed({ url: u, rules: robotsRules }),
    );
    const filteredCount = preFilterCount - discoveredUrls.length;
    if (filteredCount > 0) {
      console.log(`[archive] Filtered ${filteredCount} URL(s) disallowed by robots.txt`);
    }

    // Ensure start page is included and deduplicate
    const allUrls = [...new Set([url, ...discoveredUrls])].slice(0, maxPages);
    console.log(`[archive] ${allUrls.length} pages to archive (source: ${discoveryMethod}, domain: ${baseDomain})`);

    // 3. Capture each page as PDF
    for (let i = 0; i < allUrls.length; i++) {
      const pageUrl = allUrls[i];
      console.log(`[archive] [${i + 1}/${allUrls.length}] ${pageUrl}`);

      try {
        if (page.url() !== pageUrl) {
          await session.navigate({ url: pageUrl, waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
          await session.wait({ ms: PAGE_SETTLE_MS });
        }

        const title = await page.title();

        // Skip 404 / error pages
        const is404 = /not found|404/i.test(title) ||
          await page.evaluate(() => {
            const body = document.body?.innerText?.slice(0, 500) ?? '';
            return /page not found|this page doesn't exist|404/i.test(body);
          });

        if (is404) {
          console.warn(`[archive] Skipping 404 page: ${pageUrl}`);
          failed.push({ url: pageUrl, error: '404 — page not found' });
          continue;
        }

        // Inject source URL header into the page before PDF capture
        await page.evaluate((src: string, num: number, total: number) => {
          const h = document.createElement('div');
          h.id = '__archive_header__';
          h.style.cssText = 'background:#f0f0f0;padding:8px 16px;font-size:11px;font-family:monospace;border-bottom:1px solid #ccc;color:#333;';
          h.textContent = `[${num}/${total}] ${src}`;
          document.body.insertBefore(h, document.body.firstChild);
        }, pageUrl, i + 1, allUrls.length);

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
          timeout: 60000,
        });

        // Clean up injected header
        await page.evaluate(() => document.getElementById('__archive_header__')?.remove());

        captured.push({ url: pageUrl, title, pdf: new Uint8Array(pdfBuffer) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[archive] Failed: ${pageUrl} — ${msg}`);
        failed.push({ url: pageUrl, error: msg });
      }
    }

    if (captured.length === 0) {
      throw new Error('No pages could be archived.');
    }

    // 4. Merge all PDFs
    console.log(`[archive] Merging ${captured.length} pages...`);
    const mergedDoc = await PDFDocument.create();

    for (const cp of captured) {
      try {
        const srcDoc = await PDFDocument.load(cp.pdf);
        const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        for (const p of pages) {
          mergedDoc.addPage(p);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[archive] Merge failed for ${cp.url}: ${msg}`);
      }
    }

    const mergedBytes = await mergedDoc.save();
    const archivePath = path.join(outputDir, 'archive.pdf');
    fs.writeFileSync(archivePath, mergedBytes);

    // 5. Save traces + metadata
    const metadata = {
      workflow: WORKFLOW_NAME,
      startUrl: url,
      domain: baseDomain,
      discoveryMethod,
      robotsRulesApplied: robotsRules.length > 0,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalSteps: session.tracer.stepCount,
      ...(networkTrace ? {
        networkTrace: true,
        networkEntries: session.networkTracer?.getEntryCount() ?? 0,
      } : {}),
      pagesArchived: captured.length,
      pagesFailed: failed.length,
      archived: captured.map((c) => ({ url: c.url, title: c.title })),
      failed,
      outputDir,
      files: ['archive.pdf', 'metadata.json', 'traces/', ...(networkTrace ? ['traces/network.har'] : [])],
    };

    fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log(`[archive] Done!`);
    console.log(`[archive]   archive.pdf   (${(mergedBytes.length / 1024 / 1024).toFixed(1)} MB, ${captured.length} pages)`);
    console.log(`[archive]   traces/       (${session.tracer.stepCount} steps)`);
    if (failed.length > 0) {
      console.log(`[archive]   ${failed.length} page(s) failed`);
    }
    console.log(`[archive] Saved to: ${outputDir}`);
    console.log(`[archive] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  } finally {
    session.tracer.save();
    await session.close({ persist: true });
  }
}

run().catch((err) => {
  console.error('[archive] Fatal error:', err);
  process.exit(1);
});
