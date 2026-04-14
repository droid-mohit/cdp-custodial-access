import type { Browser, Page, CDPSession } from 'puppeteer';
import type { StealthManager } from '../stealth/index.js';
import type { FingerprintProfile, ProxyConfig } from '../types.js';
import type { ProfileManager } from './profile-manager.js';
import { Tracer } from './tracer.js';
import { NetworkTracer } from './network-tracer.js';
import { randomUUID } from 'node:crypto';

export class BrowserSession {
  public readonly id: string;
  public readonly tracer: Tracer;
  public readonly networkTracer?: NetworkTracer;
  public readonly headless: boolean;
  private readonly capturedPages = new WeakSet<Page>();

  constructor(
    private readonly browser: Browser,
    private readonly stealthManager: StealthManager,
    private readonly fingerprint: FingerprintProfile,
    private readonly workflowName?: string,
    private readonly profileName?: string,
    private readonly profileManager?: ProfileManager,
    private readonly proxy?: ProxyConfig,
    networkTracer?: NetworkTracer,
    headless = true,
  ) {
    this.id = randomUUID();
    this.tracer = new Tracer();
    this.networkTracer = networkTracer;
    this.headless = headless;
    if (this.networkTracer) {
      this.tracer.setNetworkTracer(this.networkTracer);
    }
  }

  /** Hook a page's console events into the tracer */
  private captureConsole(page: Page): void {
    if (this.capturedPages.has(page)) return;
    this.capturedPages.add(page);

    page.on('console', (msg) => {
      const type = msg.type(); // 'log' | 'warn' | 'error' | ...
      const level = type === 'error' ? 'error' as const
        : type === 'warn' ? 'warn' as const
        : 'info' as const;
      this.tracer.log(msg.text(), { source: 'browser', level });
    });
  }

  /** Hook a page's network events into the network tracer */
  private async captureNetwork(page: Page): Promise<void> {
    if (!this.networkTracer) return;
    await this.networkTracer.attachToPage(page);
  }

  async page(): Promise<Page> {
    const pages = await this.browser.pages();
    const p = pages[0];
    this.captureConsole(p);
    await this.captureNetwork(p);
    return p;
  }

  async pages(): Promise<Page[]> {
    return this.browser.pages();
  }

  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    await this.stealthManager.applyToPage(page, this.fingerprint);
    this.captureConsole(page);
    await this.captureNetwork(page);
    return page;
  }

  async cdp(): Promise<CDPSession> {
    return this.browser.target().createCDPSession();
  }

  async persist(): Promise<void> {
    if (!this.workflowName || !this.profileManager) {
      throw new Error('Cannot persist: session was not created with a workflow name');
    }
    this.profileManager.saveMetadata(
      this.workflowName,
      this.profileName ?? 'default',
      this.fingerprint,
      this.proxy,
    );
  }

  async close(options?: { persist?: boolean }): Promise<void> {
    if (options?.persist) {
      await this.persist();
    }
    await this.browser.close();
  }

  getFingerprint(): FingerprintProfile {
    return this.fingerprint;
  }

  getWorkflowName(): string | undefined {
    return this.workflowName;
  }

  getProfileName(): string | undefined {
    return this.profileName;
  }
}
