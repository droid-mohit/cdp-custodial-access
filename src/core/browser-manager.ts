import puppeteerExtra from 'puppeteer-extra';
import type { PuppeteerExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = puppeteerExtra as unknown as PuppeteerExtra;
import { BrowserSession } from './browser-session.js';
import { NetworkTracer } from './network-tracer.js';
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

    const workflow = launchConfig.workflow;
    const profile = launchConfig.profile ?? 'default';

    let fingerprint = workflow
      ? this.profileManager.loadMetadata(workflow, profile)?.fingerprint
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
    const userDataDir = workflow
      ? this.profileManager.getProfileDir(workflow, profile)
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

    // Create network tracer if requested
    const networkTracer = launchConfig.networkTrace
      ? new NetworkTracer({ includeBodies: launchConfig.networkTrace === 'full' })
      : undefined;

    const session = new BrowserSession(
      browser,
      this.stealthManager,
      fingerprint,
      workflow,
      profile,
      this.profileManager,
      launchConfig.proxy,
      networkTracer,
      launchConfig.headless ?? true,
    );

    // Set run context for audit traces
    session.tracer.setRunContext({
      headless: launchConfig.headless ?? true,
      profile: workflow ? `${workflow}/${profile}` : profile,
      stealthLevel: this.config.stealth.level ?? 'none',
      locale: fingerprint.locale,
      timezone: fingerprint.timezone,
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      startedAt: new Date().toISOString(),
    });

    if (workflow) {
      this.profileManager.saveMetadata(workflow, profile, fingerprint, launchConfig.proxy);
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

    return new BrowserSession(browser, this.stealthManager, fingerprint, undefined, undefined);
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
