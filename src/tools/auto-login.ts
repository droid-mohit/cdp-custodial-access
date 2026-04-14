import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { CredentialStore } from '../core/credential-store.js';
import type { CredentialEntry, CredentialField } from '../core/credential-store.js';
import { getRecipe } from '../auth/recipes.js';
import type { LoginStep } from '../auth/recipes.js';
import { checkLogin } from './session-auth.js';
import { waitForLogin } from './session-auth.js';
import { navigate, waitTool } from './navigation.js';
import { input, click } from './interaction.js';
import * as readline from 'node:readline';

// ─── Types ──────────────────────────────────────────────────────────

export interface AutoLoginParams {
  loginUrl: string;
  successSelector: string;
  workflow: string;
  profile?: string;
  timeout?: number;
}

export interface AutoLoginResult {
  method: 'existing-session' | 'auto-credentials' | 'manual';
  promptSaveAfter?: boolean;
}

export interface PromptCredentialSaveParams {
  loginUrl: string;
  workflow: string;
  profile?: string;
}

// ─── Auto-Login Tool ────────────────────────────────────────────────

export async function autoLogin(
  session: BrowserSession,
  params: AutoLoginParams,
): Promise<ToolResult<AutoLoginResult>> {
  const { loginUrl, successSelector, workflow, timeout = 30_000 } = params;
  const profile = params.profile ?? 'default';
  const store = new CredentialStore();

  // 1. Check if already logged in — use selector-only check.
  // Cookie-based check (checkLogin fallback) can false-positive when cookies
  // exist but the server has invalidated the session (e.g., LinkedIn li_at
  // cookie still present but server redirects to login). Only trust the
  // selector actually being present on the page.
  const loginCheck = await checkLogin(session, {
    loggedInSelector: successSelector,
    timeout: 5000,
  });

  if (loginCheck.success && loginCheck.data?.isLoggedIn && loginCheck.data.method === 'loggedInSelector') {
    session.tracer.log('[autoLogin] Already logged in (verified by selector).');
    return { success: true, data: { method: 'existing-session' } };
  }

  // 2. Load stored credentials
  const creds = store.get(workflow, profile);

  if (creds) {
    session.tracer.log('[autoLogin] Found stored credentials, attempting auto-login...');

    // 3. Navigate to login page
    const navResult = await navigate(session, {
      url: loginUrl,
      waitUntil: 'networkidle2',
      timeout,
    });

    if (!navResult.success) {
      session.tracer.log(`[autoLogin] Navigation to login page failed: ${navResult.error}`, { level: 'warn' });
    } else {
      await waitTool(session, { ms: 2000 });

      // Wait for the first field to be visible before filling
      const recipe = getRecipe(loginUrl);
      const steps: LoginStep[] = recipe
        ? recipe.steps
        : [{
            fields: creds.fields.map((f) => ({ selector: f.selector, label: f.label, type: f.type })),
          }];

      const valueMap = new Map<string, string>();
      for (const f of creds.fields) {
        valueMap.set(f.label, f.value);
      }

      // Wait for the first field to become visible before filling
      const firstSelector = steps[0]?.fields[0]?.selector;
      if (firstSelector) {
        try {
          const pg = await session.page();
          await pg.waitForSelector(firstSelector, { visible: true, timeout: 10_000 });
        } catch {
          session.tracer.log('[autoLogin] Login form not visible after wait — proceeding anyway.', { level: 'warn' });
        }
      }

      let fillSuccess = true;
      for (const step of steps) {
        for (const field of step.fields) {
          const value = valueMap.get(field.label);
          if (!value) {
            session.tracer.log(`[autoLogin] No stored value for field "${field.label}", skipping auto-fill.`, { level: 'warn' });
            fillSuccess = false;
            break;
          }
          const inputResult = await input(session, {
            selector: field.selector,
            text: value,
            timeout: 10_000,
          });
          if (!inputResult.success) {
            session.tracer.log(`[autoLogin] Failed to fill field "${field.label}": ${inputResult.error}`, { level: 'warn' });
            fillSuccess = false;
            break;
          }
        }

        if (!fillSuccess) break;

        if (step.submitSelector) {
          await click(session, { selector: step.submitSelector, timeout: 5000 });
        } else {
          const page = await session.page();
          await page.keyboard.press('Enter');
        }

        const settleMs = step.postSubmitWait ?? 2000;
        await waitTool(session, { ms: settleMs });
      }

      if (fillSuccess) {
        const verifyCheck = await checkLogin(session, {
          loggedInSelector: successSelector,
          timeout: 10_000,
        });

        if (verifyCheck.success && verifyCheck.data?.isLoggedIn) {
          if (creds.requires2FA) {
            session.tracer.log('[autoLogin] Credentials filled. 2FA may be required — waiting for manual verification...');
            const twoFaResult = await waitForLogin(session, {
              successSelector,
              timeout: 120_000,
            });
            if (twoFaResult.success && twoFaResult.data?.loggedIn) {
              session.tracer.log('[autoLogin] 2FA completed successfully.');
              return { success: true, data: { method: 'auto-credentials' } };
            }
          } else {
            session.tracer.log('[autoLogin] Auto-login succeeded.');
            return { success: true, data: { method: 'auto-credentials' } };
          }
        }

        session.tracer.log('[autoLogin] Auto-login failed — stored credentials may be outdated.', { level: 'warn' });
      }
    }
  }

  // 5. Manual fallback
  if (session.headless) {
    return {
      success: false,
      error: `Login required. Run with --headed to login manually:\n  npx tsx workflows/simple/${workflow}.ts --headed`,
    };
  }

  session.tracer.log('[autoLogin] Falling back to manual login...');

  // Only navigate to login if we're not already there (avoid page reload mid-typing)
  const page = await session.page();
  const currentUrl = page.url();
  const onLoginPage = currentUrl.includes(new URL(loginUrl).hostname + '/login');
  if (!onLoginPage) {
    await navigate(session, { url: loginUrl, waitUntil: 'domcontentloaded', timeout });
  }

  const manualResult = await waitForLogin(session, {
    loginUrl,
    successSelector,
    timeout: 120_000,
  });

  if (manualResult.success && manualResult.data?.loggedIn) {
    session.tracer.log('[autoLogin] Manual login succeeded.');
    return {
      success: true,
      data: {
        method: 'manual',
        promptSaveAfter: true,
      },
    };
  }

  return {
    success: false,
    error: 'Manual login timed out. Please try again.',
  };
}

// ─── Credential Save Prompt ─────────────────────────────────────────

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
      cb?: (err?: Error | null) => void,
    ): boolean => {
      if (typeof chunk === 'string' && chunk.includes(question)) {
        return origWrite(chunk, encodingOrCb as BufferEncoding, cb);
      }
      if (typeof encodingOrCb === 'function') {
        encodingOrCb();
        return true;
      }
      if (cb) {
        cb();
        return true;
      }
      return true;
    }) as typeof process.stdout.write;

    rl.question(question, (answer) => {
      process.stdout.write = origWrite;
      origWrite('\n');
      rl.close();
      resolve(answer);
    });
  });
}

export async function promptCredentialSave(
  session: BrowserSession,
  params: PromptCredentialSaveParams,
): Promise<ToolResult<void>> {
  const { loginUrl, workflow } = params;
  const profile = params.profile ?? 'default';
  const store = new CredentialStore();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const existing = store.exists(workflow, profile);
    const promptMsg = existing
      ? 'Your saved credentials didn\'t work. Update them? (y/n): '
      : 'Save credentials for future auto-login? (y/n): ';

    const saveAnswer = await askQuestion(rl, promptMsg);
    if (saveAnswer.trim().toLowerCase() !== 'y') {
      session.tracer.log('[credentials] User declined to save credentials.');
      return { success: true };
    }

    const recipe = getRecipe(loginUrl);
    let fieldDefs: Array<{ selector: string; label: string; type: 'text' | 'password' }>;

    if (recipe) {
      fieldDefs = recipe.steps.flatMap((s) => s.fields);
    } else {
      session.tracer.log('[credentials] No recipe found — detecting form fields from login page...');
      await navigate(session, { url: loginUrl, waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitTool(session, { ms: 1000 });

      const page = await session.page();
      fieldDefs = await page.evaluate(() => {
        const fields: Array<{ selector: string; label: string; type: 'text' | 'password' }> = [];
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
        for (const el of inputs) {
          const inp = el as HTMLInputElement;
          const id = inp.id ? `input#${inp.id}` : '';
          const name = inp.name ? `input[name="${inp.name}"]` : '';
          const selector = id || name || `input[type="${inp.type}"]`;
          const label = inp.labels?.[0]?.textContent?.trim()
            || inp.placeholder
            || inp.name
            || inp.type;
          const type = inp.type === 'password' ? 'password' as const : 'text' as const;
          fields.push({ selector, label, type });
        }
        return fields;
      });

      if (fieldDefs.length === 0) {
        session.tracer.log('[credentials] No form fields detected on login page.', { level: 'warn' });
        return { success: false, error: 'Could not detect login form fields.' };
      }
    }

    rl.close();

    const credFields: CredentialField[] = [];
    for (const field of fieldDefs) {
      let value: string;
      if (field.type === 'password') {
        value = await askPassword(`  Enter ${field.label}: `);
      } else {
        const fieldRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        value = await askQuestion(fieldRl, `  Enter ${field.label}: `);
        fieldRl.close();
      }
      credFields.push({ ...field, value });
    }

    const tfaRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const tfaAnswer = await askQuestion(tfaRl, 'Does this site require 2FA/OTP? (y/n): ');
    tfaRl.close();

    const requires2FA = tfaAnswer.trim().toLowerCase() === 'y';

    const entry: CredentialEntry = {
      loginUrl,
      fields: credFields,
      requires2FA,
      savedAt: new Date().toISOString(),
    };
    store.save(workflow, profile, entry);

    session.tracer.log(`[credentials] Credentials saved to ~/.cdp-custodial-access/credentials/${workflow}/${profile}.json`);
    session.tracer.log('[credentials] Warning: Credentials are stored in plaintext. Do not share this directory.');

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Credential save failed: ${msg}` };
  } finally {
    rl.close();
  }
}
