export enum ToolErrorCode {
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  SESSION_CLOSED = 'SESSION_CLOSED',
  STEALTH_DETECTION = 'STEALTH_DETECTION',
  CDP_ERROR = 'CDP_ERROR',
  INTERVENTION_PORT_EXHAUSTED = 'INTERVENTION_PORT_EXHAUSTED',
  TUNNEL_DEPENDENCY_MISSING = 'TUNNEL_DEPENDENCY_MISSING',
  TUNNEL_AUTH_FAILED = 'TUNNEL_AUTH_FAILED',
  TUNNEL_UNAVAILABLE = 'TUNNEL_UNAVAILABLE',
  TUNNEL_CUSTOM_FAILED = 'TUNNEL_CUSTOM_FAILED',
}

export interface ToolResultMetadata {
  url: string;
  timestamp: number;
  screenshotBase64?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ToolErrorCode;
  metadata?: ToolResultMetadata;
}

export type StealthLevel = 'none' | 'basic' | 'advanced' | 'maximum';

export interface StealthPatchConfig {
  webdriver?: boolean;
  cdcArtifacts?: boolean;
  chromeRuntime?: boolean;
  webgl?: boolean;
  canvas?: boolean;
  audioContext?: boolean;
  permissions?: boolean;
  plugins?: boolean;
  iframes?: boolean;
  tlsFingerprint?: boolean;
  mouseMovement?: boolean;
  typingPattern?: boolean;
}

export interface StealthConfig {
  level?: StealthLevel;
  patches?: StealthPatchConfig;
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface FingerprintProfile {
  userAgent: string;
  viewport: { width: number; height: number };
  webglVendor: string;
  webglRenderer: string;
  canvasSeed: number;
  audioSeed: number;
  timezone: string;
  locale: string;
  platform: string;
}