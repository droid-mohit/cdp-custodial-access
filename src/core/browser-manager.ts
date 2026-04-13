import puppeteerExtra from 'puppeteer-extra';
import type { PuppeteerExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = puppeteerExtra as unknown as PuppeteerExtra;
import { BrowserSession } from './browser-session.js';
import { ProfileManager } from './profile-manager.js';
import { StealthManager } from '../stealth/index.js';
import { generateFingerprint } from '../stealth/fingerprint-profile.js';
import { DEFAULT_SESSION_CONFIG } from './types.js';
import type { SessionConfig, LaunchConfig, ConnectConfig } from './types.js';
import * as os from 'node:os';

export class BrowserManager {
  private readonly config: SessionConfig;
  private readonly profileManager: ProfileManager;
  private readonly stealthManager: StealthManager;
  private stealthPluginApplied = false;

  constructor(config?: Partial<SessionConfig>) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    const profileDir = this.config.profileDir.replace(/^~/, os.homedir());
    this.profileManager = new ProfileManager(profileDir);
    this.stealthManager = new StealthManager(this.config.stealth);
  }

  async launch(launchConfig: LaunchConfig = {}): Promise<BrowserSession> {
    this.ensureStealthPlugin();

    let fingerprint = launchConfig.profile
      ? this.profileManager.loadMetadata(launchConfig.profile)?.fingerprint
      : undefined;

    if (!fingerprint) {
      fingerprint = generateFingerprint();
    }

    // Allow locale/timezone overrides from launch config
    if (launchConfig.locale) {
      fingerprint = { ...fingerprint, locale: launchConfig.locale };
    }
    if (launchConfig.timezone) {
      fingerprint = { ...fingerprint, timezone: launchConfig.timezone };
    }

    const viewport = launchConfig.defaultViewport ?? fingerprint.viewport;
    const stealthArgs = [
      ...this.stealthManager.getLaunchArgs(launchConfig.proxy),
      `--window-size=${viewport.width},${viewport.height}`,
    ];
    const userDataDir = launchConfig.profile
      ? this.profileManager.getProfileDir(launchConfig.profile)
      : undefined;

    const browser = await puppeteer.launch({
      headless: launchConfig.headless ?? true,
      args: stealthArgs,
      executablePath: launchConfig.executablePath,
      userDataDir: launchConfig.userDataDir ?? userDataDir,
      defaultViewport: viewport,
    });

    const pages = await browser.pages();
    for (const page of pages) {
      await this.stealthManager.applyToPage(page, fingerprint);
    }

    const session = new BrowserSession(
      browser,
      this.stealthManager,
      fingerprint,
      launchConfig.profile,
      this.profileManager,
      launchConfig.proxy,
    );

    if (launchConfig.profile) {
      this.profileManager.saveMetadata(launchConfig.profile, fingerprint, launchConfig.proxy);
    }

    return session;
  }

  async connect(connectConfig: ConnectConfig): Promise<BrowserSession> {
    this.ensureStealthPlugin();

    const browser = await puppeteer.connect({
      browserWSEndpoint: connectConfig.wsEndpoint,
    });

    const fingerprint = generateFingerprint();

    const pages = await browser.pages();
    for (const page of pages) {
      await this.stealthManager.applyToPage(page, fingerprint);
    }

    return new BrowserSession(browser, this.stealthManager, fingerprint);
  }

  getProfileManager(): ProfileManager {
    return this.profileManager;
  }

  private ensureStealthPlugin(): void {
    if (!this.stealthPluginApplied) {
      puppeteer.use(StealthPlugin());
      this.stealthPluginApplied = true;
    }
  }
}
