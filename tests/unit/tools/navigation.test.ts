import { describe, it, expect, vi } from 'vitest';
import { navigate, goBack, waitTool, search } from '../../../src/tools/navigation.js';

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(null),
    goBack: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example Domain'),
    content: vi.fn().mockResolvedValue('<html><body>Hello</body></html>'),
    waitForNavigation: vi.fn().mockResolvedValue(null),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  };
}

function createMockSession(page?: any) {
  const mockPage = page ?? createMockPage();
  return { page: vi.fn().mockResolvedValue(mockPage), id: 'test-session' };
}

describe('navigate', () => {
  it('navigates to URL and returns page info', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await navigate(session as any, { url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Example Domain');
    expect(result.data?.url).toBe('https://example.com');
    expect(page.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
  });

  it('passes waitUntil option', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    await navigate(session as any, { url: 'https://example.com', waitUntil: 'networkidle0' });
    expect(page.goto).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ waitUntil: 'networkidle0' }));
  });

  it('returns error on navigation failure', async () => {
    const page = createMockPage();
    page.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const session = createMockSession(page);
    const result = await navigate(session as any, { url: 'https://bad.example' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ERR_CONNECTION_REFUSED');
    expect(result.errorCode).toBe('NAVIGATION_FAILED');
  });
});

describe('goBack', () => {
  it('goes back and returns page info', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await goBack(session as any);
    expect(result.success).toBe(true);
    expect(page.goBack).toHaveBeenCalled();
  });
});

describe('waitTool', () => {
  it('waits for specified milliseconds', async () => {
    const session = createMockSession();
    const start = Date.now();
    const result = await waitTool(session as any, { ms: 50 });
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('search', () => {
  it('navigates to DuckDuckGo by default', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await search(session as any, { query: 'test query' });
    expect(result.success).toBe(true);
    expect(page.goto).toHaveBeenCalledWith(expect.stringContaining('duckduckgo.com'), expect.any(Object));
  });

  it('navigates to Google when specified', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    await search(session as any, { query: 'test', engine: 'google' });
    expect(page.goto).toHaveBeenCalledWith(expect.stringContaining('google.com'), expect.any(Object));
  });

  it('navigates to Bing when specified', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    await search(session as any, { query: 'test', engine: 'bing' });
    expect(page.goto).toHaveBeenCalledWith(expect.stringContaining('bing.com'), expect.any(Object));
  });
});
