export interface Tunnel {
  expose(localPort: number): Promise<{ publicUrl: string }>;
  close(): Promise<void>;
}

export type TunnelErrorCode =
  | 'DEPENDENCY_MISSING'
  | 'AUTH_FAILED'
  | 'UNAVAILABLE'
  | 'CUSTOM_FAILED';

export class TunnelError extends Error {
  constructor(
    message: string,
    public readonly code: TunnelErrorCode,
  ) {
    super(message);
    this.name = 'TunnelError';
  }
}

export interface NgrokTunnelConfig {
  type: 'ngrok';
  authtoken?: string;
  region?: string;
}

export interface CustomTunnelConfig {
  type: 'custom';
  adapter: Tunnel;
}

export type TunnelConfig = NgrokTunnelConfig | CustomTunnelConfig;