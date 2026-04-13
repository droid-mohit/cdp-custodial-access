import { describe, it, expect } from 'vitest';
import { getStealthLaunchArgs, getProxyArgs } from '../../../src/stealth/patches/network.js';
import type { ProxyConfig } from '../../../src/types.js';

describe('getStealthLaunchArgs', () => {
  it('returns an array of Chrome launch arguments', () => {
    const args = getStealthLaunchArgs();
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBeGreaterThan(0);
  });

  it('includes disable-blink-features=AutomationControlled', () => {
    const args = getStealthLaunchArgs();
    expect(args).toContain('--disable-blink-features=AutomationControlled');
  });

  it('includes no-first-run and no-default-browser-check', () => {
    const args = getStealthLaunchArgs();
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--no-default-browser-check');
  });

  it('includes disable-infobars', () => {
    const args = getStealthLaunchArgs();
    expect(args).toContain('--disable-infobars');
  });
});

describe('getProxyArgs', () => {
  it('returns proxy-server arg for HTTP proxy', () => {
    const proxy: ProxyConfig = { server: 'http://proxy.example.com:8080' };
    const args = getProxyArgs(proxy);
    expect(args).toContain('--proxy-server=http://proxy.example.com:8080');
  });

  it('returns proxy-server arg for SOCKS5 proxy', () => {
    const proxy: ProxyConfig = { server: 'socks5://proxy.example.com:1080' };
    const args = getProxyArgs(proxy);
    expect(args).toContain('--proxy-server=socks5://proxy.example.com:1080');
  });

  it('returns empty array when no proxy given', () => {
    const args = getProxyArgs(undefined);
    expect(args).toEqual([]);
  });
});
