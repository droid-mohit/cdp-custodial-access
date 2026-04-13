import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export interface FetchRobotsParams {
  /** Base URL of the site (e.g., 'https://example.com') */
  url: string;
}

export interface FetchRobotsResult {
  rules: RobotsRule[];
  sitemaps: string[];
  rawText: string;
}

/**
 * Fetch and parse a site's robots.txt.
 * Returns structured rules and any sitemap URLs declared in it.
 */
export async function fetchRobots(
  params: FetchRobotsParams,
): Promise<ToolResult<FetchRobotsResult>> {
  try {
    const baseUrl = params.url.replace(/\/$/, '');
    const robotsUrl = `${baseUrl}/robots.txt`;

    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CDPCustodialAccess/0.1)' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No robots.txt = everything allowed
        return {
          success: true,
          data: { rules: [], sitemaps: [], rawText: '' },
        };
      }
      return {
        success: false,
        error: `Failed to fetch robots.txt: HTTP ${response.status}`,
        errorCode: ToolErrorCode.NAVIGATION_FAILED,
      };
    }

    const rawText = await response.text();
    const { rules, sitemaps } = parseRobotsTxt(rawText);

    return {
      success: true,
      data: { rules, sitemaps, rawText },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

export interface IsAllowedParams {
  /** The URL to check */
  url: string;
  /** Parsed robots rules (from fetchRobots) */
  rules: RobotsRule[];
  /** User agent to match against (default: '*') */
  userAgent?: string;
}

/**
 * Check if a URL is allowed by robots.txt rules.
 * Matches against the specific user-agent first, falls back to '*'.
 */
export function isUrlAllowed(params: IsAllowedParams): boolean {
  const { url, rules, userAgent = '*' } = params;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return true; // Can't parse URL, allow by default
  }

  // Find matching rules: specific user-agent first, then wildcard
  const matchingRules = rules.filter(
    (r) => r.userAgent === userAgent || r.userAgent === '*',
  );

  // Sort: specific user-agent rules take priority over wildcard
  matchingRules.sort((a, b) => {
    if (a.userAgent === userAgent && b.userAgent !== userAgent) return -1;
    if (b.userAgent === userAgent && a.userAgent !== userAgent) return 1;
    return 0;
  });

  for (const rule of matchingRules) {
    // Check disallow first (more specific paths win)
    for (const pattern of rule.disallow) {
      if (pathMatches(pathname, pattern)) {
        // Check if there's a more specific allow that overrides
        const hasAllowOverride = rule.allow.some(
          (a) => pathMatches(pathname, a) && a.length > pattern.length,
        );
        if (!hasAllowOverride) return false;
      }
    }
  }

  return true;
}

function pathMatches(pathname: string, pattern: string): boolean {
  if (!pattern) return false;

  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\$/g, '$') + '',
    );
    return regex.test(pathname);
  }

  // Exact prefix match
  return pathname.startsWith(pattern);
}

function parseRobotsTxt(text: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];
  let currentRule: RobotsRule | null = null;

  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (!value) continue;

    switch (directive) {
      case 'user-agent':
        currentRule = { userAgent: value, allow: [], disallow: [] };
        rules.push(currentRule);
        break;

      case 'disallow':
        if (currentRule) currentRule.disallow.push(value);
        break;

      case 'allow':
        if (currentRule) currentRule.allow.push(value);
        break;

      case 'crawl-delay':
        if (currentRule) currentRule.crawlDelay = parseFloat(value);
        break;

      case 'sitemap':
        sitemaps.push(value);
        break;
    }
  }

  return { rules, sitemaps };
}
