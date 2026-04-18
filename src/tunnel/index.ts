import type { Tunnel, TunnelConfig } from './types.js';
import { NgrokTunnel } from './ngrok.js';

export function createTunnel(config: TunnelConfig = { type: 'ngrok' }): Tunnel {
  if (config.type === 'custom') return config.adapter;
  return new NgrokTunnel(config);
}
