import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface ScreenshotParams { fullPage?: boolean; }
export interface ScreenshotResult { base64: string; }

export async function screenshot(session: BrowserSession, params: ScreenshotParams): Promise<ToolResult<ScreenshotResult>> {
  try {
    const page = await session.page();
    const buffer = await page.screenshot({ fullPage: params.fullPage ?? false, encoding: 'binary' });
    const base64 = Buffer.from(buffer).toString('base64');
    return { success: true, data: { base64 }, metadata: { url: page.url(), timestamp: Date.now() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}

export interface GetPageContentResult { text: string; title: string; url: string; }

export async function getPageContent(session: BrowserSession): Promise<ToolResult<GetPageContentResult>> {
  try {
    const page = await session.page();
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
      return clone.innerText?.trim() ?? '';
    });
    return { success: true, data: { text, title: await page.title(), url: page.url() }, metadata: { url: page.url(), timestamp: Date.now() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}

export interface ExtractParams { selector?: string; }
export interface ExtractResult { elements?: Array<{ tag: string; text: string; html?: string }>; text?: string; }

export async function extract(session: BrowserSession, params: ExtractParams): Promise<ToolResult<ExtractResult>> {
  try {
    const page = await session.page();
    if (params.selector) {
      const elements = await page.evaluate((sel: string) => {
        const els = document.querySelectorAll(sel);
        return Array.from(els).map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent?.trim() ?? '', html: el.innerHTML }));
      }, params.selector);
      return { success: true, data: { elements }, metadata: { url: page.url(), timestamp: Date.now() } };
    }
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
      return clone.innerText?.trim() ?? '';
    });
    return { success: true, data: { text }, metadata: { url: page.url(), timestamp: Date.now() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}
