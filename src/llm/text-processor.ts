import { MODEL_DEFAULTS, DEFAULT_MODEL_CONFIG } from './types.js';

/**
 * Strip HTML to meaningful text content.
 * Removes scripts, styles, nav, footer, and other boilerplate.
 */
export function cleanHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Remove nav and footer elements (common boilerplate)
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove SVG elements
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Convert common block elements to newlines
  text = text.replace(/<\/(div|p|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Extract content from HTML using CSS selector-like patterns.
 * This is a simple regex-based extraction for server-side use
 * (no DOM available). Supports basic tag/id/class selectors.
 */
export function extractFromHtml(html: string, selector: string): string {
  // Handle ID selectors: #content → <... id="content">...</...>
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    const regex = new RegExp(`<[^>]+id=["']${escapeRegex(id)}["'][^>]*>[\\s\\S]*?<\\/`, 'i');
    const match = html.match(regex);
    if (match) return cleanHtml(match[0]);
  }

  // Handle class selectors: .article-body → <... class="...article-body...">...</...>
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    const regex = new RegExp(`<[^>]+class=["'][^"']*${escapeRegex(cls)}[^"']*["'][^>]*>[\\s\\S]*?<\\/`, 'i');
    const match = html.match(regex);
    if (match) return cleanHtml(match[0]);
  }

  // Handle tag selectors: table, main, article
  const tagRegex = new RegExp(`<${escapeRegex(selector)}[^>]*>[\\s\\S]*?<\\/${escapeRegex(selector)}>`, 'gi');
  const matches = html.match(tagRegex);
  if (matches) {
    return matches.map((m) => cleanHtml(m)).join('\n\n');
  }

  // Fallback: clean the whole HTML
  return cleanHtml(html);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PageContent {
  url: string;
  title?: string;
  content: string;
}

/**
 * Build the LLM input from collected page contents.
 * Each page is separated with a clear delimiter for the LLM.
 */
export function buildExtractionInput(pages: PageContent[]): string {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    parts.push(`${'═'.repeat(60)}`);
    parts.push(`PAGE ${i + 1} of ${pages.length}`);
    parts.push(`URL: ${page.url}`);
    if (page.title) parts.push(`Title: ${page.title}`);
    parts.push(`${'═'.repeat(60)}`);
    parts.push('');
    parts.push(page.content);
    parts.push('');
  }
  return parts.join('\n');
}

/**
 * Estimate token count from character length.
 */
export function estimateTokens(text: string, model: string): number {
  const config = MODEL_DEFAULTS[model] ?? DEFAULT_MODEL_CONFIG;
  return Math.ceil(text.length / config.avgCharsPerToken);
}

/**
 * Split text into chunks that fit within the model's context window,
 * reserving space for the system prompt and output tokens.
 */
export function chunkText(
  text: string,
  model: string,
  reservedTokens: number = 20000,
): string[] {
  const config = MODEL_DEFAULTS[model] ?? DEFAULT_MODEL_CONFIG;
  const maxInputTokens = config.maxContextTokens - reservedTokens;
  const maxCharsPerChunk = maxInputTokens * config.avgCharsPerToken;

  if (text.length <= maxCharsPerChunk) {
    return [text];
  }

  // Split on page boundaries first (our delimiter)
  const pageDelimiter = '═'.repeat(60);
  const pages = text.split(pageDelimiter).filter((p) => p.trim());

  const chunks: string[] = [];
  let currentChunk = '';

  for (const page of pages) {
    const candidate = currentChunk + pageDelimiter + page;
    if (candidate.length > maxCharsPerChunk && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = pageDelimiter + page;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  // If a single page is too large, split by paragraphs
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxCharsPerChunk) {
      finalChunks.push(chunk);
    } else {
      // Split by double newlines
      const paragraphs = chunk.split(/\n\n+/);
      let subChunk = '';
      for (const para of paragraphs) {
        if ((subChunk + '\n\n' + para).length > maxCharsPerChunk && subChunk) {
          finalChunks.push(subChunk);
          subChunk = para;
        } else {
          subChunk = subChunk ? subChunk + '\n\n' + para : para;
        }
      }
      if (subChunk.trim()) {
        finalChunks.push(subChunk);
      }
    }
  }

  return finalChunks;
}
