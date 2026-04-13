import type { Browser, Page, CDPSession } from 'puppeteer';
import type { StealthManager } from '../stealth/index.js';
import type { FingerprintProfile, ProxyConfig } from '../types.js';
import type { ProfileManager } from './profile-manager.js';
import { randomUUID } from 'node:crypto';

export class BrowserSession {
  public readonly id: string;

  constructor(
    private readonly browser: Browser,
    private readonly stealthManager: StealthManager,
    private readonly fingerprint: FingerprintProfile,
    private readonly profileName?: string,
    private readonly profileManager?: ProfileManager,
    private readonly proxy?: ProxyConfig,
  ) {
    this.id = randomUUID();
  }

  async page(): Promise<Page> {
    const pages = await this.browser.pages();
    return pages[0];
  }

  async pages(): Promise<Page[]> {
    return this.browser.pages();
  }

  async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    await this.stealthManager.applyToPage(page, this.fingerprint);
    return page;
  }

  async cdp(): Promise<CDPSession> {
    return this.browser.target().createCDPSession();
  }

  async persist(): Promise<void> {
    if (!this.profileName || !this.profileManager) {
      throw new Error('Cannot persist: session was not created with a profile name');
    }
    this.profileManager.saveMetadata(this.profileName, this.fingerprint, this.proxy);
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

  getProfileName(): string | undefined {
    return this.profileName;
  }
}
