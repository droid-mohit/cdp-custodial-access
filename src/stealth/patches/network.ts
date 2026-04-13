import type { ProxyConfig } from '../../types.js';

export function getStealthLaunchArgs(): string[] {
  // Keep args minimal — excessive flags are themselves a bot fingerprint.
  // These 4 core args match the pattern used by proven ChatGPT automation.
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

export function getProxyArgs(proxy: ProxyConfig | undefined): string[] {
  if (!proxy) return [];
  return [`--proxy-server=${proxy.server}`];
}
