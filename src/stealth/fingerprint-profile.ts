import type { FingerprintProfile } from '../types.js';

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const CHROME_VERSIONS = [
  '120.0.6099.109', '121.0.6167.85', '122.0.6261.94',
  '123.0.6312.86', '124.0.6367.91', '125.0.6422.76',
  '126.0.6478.114', '127.0.6533.72', '128.0.6613.84',
  '129.0.6668.70', '130.0.6723.58', '131.0.6778.85',
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const GPU_CONFIGS = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
];

const PLATFORM_CONFIGS = [
  { platform: 'Win32' as const, osFragment: '(Windows NT 10.0; Win64; x64)' },
  { platform: 'MacIntel' as const, osFragment: '(Macintosh; Intel Mac OS X 10_15_7)' },
  { platform: 'Linux x86_64' as const, osFragment: '(X11; Linux x86_64)' },
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London', 'Europe/Berlin',
  'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
];

const LOCALES = ['en-US', 'en-GB', 'en-CA', 'de-DE', 'fr-FR', 'ja-JP', 'zh-CN'];

export function generateFingerprint(): FingerprintProfile {
  const chromeVersion = randomItem(CHROME_VERSIONS);
  const viewport = randomItem(VIEWPORTS);
  const gpu = randomItem(GPU_CONFIGS);
  const platformConfig = randomItem(PLATFORM_CONFIGS);
  const timezone = randomItem(TIMEZONES);
  const locale = randomItem(LOCALES);

  const userAgent = `Mozilla/5.0 ${platformConfig.osFragment} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

  return {
    userAgent,
    viewport,
    webglVendor: gpu.vendor,
    webglRenderer: gpu.renderer,
    canvasSeed: randomInt(0, 0xffffff),
    audioSeed: randomInt(0, 0xffffff),
    timezone,
    locale,
    platform: platformConfig.platform,
  };
}