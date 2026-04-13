import { describe, it, expect, vi } from 'vitest';
import { BrowserSession } from '../../../src/core/browser-session.js';
import type { FingerprintProfile } from '../../../src/types.js';

function createMockBrowser() {
  const mockPage = {
    url: vi.fn().mockReturnValue('about:blank'),
    title: vi.fn().mockResolvedValue('Test'),
    evaluateOnNewDocument: vi.fn(),
    setUserAgent: vi.fn(),
    setViewport: vi.fn(),
    setExtraHTTPHeaders: vi.fn(),
    createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    close: vi.fn(),
    on: vi.fn(),
  };
  const mockCDPSession = { send: vi.fn(), detach: vi.fn() };
  const mockTarget = { createCDPSession: vi.fn().mockResolvedValue(mockCDPSession) };
  return {
    browser: {
      pages: vi.fn().mockResolvedValue([mockPage]),
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
      wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9222'),
      target: vi.fn().mockReturnValue(mockTarget),
      createBrowserCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
    },
    mockPage,
    mockTarget,
  };
}

function createMockStealthManager() {
  return {
    applyToPage: vi.fn().mockResolvedValue(undefined),
    getPatchConfig: vi.fn().mockReturnValue({}),
    getLaunchArgs: vi.fn().mockReturnValue([]),
  };
}

function createMockProfileManager() {
  return {
    saveMetadata: vi.fn(),
    loadMetadata: vi.fn().mockReturnValue(null),
    updateLastUsed: vi.fn(),
    getProfileDir: vi.fn().mockReturnValue('/tmp/test-profile/chrome'),
    profileExists: vi.fn().mockReturnValue(false),
  };
}

const testFingerprint: FingerprintProfile = {
  userAgent: 'Mozilla/5.0 Test',
  viewport: { width: 1920, height: 1080 },
  webglVendor: 'NVIDIA',
  webglRenderer: 'RTX 3060',
  canvasSeed: 0x1234,
  audioSeed: 0x5678,
  timezone: 'America/New_York',
  locale: 'en-US',
  platform: 'Win32',
};

describe('BrowserSession', () => {
  it('has a unique id', () => {
    const { browser } = createMockBrowser();
    const session = new BrowserSession(browser as any, createMockStealthManager() as any, testFingerprint);
    expect(session.id).toBeTruthy();
    expect(typeof session.id).toBe('string');
  });

  it('page() returns the first open page', async () => {
    const { browser, mockPage } = createMockBrowser();
    const session = new BrowserSession(browser as any, createMockStealthManager() as any, testFingerprint);
    const page = await session.page();
    expect(page).toBe(mockPage);
  });

  it('pages() returns all open pages', async () => {
    const { browser } = createMockBrowser();
    const session = new BrowserSession(browser as any, createMockStealthManager() as any, testFingerprint);
    const pages = await session.pages();
    expect(pages.length).toBe(1);
  });

  it('newPage() creates a new page and applies stealth', async () => {
    const { browser, mockPage } = createMockBrowser();
    const stealth = createMockStealthManager();
    const session = new BrowserSession(browser as any, stealth as any, testFingerprint);
    const page = await session.newPage();
    expect(browser.newPage).toHaveBeenCalled();
    expect(stealth.applyToPage).toHaveBeenCalledWith(mockPage, testFingerprint);
  });

  it('close() closes the browser', async () => {
    const { browser } = createMockBrowser();
    const session = new BrowserSession(browser as any, createMockStealthManager() as any, testFingerprint);
    await session.close();
    expect(browser.close).toHaveBeenCalled();
  });

  it('cdp() returns a raw CDP session', async () => {
    const { browser, mockTarget } = createMockBrowser();
    const session = new BrowserSession(browser as any, createMockStealthManager() as any, testFingerprint);
    const cdp = await session.cdp();
    expect(cdp).toBeTruthy();
    expect(browser.target).toHaveBeenCalled();
    expect(mockTarget.createCDPSession).toHaveBeenCalled();
  });

  it('persist() saves profile metadata', async () => {
    const { browser } = createMockBrowser();
    const profileManager = createMockProfileManager();
    const session = new BrowserSession(
      browser as any,
      createMockStealthManager() as any,
      testFingerprint,
      'test-workflow',
      'test-profile',
      profileManager as any,
    );
    await session.persist();
    expect(profileManager.saveMetadata).toHaveBeenCalledWith('test-workflow', 'test-profile', testFingerprint, undefined);
  });
});
