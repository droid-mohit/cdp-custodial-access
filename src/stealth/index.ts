import type { Page } from 'puppeteer';
import type { StealthConfig, StealthPatchConfig, FingerprintProfile, ProxyConfig } from '../types.js';
import { getWebdriverPatch, getCdcArtifactsPatch, getChromeRuntimePatch, getPluginsPatch, getPermissionsPatch, getIframePatch } from './patches/properties.js';
import { getWebGLPatch, getCanvasPatch, getAudioContextPatch, getFontPatch } from './patches/fingerprint.js';
import { getStealthLaunchArgs, getProxyArgs } from './patches/network.js';

const NONE_PATCHES: StealthPatchConfig = {
  webdriver: false, cdcArtifacts: false, chromeRuntime: false,
  plugins: false, permissions: false, iframes: false,
  webgl: false, canvas: false, audioContext: false,
  tlsFingerprint: false, mouseMovement: false, typingPattern: false,
};

const BASIC_PATCHES: StealthPatchConfig = {
  webdriver: true, cdcArtifacts: true, chromeRuntime: true,
  plugins: true, permissions: true, iframes: true,
  webgl: false, canvas: false, audioContext: false,
  tlsFingerprint: false, mouseMovement: false, typingPattern: false,
};

const ADVANCED_PATCHES: StealthPatchConfig = {
  ...BASIC_PATCHES,
  tlsFingerprint: true, mouseMovement: true, typingPattern: true,
};

const MAXIMUM_PATCHES: StealthPatchConfig = {
  ...ADVANCED_PATCHES,
  webgl: true, canvas: true, audioContext: true,
};

export class StealthManager {
  private readonly config: StealthConfig;

  constructor(config: StealthConfig) {
    this.config = config;
  }

  getPatchConfig(): StealthPatchConfig {
    if (this.config.patches) {
      return { ...MAXIMUM_PATCHES, ...this.config.patches };
    }
    switch (this.config.level ?? 'none') {
      case 'none': return { ...NONE_PATCHES };
      case 'basic': return { ...BASIC_PATCHES };
      case 'advanced': return { ...ADVANCED_PATCHES };
      case 'maximum': return { ...MAXIMUM_PATCHES };
    }
  }

  getLaunchArgs(proxy?: ProxyConfig): string[] {
    return [...getStealthLaunchArgs(), ...getProxyArgs(proxy)];
  }

  async applyToPage(page: Page, fingerprint: FingerprintProfile): Promise<void> {
    const patches = this.getPatchConfig();
    const anyPatchActive = Object.values(patches).some(Boolean);

    await page.setUserAgent(fingerprint.userAgent);
    // Only override viewport when patches are active — at 'none' level
    // the viewport is already set correctly via defaultViewport at launch
    if (anyPatchActive) {
      await page.setViewport(fingerprint.viewport);
    }

    if (patches.webdriver) await page.evaluateOnNewDocument(getWebdriverPatch());
    if (patches.cdcArtifacts) await page.evaluateOnNewDocument(getCdcArtifactsPatch());
    if (patches.chromeRuntime) await page.evaluateOnNewDocument(getChromeRuntimePatch());
    if (patches.plugins) await page.evaluateOnNewDocument(getPluginsPatch());
    if (patches.permissions) await page.evaluateOnNewDocument(getPermissionsPatch());
    if (patches.iframes) await page.evaluateOnNewDocument(getIframePatch());

    if (patches.webgl) await page.evaluateOnNewDocument(getWebGLPatch(fingerprint.webglVendor, fingerprint.webglRenderer));
    if (patches.canvas) await page.evaluateOnNewDocument(getCanvasPatch(fingerprint.canvasSeed));
    if (patches.audioContext) await page.evaluateOnNewDocument(getAudioContextPatch(fingerprint.audioSeed));
    if (patches.canvas || patches.webgl) await page.evaluateOnNewDocument(getFontPatch());

    if (anyPatchActive) {
      const cdp = await page.createCDPSession();
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: fingerprint.timezone });
      await cdp.send('Emulation.setLocaleOverride', { locale: fingerprint.locale });
      await cdp.detach();

      await page.setExtraHTTPHeaders({
        'Accept-Language': `${fingerprint.locale},en;q=0.9`,
      });
    }
  }
}
