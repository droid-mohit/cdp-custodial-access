import type { StealthConfig, ProxyConfig, FingerprintProfile } from '../types.js';

export interface LaunchConfig {
  profile?: string;
  headless?: boolean;
  proxy?: ProxyConfig;
  stealth?: StealthConfig;
  executablePath?: string;
  userDataDir?: string;
  defaultViewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
}

export interface ConnectConfig {
  wsEndpoint: string;
  stealth?: StealthConfig;
}

export interface ProfileMetadata {
  name: string;
  fingerprint: FingerprintProfile;
  proxy?: ProxyConfig;
  createdAt: string;
  lastUsedAt: string;
}

export interface SessionConfig {
  stealth: StealthConfig;
  profileDir: string;
  defaultTimeout: number;
  screenshotOnError: boolean;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  stealth: { level: 'none' },
  profileDir: '~/.cdp-custodial/profiles',
  defaultTimeout: 30000,
  screenshotOnError: true,
};
