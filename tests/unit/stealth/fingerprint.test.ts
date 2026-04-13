import { describe, it, expect } from 'vitest';
import {
  getWebGLPatch,
  getCanvasPatch,
  getAudioContextPatch,
  getFontPatch,
} from '../../../src/stealth/patches/fingerprint.js';

describe('fingerprint patches', () => {
  it('getWebGLPatch returns script using provided vendor/renderer', () => {
    const script = getWebGLPatch('NVIDIA Corporation', 'GeForce RTX 3060');
    expect(script).toContain('NVIDIA Corporation');
    expect(script).toContain('GeForce RTX 3060');
    expect(script).toContain('UNMASKED_VENDOR_WEBGL');
    expect(script).toContain('UNMASKED_RENDERER_WEBGL');
  });

  it('getCanvasPatch returns script using provided seed', () => {
    const script = getCanvasPatch(0x1234);
    expect(script).toContain('toDataURL');
    expect(script).toContain('toBlob');
    expect(script).toContain('4660');
  });

  it('getAudioContextPatch returns script using provided seed', () => {
    const script = getAudioContextPatch(0x5678);
    expect(script).toContain('getFloatFrequencyData');
    expect(script).toContain('22136');
  });

  it('getFontPatch returns script that modifies font enumeration', () => {
    const script = getFontPatch();
    expect(script).toContain('font');
    expect(typeof script).toBe('string');
  });

  it('all patches return valid JavaScript', () => {
    const patches = [
      getWebGLPatch('vendor', 'renderer'),
      getCanvasPatch(123),
      getAudioContextPatch(456),
      getFontPatch(),
    ];
    for (const patch of patches) {
      expect(() => new Function(patch)).not.toThrow();
    }
  });
});
