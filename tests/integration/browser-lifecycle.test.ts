import { describe, it, expect, afterAll } from 'vitest';
import { BrowserController } from '../../src/sdk/browser-controller.js';

describe('Browser lifecycle (integration)', () => {
  let controller: BrowserController;

  afterAll(async () => {
    const sessions = controller?.getSessions() ?? [];
    for (const s of sessions) {
      await s.close().catch(() => {});
    }
  });

  it('launches a headless browser, navigates, and closes', async () => {
    controller = new BrowserController({
      stealth: { level: 'basic' },
      profileDir: '/tmp/cdp-test-profiles',
    });

    const session = await controller.launch({ headless: true });
    expect(session.id).toBeTruthy();

    const navResult = await session.navigate({ url: 'https://example.com' });
    expect(navResult.success).toBe(true);
    expect(navResult.data?.title).toContain('Example');

    const contentResult = await session.getPageContent();
    expect(contentResult.success).toBe(true);
    expect(contentResult.data?.text).toContain('Example Domain');

    const screenshotResult = await session.screenshot({});
    expect(screenshotResult.success).toBe(true);
    expect(screenshotResult.data?.base64).toBeTruthy();

    const tabsResult = await session.listTabs();
    expect(tabsResult.success).toBe(true);
    expect(tabsResult.data?.tabs.length).toBeGreaterThanOrEqual(1);

    await session.close();
  }, 60000);
});
