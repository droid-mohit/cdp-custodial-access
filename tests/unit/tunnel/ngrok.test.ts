import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TunnelError } from '../../../src/tunnel/types.js';

const mockListener = {
  url: vi.fn().mockReturnValue('https://abc123.ngrok-free.app'),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@ngrok/ngrok', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockListener),
  },
}));

describe('NgrokTunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListener.url.mockReturnValue('https://abc123.ngrok-free.app');
    mockListener.close.mockResolvedValue(undefined);
  });

  it('expose() connects with given port and returns public URL', async () => {
    process.env.NGROK_AUTHTOKEN = 'test-token-123';
    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');
    const ngrokModule = await import('@ngrok/ngrok');

    const tunnel = new NgrokTunnel({ type: 'ngrok' });
    const { publicUrl } = await tunnel.expose(34521);

    expect(ngrokModule.default.connect).toHaveBeenCalledWith(
      expect.objectContaining({ addr: 34521, authtoken: 'test-token-123' }),
    );
    expect(publicUrl).toBe('https://abc123.ngrok-free.app');
    delete process.env.NGROK_AUTHTOKEN;
  });

  it('expose() prefers config.authtoken over env var', async () => {
    process.env.NGROK_AUTHTOKEN = 'env-token';
    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');
    const ngrokModule = await import('@ngrok/ngrok');

    const tunnel = new NgrokTunnel({ type: 'ngrok', authtoken: 'config-token' });
    await tunnel.expose(1234);

    expect(ngrokModule.default.connect).toHaveBeenCalledWith(
      expect.objectContaining({ authtoken: 'config-token' }),
    );
    delete process.env.NGROK_AUTHTOKEN;
  });

  it('expose() throws TunnelError AUTH_FAILED when no authtoken is set', async () => {
    delete process.env.NGROK_AUTHTOKEN;
    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');

    const tunnel = new NgrokTunnel({ type: 'ngrok' });
    await expect(tunnel.expose(1234)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('expose() throws TunnelError UNAVAILABLE when connect rejects', async () => {
    process.env.NGROK_AUTHTOKEN = 'test-token';
    const ngrokModule = await import('@ngrok/ngrok');
    (ngrokModule.default.connect as any).mockRejectedValueOnce(new Error('network timeout'));

    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');
    const tunnel = new NgrokTunnel({ type: 'ngrok' });

    await expect(tunnel.expose(1234)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    delete process.env.NGROK_AUTHTOKEN;
  });

  it('close() calls listener.close()', async () => {
    process.env.NGROK_AUTHTOKEN = 'test-token';
    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');

    const tunnel = new NgrokTunnel({ type: 'ngrok' });
    await tunnel.expose(1234);
    await tunnel.close();

    expect(mockListener.close).toHaveBeenCalled();
    delete process.env.NGROK_AUTHTOKEN;
  });
});

describe('createTunnel factory', () => {
  it('returns the custom adapter when type is custom', async () => {
    const { createTunnel } = await import('../../../src/tunnel/index.js');
    const mockAdapter = {
      expose: vi.fn().mockResolvedValue({ publicUrl: 'https://custom.example.com' }),
      close: vi.fn(),
    };
    const tunnel = createTunnel({ type: 'custom', adapter: mockAdapter });
    const result = await tunnel.expose(1234);
    expect(result.publicUrl).toBe('https://custom.example.com');
  });

  it('returns NgrokTunnel when type is ngrok', async () => {
    const { createTunnel } = await import('../../../src/tunnel/index.js');
    const { NgrokTunnel } = await import('../../../src/tunnel/ngrok.js');
    const tunnel = createTunnel({ type: 'ngrok' });
    expect(tunnel).toBeInstanceOf(NgrokTunnel);
  });
});
