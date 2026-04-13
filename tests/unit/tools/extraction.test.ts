import { describe, it, expect, vi } from 'vitest';
import { extract, screenshot, getPageContent } from '../../../src/tools/extraction.js';

function createMockPage() {
  return {
    evaluate: vi.fn(),
    content: vi.fn().mockResolvedValue('<html><body><p>Hello</p></body></html>'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Test'),
  };
}
function createMockSession(page?: any) {
  return { page: vi.fn().mockResolvedValue(page ?? createMockPage()), id: 'test' };
}

describe('screenshot', () => {
  it('captures a screenshot as base64', async () => {
    const page = createMockPage();
    const result = await screenshot(createMockSession(page) as any, {});
    expect(result.success).toBe(true);
    expect(result.data?.base64).toBeTruthy();
  });

  it('supports fullPage option', async () => {
    const page = createMockPage();
    await screenshot(createMockSession(page) as any, { fullPage: true });
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true }));
  });
});

describe('getPageContent', () => {
  it('returns cleaned page text', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue('Hello World');
    const result = await getPageContent(createMockSession(page) as any);
    expect(result.success).toBe(true);
    expect(result.data?.text).toBeTruthy();
  });
});

describe('extract', () => {
  it('extracts content using a CSS selector', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue([{ tag: 'p', text: 'Hello' }]);
    const result = await extract(createMockSession(page) as any, { selector: 'p' });
    expect(result.success).toBe(true);
    expect(result.data?.elements).toBeTruthy();
  });

  it('extracts full page text when no selector given', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue('Full page text content');
    const result = await extract(createMockSession(page) as any, {});
    expect(result.success).toBe(true);
  });
});
