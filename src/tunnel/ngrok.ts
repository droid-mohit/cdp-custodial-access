import type { Tunnel, NgrokTunnelConfig } from './types.js';
import { TunnelError } from './types.js';

export class NgrokTunnel implements Tunnel {
  private listener: { url(): string; close(): Promise<void> } | null = null;

  constructor(private readonly config: NgrokTunnelConfig) {}

  async expose(localPort: number): Promise<{ publicUrl: string }> {
    // @ngrok/ngrok is an optional peer dependency — import dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ngrok: any;
    try {
      const mod = await import('@ngrok/ngrok' as string);
      ngrok = (mod as any).default ?? mod;
    } catch {
      throw new TunnelError(
        'Install @ngrok/ngrok to use the ngrok tunnel: npm install @ngrok/ngrok',
        'DEPENDENCY_MISSING',
      );
    }

    const authtoken = this.config.authtoken ?? process.env.NGROK_AUTHTOKEN;
    if (!authtoken) {
      throw new TunnelError(
        'ngrok authtoken missing. Set NGROK_AUTHTOKEN env var or pass tunnel.authtoken.',
        'AUTH_FAILED',
      );
    }

    try {
      this.listener = await ngrok.connect({
        addr: localPort,
        authtoken,
        ...(this.config.region ? { region: this.config.region } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('token')) {
        throw new TunnelError(`ngrok auth failed: ${msg}`, 'AUTH_FAILED');
      }
      throw new TunnelError(`ngrok failed to establish tunnel: ${msg}`, 'UNAVAILABLE');
    }

    return { publicUrl: this.listener!.url() };
  }

  async close(): Promise<void> {
    await this.listener?.close();
    this.listener = null;
  }
}
