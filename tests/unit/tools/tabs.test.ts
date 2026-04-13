import { describe, it, expect, vi } from 'vitest';
import { switchTab, closeTab, listTabs } from '../../../src/tools/tabs.js';

function createMockPages() {
  return [
    { url: vi.fn().mockReturnValue('https://example.com'), title: vi.fn().mockResolvedValue('Example'), bringToFront: vi.fn(), close: vi.fn() },
    { url: vi.fn().mockReturnValue('https://other.com'), title: vi.fn().mockResolvedValue('Other'), bringToFront: vi.fn(), close: vi.fn() },
  ];
}
function createMockSession(pages?: any[]) {
  const mockPages = pages ?? createMockPages();
  return { pages: vi.fn().mockResolvedValue(mockPages), page: vi.fn().mockResolvedValue(mockPages[0]), id: 'test' };
}

describe('listTabs', () => {
  it('returns all open tabs', async () => {
    const result = await listTabs(createMockSession() as any);
    expect(result.success).toBe(true);
    expect(result.data?.tabs.length).toBe(2);
  });
});

describe('switchTab', () => {
  it('switches to tab by index', async () => {
    const pages = createMockPages();
    const result = await switchTab(createMockSession(pages) as any, { index: 1 });
    expect(result.success).toBe(true);
    expect(pages[1].bringToFront).toHaveBeenCalled();
  });

  it('returns error for invalid index', async () => {
    const result = await switchTab(createMockSession() as any, { index: 5 });
    expect(result.success).toBe(false);
  });
});

describe('closeTab', () => {
  it('closes tab by index', async () => {
    const pages = createMockPages();
    const result = await closeTab(createMockSession(pages) as any, { index: 1 });
    expect(result.success).toBe(true);
    expect(pages[1].close).toHaveBeenCalled();
  });
});
