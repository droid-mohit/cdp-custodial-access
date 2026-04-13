import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';
import { generateBezierPath, generateTypingDelays, generateScrollSteps } from '../stealth/patches/behavioral.js';

export interface ClickParams {
  selector: string;
  timeout?: number;
}

export interface InputParams {
  selector: string;
  text: string;
  timeout?: number;
}

export interface ScrollParams {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  selector?: string;
}

export interface SendKeysParams {
  keys: string;
}

export interface FindTextParams {
  text: string;
  scrollTo?: boolean;
}

export interface UploadFileParams {
  selector: string;
  filePath: string;
  timeout?: number;
}

export interface ClickResult {
  x: number;
  y: number;
}

export interface FindTextResult {
  found: boolean;
  x?: number;
  y?: number;
}

export async function click(session: BrowserSession, params: ClickParams): Promise<ToolResult<ClickResult>> {
  try {
    const page = await session.page();
    const element = await page.waitForSelector(params.selector, { timeout: params.timeout ?? 5000 });
    if (!element) {
      return { success: false, error: `Element not found: ${params.selector}`, errorCode: ToolErrorCode.ELEMENT_NOT_FOUND };
    }

    const box = await element.boundingBox();
    if (!box) {
      return { success: false, error: 'Element has no bounding box', errorCode: ToolErrorCode.ELEMENT_NOT_FOUND };
    }

    // Randomize click target slightly within element bounds
    const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

    // Get current mouse position (approximate center of viewport as start)
    const startX = 400 + (Math.random() - 0.5) * 100;
    const startY = 300 + (Math.random() - 0.5) * 100;

    const path = generateBezierPath({ x: startX, y: startY }, { x: targetX, y: targetY }, 20);

    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      if (point.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, point.delay));
      }
    }

    await page.mouse.click(targetX, targetY);

    return {
      success: true,
      data: { x: targetX, y: targetY },
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}

export async function input(session: BrowserSession, params: InputParams): Promise<ToolResult<void>> {
  try {
    const page = await session.page();
    const element = await page.waitForSelector(params.selector, { timeout: params.timeout ?? 5000 });
    if (!element) {
      return { success: false, error: `Element not found: ${params.selector}`, errorCode: ToolErrorCode.ELEMENT_NOT_FOUND };
    }

    // Click the element first for focus
    const box = await element.boundingBox();
    if (box) {
      const targetX = box.x + box.width * 0.5;
      const targetY = box.y + box.height * 0.5;
      await page.mouse.move(targetX, targetY);
      await page.mouse.click(targetX, targetY);
    } else {
      await element.click();
    }

    const delays = generateTypingDelays(params.text);
    for (let i = 0; i < params.text.length; i++) {
      await page.keyboard.type(params.text[i]);
      if (delays[i] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[i]));
      }
    }

    return {
      success: true,
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}

export async function scroll(session: BrowserSession, params: ScrollParams): Promise<ToolResult<void>> {
  try {
    const page = await session.page();
    const amount = params.amount ?? 300;
    const distance = params.direction === 'down' || params.direction === 'right' ? amount : -amount;

    const steps = generateScrollSteps(distance);

    for (const step of steps) {
      if (params.direction === 'left' || params.direction === 'right') {
        await page.evaluate((d: number) => window.scrollBy(d, 0), step.distance);
      } else {
        await page.evaluate((d: number) => window.scrollBy(0, d), step.distance);
      }
      if (step.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, step.delay));
      }
    }

    return {
      success: true,
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}

export async function sendKeys(session: BrowserSession, params: SendKeysParams): Promise<ToolResult<void>> {
  try {
    const page = await session.page();
    await page.keyboard.press(params.keys as import('puppeteer').KeyInput);
    return {
      success: true,
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}

export async function findText(session: BrowserSession, params: FindTextParams): Promise<ToolResult<FindTextResult>> {
  try {
    const page = await session.page();

    const result = await page.evaluate((searchText: string) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const content = node.textContent ?? '';
        if (content.includes(searchText)) {
          const range = document.createRange();
          range.selectNode(node);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            const rect = rects[0];
            return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
      }
      return { found: false };
    }, params.text);

    if (!result || !result.found) {
      return {
        success: false,
        error: `Text not found: ${params.text}`,
        errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
      };
    }

    if (params.scrollTo !== false && result.x !== undefined && result.y !== undefined) {
      await page.evaluate((x: number, y: number) => {
        window.scrollTo({ left: x - window.innerWidth / 2, top: y - window.innerHeight / 2, behavior: 'smooth' });
      }, result.x, result.y);
    }

    return {
      success: true,
      data: result as FindTextResult,
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}

export async function uploadFile(session: BrowserSession, params: UploadFileParams): Promise<ToolResult<void>> {
  try {
    const page = await session.page();
    const element = await page.waitForSelector(params.selector, { timeout: params.timeout ?? 5000 });

    await (element as any).uploadFile(params.filePath);

    return {
      success: true,
      metadata: { url: page.url(), timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
  }
}
