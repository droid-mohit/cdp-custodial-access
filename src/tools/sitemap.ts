import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface FetchSitemapParams {
  /** Base URL of the site (e.g., 'https://example.com') or direct sitemap URL */
  url: string;
  /** Max entries to return (default: 500) */
  maxEntries?: number;
}

export interface FetchSitemapResult {
  entries: SitemapEntry[];
  /** Sitemap URLs that were fetched (includes sub-sitemaps from sitemap index) */
  sitemapUrls: string[];
  totalFound: number;
}

/**
 * Fetch and parse a site's sitemap.xml.
 * Handles both regular sitemaps and sitemap index files (which point to sub-sitemaps).
 * Tries common sitemap locations if the URL doesn't point directly to a sitemap.
 */
export async function fetchSitemap(
  params: FetchSitemapParams,
): Promise<ToolResult<FetchSitemapResult>> {
  try {
    const maxEntries = params.maxEntries ?? 500;
    const baseUrl = params.url.replace(/\/$/, '');

    // Determine sitemap URLs to try
    const sitemapUrls = params.url.endsWith('.xml')
      ? [params.url]
      : [
          `${baseUrl}/sitemap.xml`,
          `${baseUrl}/sitemap_index.xml`,
          `${baseUrl}/sitemap/sitemap.xml`,
        ];

    const fetchedFrom: string[] = [];
    let allEntries: SitemapEntry[] = [];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CDPCustodialAccess/0.1)' },
        });

        if (!response.ok) continue;

        const xml = await response.text();
        if (!xml.includes('<urlset') && !xml.includes('<sitemapindex')) continue;

        fetchedFrom.push(sitemapUrl);

        // Check if this is a sitemap index (points to sub-sitemaps)
        if (xml.includes('<sitemapindex')) {
          const subSitemapUrls = extractTagContent(xml, 'loc');
          for (const subUrl of subSitemapUrls) {
            if (allEntries.length >= maxEntries) break;
            try {
              const subResponse = await fetch(subUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CDPCustodialAccess/0.1)' },
              });
              if (!subResponse.ok) continue;
              const subXml = await subResponse.text();
              const subEntries = parseSitemapXml(subXml);
              fetchedFrom.push(subUrl);
              allEntries.push(...subEntries);
            } catch {
              // Skip failed sub-sitemaps
            }
          }
        } else {
          allEntries.push(...parseSitemapXml(xml));
        }

        break; // Found a working sitemap, stop trying alternatives
      } catch {
        continue;
      }
    }

    if (fetchedFrom.length === 0) {
      return {
        success: false,
        error: `No sitemap found. Tried: ${sitemapUrls.join(', ')}`,
        errorCode: ToolErrorCode.NAVIGATION_FAILED,
      };
    }

    const totalFound = allEntries.length;
    allEntries = allEntries.slice(0, maxEntries);

    return {
      success: true,
      data: {
        entries: allEntries,
        sitemapUrls: fetchedFrom,
        totalFound,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

function parseSitemapXml(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  // Split by <url> blocks
  const urlBlocks = xml.split(/<url>/i).slice(1);

  for (const block of urlBlocks) {
    const loc = extractFirstTagContent(block, 'loc');
    if (!loc) continue;

    const entry: SitemapEntry = { url: loc };

    const lastmod = extractFirstTagContent(block, 'lastmod');
    if (lastmod) entry.lastmod = lastmod;

    const changefreq = extractFirstTagContent(block, 'changefreq');
    if (changefreq) entry.changefreq = changefreq;

    const priority = extractFirstTagContent(block, 'priority');
    if (priority) entry.priority = parseFloat(priority);

    entries.push(entry);
  }

  return entries;
}

function extractTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractFirstTagContent(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[1].trim();
}
