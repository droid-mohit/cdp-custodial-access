import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface TabInfo { index: number; url: string; title: string; }
export interface ListTabsResult { tabs: TabInfo[]; }

export async function listTabs(session: BrowserSession): Promise<ToolResult<ListTabsResult>> {
  try {
    const pages = await session.pages();
    const tabs: TabInfo[] = [];
    for (let i = 0; i < pages.length; i++) {
      tabs.push({ index: i, url: pages[i].url(), title: await pages[i].title() });
    }
    return { success: true, data: { tabs } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}

export interface SwitchTabParams { index: number; }

export async function switchTab(session: BrowserSession, params: SwitchTabParams): Promise<ToolResult<TabInfo>> {
  try {
    const pages = await session.pages();
    if (params.index < 0 || params.index >= pages.length) {
      return { success: false, error: `Tab index ${params.index} out of range (0-${pages.length - 1})`, errorCode: ToolErrorCode.CDP_ERROR };
    }
    const page = pages[params.index];
    await page.bringToFront();
    return { success: true, data: { index: params.index, url: page.url(), title: await page.title() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}

export interface CloseTabParams { index?: number; }

export async function closeTab(session: BrowserSession, params: CloseTabParams): Promise<ToolResult<void>> {
  try {
    const pages = await session.pages();
    const index = params.index ?? pages.length - 1;
    if (index < 0 || index >= pages.length) {
      return { success: false, error: `Tab index ${index} out of range`, errorCode: ToolErrorCode.CDP_ERROR };
    }
    await pages[index].close();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}
