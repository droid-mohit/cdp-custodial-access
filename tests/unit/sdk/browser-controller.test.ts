import { describe, it, expect, vi } from 'vitest';

vi.mock('puppeteer-extra', () => {
  const mockPage = {
    evaluateOnNewDocument: vi.fn(), setUserAgent: vi.fn(), setViewport: vi.fn(),
    setExtraHTTPHeaders: vi.fn(),
    createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    url: vi.fn().mockReturnValue('about:blank'), title: vi.fn().mockResolvedValue('Test'),
    goto: vi.fn().mockResolvedValue(null), screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
    evaluate: vi.fn(), mouse: { move: vi.fn(), click: vi.fn() },
    keyboard: { type: vi.fn(), press: vi.fn(), down: vi.fn(), up: vi.fn() },
    waitForSelector: vi.fn().mockResolvedValue({
      boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 100, height: 30 }),
    }),
    bringToFront: vi.fn(), close: vi.fn(), content: vi.fn().mockResolvedValue('<html></html>'),
  };
  const mockBrowser = {
    pages: vi.fn().mockResolvedValue([mockPage]),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(), wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9222'),
    target: vi.fn().mockReturnValue({
      createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    }),
  };
  return { default: { use: vi.fn(), launch: vi.fn().mockResolvedValue(mockBrowser), connect: vi.fn().mockResolvedValue(mockBrowser) } };
});

vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn().mockReturnValue({}) }));

import { BrowserController } from '../../../src/sdk/browser-controller.js';

describe('BrowserController', () => {
  it('creates with default config', () => {
    const controller = new BrowserController();
    expect(controller).toBeTruthy();
  });

  it('launch() returns a session with tool methods', async () => {
    const controller = new BrowserController({ stealth: { level: 'basic' }, profileDir: '/tmp/test' });
    const session = await controller.launch({ headless: true });
    expect(typeof session.navigate).toBe('function');
    expect(typeof session.click).toBe('function');
    expect(typeof session.input).toBe('function');
    expect(typeof session.screenshot).toBe('function');
    expect(typeof session.listTabs).toBe('function');
    expect(typeof session.extract).toBe('function');
  });

  it('session tool methods call underlying tools', async () => {
    const controller = new BrowserController({ stealth: { level: 'basic' }, profileDir: '/tmp/test' });
    const session = await controller.launch({ headless: true });
    const result = await session.navigate({ url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('connect() returns a session with tool methods', async () => {
    const controller = new BrowserController({ stealth: { level: 'basic' }, profileDir: '/tmp/test' });
    const session = await controller.connect({ wsEndpoint: 'ws://localhost:9222' });
    expect(typeof session.navigate).toBe('function');
  });

  it('getSessions() tracks active sessions', async () => {
    const controller = new BrowserController({ stealth: { level: 'basic' }, profileDir: '/tmp/test' });
    const session = await controller.launch({ headless: true });
    const sessions = controller.getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(session.id);
  });
});
