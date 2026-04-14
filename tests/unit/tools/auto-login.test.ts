import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoLogin } from '../../../src/tools/auto-login.js';
import type { AutoLoginParams } from '../../../src/tools/auto-login.js';

function createMockPage(overrides: Record<string, any> = {}) {
  return {
    url: vi.fn().mockReturnValue('https://www.linkedin.com/feed/'),
    title: vi.fn().mockResolvedValue('LinkedIn'),
    evaluate: vi.fn().mockResolvedValue(false),
    content: vi.fn().mockResolvedValue('<html></html>'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    waitForSelector: vi.fn().mockResolvedValue(null),
    goto: vi.fn().mockResolvedValue(null),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

function createMockTracer() {
  return {
    log: vi.fn(),
    record: vi.fn((_name: string, _params: any, _session: any, fn: () => any) => fn()),
    stepCount: 0,
    setOutputDir: vi.fn(),
    save: vi.fn(),
  };
}

function createMockSession(page?: any) {
  const mockPage = page ?? createMockPage();
  return {
    page: vi.fn().mockResolvedValue(mockPage),
    pages: vi.fn().mockResolvedValue([mockPage]),
    id: 'test-session',
    tracer: createMockTracer(),
    browser: {},
  };
}

const mockCheckLogin = vi.fn();
const mockWaitForLogin = vi.fn();

vi.mock('../../../src/core/credential-store.js', () => {
  const store: Record<string, any> = {};
  class MockCredentialStore {
    get(wf: string, prof: string) { return store[`${wf}/${prof}`] ?? null; }
    save(wf: string, prof: string, entry: any) { store[`${wf}/${prof}`] = entry; }
    exists(wf: string, prof: string) { return !!store[`${wf}/${prof}`]; }
    delete(wf: string, prof: string) { delete store[`${wf}/${prof}`]; }
  }
  return { CredentialStore: MockCredentialStore };
});

vi.mock('../../../src/tools/session-auth.js', () => ({
  checkLogin: (...args: any[]) => mockCheckLogin(...args),
  waitForLogin: (...args: any[]) => mockWaitForLogin(...args),
}));

const mockInput = vi.fn().mockResolvedValue({ success: true });
const mockClick = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../../src/tools/interaction.js', () => ({
  input: (...args: any[]) => mockInput(...args),
  click: (...args: any[]) => mockClick(...args),
}));

const mockNavigate = vi.fn().mockResolvedValue({ success: true, data: { title: 'Login' } });

vi.mock('../../../src/tools/navigation.js', () => ({
  navigate: (...args: any[]) => mockNavigate(...args),
  waitTool: vi.fn().mockResolvedValue({ success: true }),
}));

const baseParams: AutoLoginParams = {
  loginUrl: 'https://www.linkedin.com/login',
  successSelector: '[data-testid="mainFeed"]',
  workflow: 'linkedin-feed',
  profile: 'default',
};

describe('autoLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing-session when already logged in', async () => {
    mockCheckLogin.mockResolvedValue({
      success: true,
      data: { isLoggedIn: true, method: 'loggedInSelector' },
    });

    const session = createMockSession();
    const result = await autoLogin(session as any, baseParams);

    expect(result.success).toBe(true);
    expect(result.data?.method).toBe('existing-session');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns error in headless mode when no credentials and not logged in', async () => {
    mockCheckLogin.mockResolvedValue({
      success: true,
      data: { isLoggedIn: false, method: 'loggedInSelector' },
    });

    const session = createMockSession();
    (session as any).headless = true;

    const result = await autoLogin(session as any, baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('--headed');
  });

  it('falls back to waitForLogin in headed mode when no credentials', async () => {
    mockCheckLogin.mockResolvedValue({
      success: true,
      data: { isLoggedIn: false, method: 'loggedInSelector' },
    });
    mockWaitForLogin.mockResolvedValue({
      success: true,
      data: { loggedIn: true, finalUrl: 'https://www.linkedin.com/feed/', durationMs: 5000 },
    });

    const session = createMockSession();
    (session as any).headless = false;

    const result = await autoLogin(session as any, baseParams);

    expect(result.success).toBe(true);
    expect(result.data?.method).toBe('manual');
    expect(result.data?.promptSaveAfter).toBe(true);
  });
});
