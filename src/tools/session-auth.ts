import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

// ─── Session Health Check ────────────────────────────────────────────

export interface CheckLoginParams {
  /** CSS selector for an element that only appears when logged in (e.g., profile avatar, nav menu) */
  loggedInSelector?: string;
  /** CSS selector for an element that only appears when logged out (e.g., login button, sign-in form) */
  loggedOutSelector?: string;
  /** URL that redirects to login when not authenticated — if the final URL differs, you're logged out */
  checkUrl?: string;
  /** Timeout for element checks in ms (default: 5000) */
  timeout?: number;
}

export interface CheckLoginResult {
  isLoggedIn: boolean;
  currentUrl: string;
  /** Which check determined the result */
  method: 'loggedInSelector' | 'loggedOutSelector' | 'redirectCheck' | 'cookieCheck';
  details?: string;
}

/**
 * Check if the current browser session is authenticated.
 * Tries multiple detection strategies in order of reliability.
 */
export async function checkLogin(
  session: BrowserSession,
  params: CheckLoginParams,
): Promise<ToolResult<CheckLoginResult>> {
  try {
    const page = await session.page();
    const timeout = params.timeout ?? 5000;
    const currentUrl = page.url();

    // Strategy 1: Check for logged-in element
    if (params.loggedInSelector) {
      try {
        const el = await page.waitForSelector(params.loggedInSelector, { timeout });
        if (el) {
          return {
            success: true,
            data: {
              isLoggedIn: true,
              currentUrl,
              method: 'loggedInSelector',
              details: `Found: ${params.loggedInSelector}`,
            },
          };
        }
      } catch {
        // Element not found — might be logged out
      }
    }

    // Strategy 2: Check for logged-out element
    if (params.loggedOutSelector) {
      try {
        const el = await page.waitForSelector(params.loggedOutSelector, { timeout });
        if (el) {
          return {
            success: true,
            data: {
              isLoggedIn: false,
              currentUrl,
              method: 'loggedOutSelector',
              details: `Found: ${params.loggedOutSelector}`,
            },
          };
        }
      } catch {
        // Logged-out element not found — might be logged in
      }
    }

    // Strategy 3: Redirect check — navigate to an authenticated URL and see if it redirects to login
    if (params.checkUrl) {
      await page.goto(params.checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 2000));
      const finalUrl = page.url();

      const redirectedToLogin = finalUrl !== params.checkUrl &&
        /login|signin|sign-in|auth|sso/i.test(finalUrl);

      return {
        success: true,
        data: {
          isLoggedIn: !redirectedToLogin,
          currentUrl: finalUrl,
          method: 'redirectCheck',
          details: redirectedToLogin
            ? `Redirected to login: ${finalUrl}`
            : `Stayed on: ${finalUrl}`,
        },
      };
    }

    // Strategy 4: Cookie check — look for common auth cookie patterns
    const cookies = await page.cookies();
    const authCookiePatterns = [
      /session/i, /token/i, /auth/i, /login/i, /sid/i,
      /li_at/i, // LinkedIn
      /SSID/i, /SID/i, // Google
      /__Secure-/i,
    ];

    const authCookies = cookies.filter((c) =>
      authCookiePatterns.some((p) => p.test(c.name)),
    );

    const hasAuthCookies = authCookies.length > 0;
    const expiredCookies = authCookies.filter((c) =>
      c.expires > 0 && c.expires < Date.now() / 1000,
    );

    return {
      success: true,
      data: {
        isLoggedIn: hasAuthCookies && expiredCookies.length === 0,
        currentUrl,
        method: 'cookieCheck',
        details: hasAuthCookies
          ? `Found ${authCookies.length} auth cookie(s)${expiredCookies.length > 0 ? `, ${expiredCookies.length} expired` : ''}`
          : 'No auth cookies found',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

// ─── Login Wait Helper ───────────────────────────────────────────────

export interface WaitForLoginParams {
  /** URL of the login page (used to detect navigation away from it) */
  loginUrl?: string;
  /** CSS selector that appears after successful login */
  successSelector?: string;
  /** URL pattern that indicates successful login (regex string) */
  successUrlPattern?: string;
  /** Timeout in ms (default: 120000 — 2 minutes) */
  timeout?: number;
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
}

export interface WaitForLoginResult {
  loggedIn: boolean;
  finalUrl: string;
  durationMs: number;
}

/**
 * Wait for the user to complete a manual login in headed mode.
 * Polls until login is detected or timeout is reached.
 */
export async function waitForLogin(
  session: BrowserSession,
  params: WaitForLoginParams,
): Promise<ToolResult<WaitForLoginResult>> {
  try {
    const page = await session.page();
    const timeout = params.timeout ?? 120000;
    const pollInterval = params.pollInterval ?? 2000;
    const start = Date.now();

    console.log('[auth] Waiting for login — please sign in via the browser window...');

    while (Date.now() - start < timeout) {
      const currentUrl = page.url();

      // Check 1: URL moved away from login page
      if (params.loginUrl) {
        const onLoginPage = currentUrl.includes(params.loginUrl) ||
          /login|signin|sign-in|auth/i.test(currentUrl);
        if (!onLoginPage) {
          console.log('[auth] Login detected — navigated away from login page');
          return {
            success: true,
            data: {
              loggedIn: true,
              finalUrl: currentUrl,
              durationMs: Date.now() - start,
            },
          };
        }
      }

      // Check 2: Success URL pattern matches
      if (params.successUrlPattern) {
        const regex = new RegExp(params.successUrlPattern);
        if (regex.test(currentUrl)) {
          console.log('[auth] Login detected — URL matches success pattern');
          return {
            success: true,
            data: {
              loggedIn: true,
              finalUrl: currentUrl,
              durationMs: Date.now() - start,
            },
          };
        }
      }

      // Check 3: Success element appeared
      if (params.successSelector) {
        try {
          const el = await page.waitForSelector(params.successSelector, { timeout: 500 });
          if (el) {
            console.log('[auth] Login detected — success element found');
            return {
              success: true,
              data: {
                loggedIn: true,
                finalUrl: currentUrl,
                durationMs: Date.now() - start,
              },
            };
          }
        } catch {
          // Not found yet, keep waiting
        }
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    return {
      success: true,
      data: {
        loggedIn: false,
        finalUrl: page.url(),
        durationMs: Date.now() - start,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

// ─── Cookie Export/Import ────────────────────────────────────────────

export interface ExportedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export interface ExportCookiesParams {
  /** Only export cookies matching these domains (default: all) */
  domains?: string[];
}

export interface ExportCookiesResult {
  cookies: ExportedCookie[];
  exportedAt: string;
  url: string;
}

/**
 * Export all cookies from the current browser session.
 * Returns portable JSON that can be imported into another session.
 */
export async function exportCookies(
  session: BrowserSession,
  params?: ExportCookiesParams,
): Promise<ToolResult<ExportCookiesResult>> {
  try {
    const page = await session.page();

    // Use CDP to get ALL cookies (page.cookies() only returns current page's cookies)
    const cdp = await page.createCDPSession();
    const { cookies: allCookies } = await cdp.send('Network.getAllCookies') as {
      cookies: Array<{
        name: string; value: string; domain: string; path: string;
        expires: number; httpOnly: boolean; secure: boolean; sameSite?: string;
      }>;
    };
    await cdp.detach();

    let filtered = allCookies;
    if (params?.domains?.length) {
      filtered = allCookies.filter((c) =>
        params.domains!.some((d) => c.domain.includes(d)),
      );
    }

    const cookies: ExportedCookie[] = filtered.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

    return {
      success: true,
      data: {
        cookies,
        exportedAt: new Date().toISOString(),
        url: page.url(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

export interface ImportCookiesParams {
  cookies: ExportedCookie[];
}

export interface ImportCookiesResult {
  imported: number;
  failed: number;
}

/**
 * Import cookies into the current browser session.
 * Accepts cookies from exportCookies() output.
 */
export async function importCookies(
  session: BrowserSession,
  params: ImportCookiesParams,
): Promise<ToolResult<ImportCookiesResult>> {
  try {
    const page = await session.page();
    const cdp = await page.createCDPSession();

    let imported = 0;
    let failed = 0;

    for (const cookie of params.cookies) {
      try {
        await cdp.send('Network.setCookie', {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires > 0 ? cookie.expires : undefined,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
        });
        imported++;
      } catch {
        failed++;
      }
    }

    await cdp.detach();

    return {
      success: true,
      data: { imported, failed },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}
