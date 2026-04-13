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
 *   npx tsx workflows/archive-site.ts <url> [--headed] [--max-pages N]
 *
 * Examples:
 *   npx tsx workflows/archive-site.ts https://docs.example.com
 *   npx tsx workflows/archive-site.ts https://example.com --max-pages 20
 */

import { BrowserController } from '../src/sdk/browser-controller.js';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Config ──────────────────────────────────────────────────────────

const WORKFLOW_NAME = path.basename(import.meta.filename, path.extname(import.meta.filename));
const DEFAULT_MAX_PAGES = 50;
const PAGE_SETTLE_MS = 2000;
const NAV_TIMEOUT_MS = 30000;

// ─── CLI Args ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith('http'));
  const headed = args.includes('--headed');
  const maxPagesIdx = args.indexOf('--max-pages');
  const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : DEFAULT_MAX_PAGES;

  if (!url) {
    console.error('Usage: npx tsx workflows/archive-site.ts <url> [--headed] [--max-pages N]');
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
  });

  const outputDir = buildOutputDir();
  fs.mkdirSync(outputDir, { recursive: true });
  session.tracer.setOutputDir(outputDir);

  const captured: Array<{ url: string; title: string; pdf: Uint8Array }> = [];
  const failed: Array<{ url: string; error: string }> = [];

  try {
    const page = await session.page();

    // 1. Navigate to start page
    console.log(`[archive] Loading start page: ${url}`);
    await session.navigate({ url, waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    await session.wait({ ms: PAGE_SETTLE_MS });

    const startUrl = new URL(page.url());
    const baseDomain = startUrl.hostname;

    // 2. Discover same-domain links (1 level deep)
    const discoveredLinks: string[] = await page.evaluate((domain: string) => {
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

    const allUrls = [...new Set([page.url(), ...discoveredLinks])].slice(0, maxPages);
    console.log(`[archive] Found ${allUrls.length} pages on ${baseDomain}`);

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
    session.tracer.save();

    const metadata = {
      workflow: WORKFLOW_NAME,
      startUrl: url,
      domain: baseDomain,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalSteps: session.tracer.stepCount,
      pagesArchived: captured.length,
      pagesFailed: failed.length,
      archived: captured.map((c) => ({ url: c.url, title: c.title })),
      failed,
      outputDir,
      files: ['archive.pdf', 'metadata.json', 'traces/'],
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
