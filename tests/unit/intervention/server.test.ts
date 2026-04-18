import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { InterventionServer } from '../../../src/intervention/server.js';

function createMockCDPSession() {
  const eventListeners = new Map<string, Array<(data: unknown) => void>>();
  const mock = {
    send: vi.fn().mockImplementation((method: string) => {
      if (method === 'Page.getLayoutMetrics') {
        return Promise.resolve({ visualViewport: { clientWidth: 1920, clientHeight: 1080 } });
      }
      return Promise.resolve({});
    }),
    on: vi.fn((event: string, fn: (data: unknown) => void) => {
      const list = eventListeners.get(event) ?? [];
      list.push(fn);
      eventListeners.set(event, list);
    }),
    _emit(event: string, data: unknown) {
      eventListeners.get(event)?.forEach(fn => fn(data));
    },
  };
  return mock;
}

function createMockPage(initialUrl = 'https://example.com') {
  const frameNavListeners: Array<(frame: unknown) => void> = [];
  let currentUrl = initialUrl;
  const mainFrame = { url: () => currentUrl };
  return {
    url: vi.fn(() => currentUrl),
    mainFrame: vi.fn().mockReturnValue(mainFrame),
    on: vi.fn((event: string, fn: (frame: unknown) => void) => {
      if (event === 'framenavigated') frameNavListeners.push(fn);
    }),
    goto: vi.fn().mockResolvedValue(null),
    _emitFrameNavigation(newUrl: string) {
      currentUrl = newUrl;
      frameNavListeners.forEach(fn => fn(mainFrame));
    },
  };
}

/**
 * Creates a buffered WS client. The message listener is registered BEFORE 'open' fires,
 * so messages that arrive in the same TCP chunk as the 101 response are not missed.
 */
async function createClient(port: number, token: string): Promise<{
  ws: WebSocket;
  nextMsg(type: string, timeoutMs?: number): Promise<unknown>;
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${token}`);
  const buffer: unknown[] = [];
  const waiters = new Map<string, Array<(msg: unknown) => void>>();

  // Register BEFORE open — captures messages in the same TCP chunk as the 101
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    const pending = waiters.get((msg as any).type);
    if (pending?.length) {
      pending.shift()!(msg);
    } else {
      buffer.push(msg);
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 3000);
  });

  function nextMsg(type: string, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const idx = buffer.findIndex((m: any) => m.type === type);
      if (idx >= 0) { resolve(buffer.splice(idx, 1)[0]); return; }
      const timer = setTimeout(() => {
        const list = waiters.get(type);
        if (list) { const i = list.indexOf(handler); if (i >= 0) list.splice(i, 1); }
        reject(new Error(`Timeout waiting for WS message type "${type}"`));
      }, timeoutMs);
      const handler = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
      const list = waiters.get(type) ?? [];
      list.push(handler);
      waiters.set(type, list);
    });
  }

  return { ws, nextMsg };
}

function waitForReady(server: InterventionServer): Promise<void> {
  return new Promise(resolve => server.onReady(resolve));
}

const VALID_TOKEN = 'a'.repeat(64);

describe('InterventionServer', () => {
  let server: InterventionServer;
  let cdpSession: ReturnType<typeof createMockCDPSession>;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    cdpSession = createMockCDPSession();
    page = createMockPage();
    server = new InterventionServer({
      page: page as any,
      cdpSession: cdpSession as any,
      token: VALID_TOKEN,
      allowNavigation: false,
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('starts and returns a port in valid range', async () => {
    const { port } = await server.start();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it('serves index.html at GET /', async () => {
    const { port } = await server.start();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('returns 404 for unknown paths', async () => {
    const { port } = await server.start();
    const res = await fetch(`http://127.0.0.1:${port}/unknown.js`);
    expect(res.status).toBe(404);
  });

  it('rejects WebSocket connection with invalid token', async () => {
    const { port } = await server.start();
    const rejected = await new Promise<boolean>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/wrongtoken`);
      ws.on('close', () => resolve(true));
      ws.on('error', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });
    expect(rejected).toBe(true);
  });

  it('accepts WebSocket upgrade with correct token', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects a second WebSocket upgrade with same token (close 1008)', async () => {
    const { port } = await server.start();
    const { ws: ws1 } = await createClient(port, VALID_TOKEN);

    const secondCloseCode = await new Promise<number>(resolve => {
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/${VALID_TOKEN}`);
      ws2.on('close', code => resolve(code));
      ws2.on('error', () => resolve(1006));
    });

    expect(secondCloseCode).toBe(1008);
    ws1.close();
  });

  it('sends ready WS message after operator connects', async () => {
    const { port } = await server.start();
    const { nextMsg, ws } = await createClient(port, VALID_TOKEN);
    const msg = await nextMsg('ready');
    expect((msg as any).type).toBe('ready');
    ws.close();
  });

  it('forwards screencast frames to connected client', async () => {
    const { port } = await server.start();
    const { nextMsg, ws } = await createClient(port, VALID_TOKEN);

    await waitForReady(server);

    const framePromise = nextMsg('frame');
    cdpSession._emit('Page.screencastFrame', {
      data: btoa('fake-jpeg-bytes'),
      metadata: { deviceWidth: 1280, deviceHeight: 960 },
      sessionId: 7,
    });

    const frame = await framePromise as any;
    expect(frame.type).toBe('frame');
    expect(frame.data).toBe(btoa('fake-jpeg-bytes'));
    expect(frame.frameWidth).toBe(1280);
    ws.close();
  });

  it('sends Page.screencastFrameAck after each frame', async () => {
    const { port } = await server.start();
    const { nextMsg, ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    const framePromise = nextMsg('frame');
    cdpSession._emit('Page.screencastFrame', {
      data: 'x',
      metadata: { deviceWidth: 1280, deviceHeight: 960 },
      sessionId: 42,
    });
    await framePromise;

    expect(cdpSession.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 42 });
    ws.close();
  });

  it('injects denormalized mouse coords on mousedown message', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    ws.send(JSON.stringify({ type: 'mousedown', x: 0.5, y: 0.5, button: 0, modifiers: 0, timestamp: Date.now() }));
    await new Promise<void>(r => setTimeout(r, 150));

    expect(cdpSession.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({
      type: 'mousePressed',
      x: 960,
      y: 540,
      button: 'left',
    }));
    ws.close();
  });

  it('injects key events on keydown message', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    ws.send(JSON.stringify({ type: 'keydown', key: 'Enter', code: 'Enter', modifiers: 0 }));
    await new Promise<void>(r => setTimeout(r, 150));

    expect(cdpSession.send).toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.objectContaining({
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
    }));
    ws.close();
  });

  it('calls onComplete callback with completed status when client sends done', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    const completed = new Promise<{ status: string }>(resolve => server.onComplete(resolve));
    ws.send(JSON.stringify({ type: 'done' }));
    const result = await completed;
    expect(result.status).toBe('completed');
    ws.close();
  });

  it('calls onComplete with aborted status when client sends cancel', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    const completed = new Promise<{ status: string }>(resolve => server.onComplete(resolve));
    ws.send(JSON.stringify({ type: 'cancel' }));
    const result = await completed;
    expect(result.status).toBe('aborted');
    ws.close();
  });

  it('sends aborted WS message to client when abort() is called from server side', async () => {
    const { port } = await server.start();
    const { nextMsg, ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    const abortMsgPromise = nextMsg('aborted');
    server.abort('deadline exceeded');
    const msg = await abortMsgPromise as any;
    expect(msg.reason).toBe('deadline exceeded');
    ws.close();
  });

  it('navigates back on cross-origin framenavigated when allowNavigation is false', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    page._emitFrameNavigation('https://evil.com/page');
    await new Promise<void>(r => setTimeout(r, 100));

    expect(page.goto).toHaveBeenCalledWith('https://example.com');
    ws.close();
  });

  it('does NOT navigate back on same-origin framenavigated', async () => {
    const { port } = await server.start();
    const { ws } = await createClient(port, VALID_TOKEN);
    await waitForReady(server);

    page._emitFrameNavigation('https://example.com/other-page');
    await new Promise<void>(r => setTimeout(r, 100));

    expect(page.goto).not.toHaveBeenCalled();
    ws.close();
  });
});
