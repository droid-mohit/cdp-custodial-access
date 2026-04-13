import { describe, it, expect, vi } from 'vitest';
import { BrowserManager } from '../../../src/core/browser-manager.js';

vi.mock('puppeteer-extra', () => {
  const mockPage = {
    evaluateOnNewDocument: vi.fn(),
    setUserAgent: vi.fn(),
    setViewport: vi.fn(),
    setExtraHTTPHeaders: vi.fn(),
    createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    url: vi.fn().mockReturnValue('about:blank'),
  };
  const mockBrowser = {
    pages: vi.fn().mockResolvedValue([mockPage]),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
    wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9222'),
    target: vi.fn().mockReturnValue({
      createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    }),
  };
  return {
    default: {
      use: vi.fn(),
      launch: vi.fn().mockResolvedValue(mockBrowser),
      connect: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn().mockReturnValue({}),
}));

describe('BrowserManager', () => {
  it('creates with default config', () => {
    const manager = new BrowserManager();
    expect(manager).toBeTruthy();
  });

  it('creates with custom config', () => {
    const manager = new BrowserManager({
      stealth: { level: 'basic' },
      profileDir: '/tmp/profiles',
      defaultTimeout: 10000,
      screenshotOnError: false,
    });
    expect(manager).toBeTruthy();
  });

  it('launch() returns a BrowserSession', async () => {
    const manager = new BrowserManager({
      stealth: { level: 'basic' },
      profileDir: '/tmp/test-profiles',
      defaultTimeout: 30000,
      screenshotOnError: true,
    });
    const session = await manager.launch({ headless: true });
    expect(session).toBeTruthy();
    expect(session.id).toBeTruthy();
  });

  it('launch() with profile name creates a profiled session', async () => {
    const manager = new BrowserManager({
      stealth: { level: 'basic' },
      profileDir: '/tmp/test-profiles',
      defaultTimeout: 30000,
      screenshotOnError: true,
    });
    const session = await manager.launch({ profile: 'test-user', headless: true });
    expect(session.getProfileName()).toBe('test-user');
  });

  it('connect() returns a BrowserSession', async () => {
    const manager = new BrowserManager({
      stealth: { level: 'basic' },
      profileDir: '/tmp/test-profiles',
      defaultTimeout: 30000,
      screenshotOnError: true,
    });
    const session = await manager.connect({ wsEndpoint: 'ws://localhost:9222' });
    expect(session).toBeTruthy();
    expect(session.id).toBeTruthy();
  });
});
