import { describe, it, expect } from 'vitest';
import { generateFingerprint } from '../../../src/stealth/fingerprint-profile.js';
import type { FingerprintProfile } from '../../../src/types.js';

describe('generateFingerprint', () => {
  it('returns a valid FingerprintProfile', () => {
    const fp = generateFingerprint();
    expect(fp.userAgent).toContain('Mozilla/5.0');
    expect(fp.viewport.width).toBeGreaterThan(0);
    expect(fp.viewport.height).toBeGreaterThan(0);
    expect(fp.webglVendor).toBeTruthy();
    expect(fp.webglRenderer).toBeTruthy();
    expect(fp.canvasSeed).toBeTypeOf('number');
    expect(fp.audioSeed).toBeTypeOf('number');
    expect(fp.timezone).toBeTruthy();
    expect(fp.locale).toBeTruthy();
    expect(fp.platform).toBeTruthy();
  });

  it('generates different fingerprints on each call', () => {
    const fp1 = generateFingerprint();
    const fp2 = generateFingerprint();
    const differ = fp1.canvasSeed !== fp2.canvasSeed ||
                   fp1.audioSeed !== fp2.audioSeed ||
                   fp1.webglRenderer !== fp2.webglRenderer;
    expect(differ).toBe(true);
  });

  it('generates realistic user agent strings', () => {
    const fp = generateFingerprint();
    expect(fp.userAgent).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+/);
  });

  it('picks viewport from common resolutions', () => {
    const fp = generateFingerprint();
    const knownWidths = [1366, 1440, 1536, 1920, 2560];
    expect(knownWidths).toContain(fp.viewport.width);
  });

  it('picks platform from realistic set', () => {
    const fp = generateFingerprint();
    const knownPlatforms = ['Win32', 'MacIntel', 'Linux x86_64'];
    expect(knownPlatforms).toContain(fp.platform);
  });
});