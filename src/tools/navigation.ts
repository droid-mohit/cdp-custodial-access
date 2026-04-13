import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface NavigateParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

export interface NavigateResult { title: string; url: string; }

export async function navigate(session: BrowserSession, params: NavigateParams): Promise<ToolResult<NavigateResult>> {
  try {
    const page = await session.page();
    await page.goto(params.url, { waitUntil: params.waitUntil ?? 'domcontentloaded', timeout: params.timeout ?? 30000 });
    return {
      success: true,
      data: { title: await page.title(), url: page.url() },
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.NAVIGATION_FAILED };
  }
}

export async function goBack(session: BrowserSession): Promise<ToolResult<NavigateResult>> {
  try {
    const page = await session.page();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    return {
      success: true,
      data: { title: await page.title(), url: page.url() },
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.NAVIGATION_FAILED };
  }
}

export interface WaitParams { ms: number; }

export async function waitTool(session: BrowserSession, params: WaitParams): Promise<ToolResult<void>> {
  await new Promise((resolve) => setTimeout(resolve, params.ms));
  return { success: true, metadata: { url: '', timestamp: Date.now() } };
}

export interface SearchParams { query: string; engine?: 'duckduckgo' | 'google' | 'bing'; }

export async function search(session: BrowserSession, params: SearchParams): Promise<ToolResult<NavigateResult>> {
  const encoded = encodeURIComponent(params.query);
  let url: string;
  switch (params.engine ?? 'duckduckgo') {
    case 'google': url = `https://www.google.com/search?q=${encoded}`; break;
    case 'bing': url = `https://www.bing.com/search?q=${encoded}`; break;
    case 'duckduckgo': default: url = `https://duckduckgo.com/?q=${encoded}`; break;
  }
  return navigate(session, { url });
}
