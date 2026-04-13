import { describe, it, expect, vi } from 'vitest';
import { StealthManager } from '../../../src/stealth/index.js';
import type { FingerprintProfile, StealthConfig } from '../../../src/types.js';

function createMockPage() {
  return {
    evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    setViewport: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    createCDPSession: vi.fn().mockResolvedValue({
      send: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    }),
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

describe('StealthManager', () => {
  describe('getLaunchArgs', () => {
    it('returns stealth args for any level', () => {
      const manager = new StealthManager({ level: 'basic' });
      const args = manager.getLaunchArgs();
      expect(args).toContain('--disable-blink-features=AutomationControlled');
    });

    it('includes proxy args when proxy provided', () => {
      const manager = new StealthManager({ level: 'basic' });
      const args = manager.getLaunchArgs({ server: 'socks5://localhost:1080' });
      expect(args.some(a => a.includes('proxy-server'))).toBe(true);
    });
  });

  describe('applyToPage', () => {
    it('applies property patches for basic level', async () => {
      const manager = new StealthManager({ level: 'basic' });
      const page = createMockPage();
      await manager.applyToPage(page as any, testFingerprint);
      expect(page.evaluateOnNewDocument).toHaveBeenCalled();
      expect(page.setUserAgent).toHaveBeenCalledWith(testFingerprint.userAgent);
    });

    it('applies fingerprint patches for maximum level', async () => {
      const manager = new StealthManager({ level: 'maximum' });
      const page = createMockPage();
      await manager.applyToPage(page as any, testFingerprint);
      const callCount = page.evaluateOnNewDocument.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(4);
    });

    it('respects granular patch config', async () => {
      const manager = new StealthManager({
        patches: {
          webdriver: true,
          webgl: false,
          canvas: false,
          audioContext: false,
        },
      });
      const page = createMockPage();
      await manager.applyToPage(page as any, testFingerprint);
      const scripts = page.evaluateOnNewDocument.mock.calls.map((c: any[]) => c[0]);
      expect(scripts.some((s: string) => s.includes('webdriver'))).toBe(true);
      expect(scripts.some((s: string) => s.includes('UNMASKED_VENDOR_WEBGL'))).toBe(false);
    });
  });

  describe('getPatchConfig', () => {
    it('basic level enables only property patches', () => {
      const manager = new StealthManager({ level: 'basic' });
      const config = manager.getPatchConfig();
      expect(config.webdriver).toBe(true);
      expect(config.cdcArtifacts).toBe(true);
      expect(config.webgl).toBe(false);
      expect(config.canvas).toBe(false);
      expect(config.mouseMovement).toBe(false);
    });

    it('maximum level enables everything', () => {
      const manager = new StealthManager({ level: 'maximum' });
      const config = manager.getPatchConfig();
      expect(config.webdriver).toBe(true);
      expect(config.webgl).toBe(true);
      expect(config.canvas).toBe(true);
      expect(config.mouseMovement).toBe(true);
      expect(config.tlsFingerprint).toBe(true);
    });
  });
});
