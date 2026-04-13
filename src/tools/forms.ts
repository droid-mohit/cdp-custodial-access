import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface DropdownOption { value: string; text: string; }

export interface GetDropdownOptionsParams { selector: string; timeout?: number; }

export async function getDropdownOptions(session: BrowserSession, params: GetDropdownOptionsParams): Promise<ToolResult<DropdownOption[]>> {
  try {
    const page = await session.page();
    await page.waitForSelector(params.selector, { timeout: params.timeout ?? 10000 });
    const options = await page.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement | null;
      if (!select) return [];
      return Array.from(select.options).map((opt) => ({ value: opt.value, text: opt.textContent?.trim() ?? '' }));
    }, params.selector);
    return { success: true, data: options, metadata: { url: page.url(), timestamp: Date.now() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.ELEMENT_NOT_FOUND };
  }
}

export interface SelectDropdownParams { selector: string; value: string; timeout?: number; }

export async function selectDropdown(session: BrowserSession, params: SelectDropdownParams): Promise<ToolResult<void>> {
  try {
    const page = await session.page();
    await page.waitForSelector(params.selector, { timeout: params.timeout ?? 10000 });
    await page.evaluate((sel: string, val: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement | null;
      if (!select) throw new Error(`Select not found: ${sel}`);
      select.value = val;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, params.selector, params.value);
    return { success: true, metadata: { url: page.url(), timestamp: Date.now() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.ELEMENT_NOT_FOUND };
  }
}
