import { describe, it, expect } from 'vitest';
import {
  getWebdriverPatch,
  getCdcArtifactsPatch,
  getChromeRuntimePatch,
  getPluginsPatch,
  getPermissionsPatch,
  getIframePatch,
} from '../../../src/stealth/patches/properties.js';

describe('property patches', () => {
  it('getWebdriverPatch returns a script that undefines navigator.webdriver', () => {
    const script = getWebdriverPatch();
    expect(script).toContain('navigator');
    expect(script).toContain('webdriver');
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('getCdcArtifactsPatch returns a script removing $cdc_ and $wdc_ properties', () => {
    const script = getCdcArtifactsPatch();
    expect(script).toContain('$cdc_');
    expect(script).toContain('$wdc_');
  });

  it('getChromeRuntimePatch returns a script mocking window.chrome.runtime', () => {
    const script = getChromeRuntimePatch();
    expect(script).toContain('chrome');
    expect(script).toContain('runtime');
  });

  it('getPluginsPatch returns a script spoofing navigator.plugins', () => {
    const script = getPluginsPatch();
    expect(script).toContain('plugins');
    expect(script).toContain('PDF');
  });

  it('getPermissionsPatch returns a script mocking Permissions API', () => {
    const script = getPermissionsPatch();
    expect(script).toContain('permissions');
    expect(script).toContain('query');
  });

  it('getIframePatch returns a script sanitizing iframe contentWindow', () => {
    const script = getIframePatch();
    expect(script).toContain('iframe');
    expect(script).toContain('contentWindow');
  });

  it('all patches return valid JavaScript (no syntax errors)', () => {
    const patches = [
      getWebdriverPatch(),
      getCdcArtifactsPatch(),
      getChromeRuntimePatch(),
      getPluginsPatch(),
      getPermissionsPatch(),
      getIframePatch(),
    ];
    for (const patch of patches) {
      expect(() => new Function(patch)).not.toThrow();
    }
  });
});
