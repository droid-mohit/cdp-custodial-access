import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures these are defined before vi.mock factories run
const mockServer = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue({ port: 34521 }),
  stop: vi.fn().mockResolvedValue(undefined),
  onComplete: vi.fn(),
  onOperatorConnect: vi.fn(),
  onReady: vi.fn(),
  abort: vi.fn(),
  operatorConnectedAt: null as Date | null,
}));

const mockTunnel = vi.hoisted(() => ({
  expose: vi.fn().mockResolvedValue({ publicUrl: 'https://abc.ngrok-free.app' }),
  close: vi.fn().mockResolvedValue(undefined),
}));

const mockNotifier = vi.hoisted(() => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/intervention/server.js', () => ({
  InterventionServer: vi.fn().mockImplementation(class { constructor() { return mockServer; } }),
}));

vi.mock('../../../src/tunnel/index.js', () => ({
  createTunnel: vi.fn().mockReturnValue(mockTunnel),
}));

vi.mock('../../../src/notifiers/index.js', () => ({
  createNotifier: vi.fn().mockReturnValue(mockNotifier),
}));

function createMockSession() {
  const mockCdpSession = {
    send: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
  };
  const mockPage = {
    url: vi.fn().mockReturnValue('https://example.com'),
    createCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
  };
  return {
    page: vi.fn().mockResolvedValue(mockPage),
    tracer: { log: vi.fn(), record: vi.fn() },
    id: 'test-session-id',
  };
}

describe('requestHumanIntervention', () => {
  let session: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer.operatorConnectedAt = null;
    mockServer.start.mockResolvedValue({ port: 34521 });
    mockServer.stop.mockResolvedValue(undefined);
    mockServer.onComplete.mockImplementation(() => {});
    mockTunnel.expose.mockResolvedValue({ publicUrl: 'https://abc.ngrok-free.app' });
    mockTunnel.close.mockResolvedValue(undefined);
    mockNotifier.notify.mockResolvedValue(undefined);
    session = createMockSession();
  });

  it('returns success:true with handle containing url and interventionId', async () => {
    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'Solve captcha' });

    expect(result.success).toBe(true);
    expect(result.data!.url).toContain('https://abc.ngrok-free.app');
    expect(result.data!.interventionId).toBeTruthy();
  });

  it('returns TUNNEL_UNAVAILABLE when tunnel.expose throws TunnelError UNAVAILABLE', async () => {
    const { TunnelError } = await import('../../../src/tunnel/types.js');
    mockTunnel.expose.mockRejectedValueOnce(new TunnelError('timeout', 'UNAVAILABLE'));

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test' });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TUNNEL_UNAVAILABLE');
  });

  it('returns TUNNEL_DEPENDENCY_MISSING when adapter throws DEPENDENCY_MISSING', async () => {
    const { TunnelError } = await import('../../../src/tunnel/types.js');
    mockTunnel.expose.mockRejectedValueOnce(new TunnelError('missing', 'DEPENDENCY_MISSING'));

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test' });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TUNNEL_DEPENDENCY_MISSING');
  });

  it('returns success:true when notifier.notify fails (non-fatal)', async () => {
    mockNotifier.notify.mockRejectedValueOnce(new Error('Slack down'));

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, {
      reason: 'test',
      notifier: { type: 'slack', webhook: 'https://hooks.slack.com/test' },
    });

    expect(result.success).toBe(true);
    expect(session.tracer.log).toHaveBeenCalledWith(expect.stringContaining('Notifier'));
  });

  it('waitForCompletion resolves with completed when server fires done', async () => {
    mockServer.onComplete.mockImplementation((cb: (r: any) => void) => {
      setTimeout(() => cb({ status: 'completed' }), 30);
    });

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test' });
    const completion = await result.data!.waitForCompletion();

    expect(completion.status).toBe('completed');
    expect(completion.durationMs).toBeGreaterThanOrEqual(0);
  }, 5000);

  it('waitForCompletion resolves with timeout when timeoutMs elapses', async () => {
    mockServer.onComplete.mockImplementation(() => {}); // never fires

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test', timeoutMs: 80 });
    const completion = await result.data!.waitForCompletion();

    expect(completion.status).toBe('timeout');
  }, 5000);

  it('handle.abort() calls server.abort()', async () => {
    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test' });
    await result.data!.abort('deadline');

    expect(mockServer.abort).toHaveBeenCalledWith('deadline');
  });

  it('calls server.stop() and tunnel.close() in cleanup after waitForCompletion', async () => {
    mockServer.onComplete.mockImplementation((cb: (r: any) => void) => {
      setTimeout(() => cb({ status: 'completed' }), 20);
    });

    const { requestHumanIntervention } = await import('../../../src/tools/human-intervention.js');
    const result = await requestHumanIntervention(session as any, { reason: 'test' });
    await result.data!.waitForCompletion();

    expect(mockServer.stop).toHaveBeenCalled();
    expect(mockTunnel.close).toHaveBeenCalled();
  }, 5000);
});
