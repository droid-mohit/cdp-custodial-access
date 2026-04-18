import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { BrowserController } from '../../src/sdk/browser-controller.js';
import { InterventionServer } from '../../src/intervention/server.js';

describe('InterventionServer e2e (real Chrome, mock tunnel)', () => {
  let controller: BrowserController;

  afterEach(async () => {
    try {
      for (const s of controller?.getSessions() ?? []) {
        await controller.closeSession(s.id);
      }
    } catch {}
  });

  it('completes full connection → done flow with real Chrome', async () => {
    controller = new BrowserController();
    const session = await controller.launch({ headless: true, workflow: 'intervention-e2e-test' });
    const page = await session.page();

    await page.goto('data:text/html,<html><body><button id="btn">Click me</button></body></html>');

    const cdpSession = await page.createCDPSession();
    const token = 'c'.repeat(64);

    const server = new InterventionServer({
      page,
      cdpSession,
      token,
      allowNavigation: false,
      quality: { format: 'jpeg', quality: 50, maxWidth: 640, maxHeight: 480, everyNthFrame: 1 },
    });

    const { port } = await server.start();

    // Create buffered WS client — listener registered before 'open' to avoid race
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${token}`);
    const buffer: unknown[] = [];
    const waiters = new Map<string, Array<(msg: unknown) => void>>();

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
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });

    function nextMsg(type: string, timeoutMs = 10_000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const idx = buffer.findIndex((m: any) => m.type === type);
        if (idx >= 0) { resolve(buffer.splice(idx, 1)[0]); return; }
        const timer = setTimeout(() => reject(new Error(`timeout for ${type}`)), timeoutMs);
        const handler = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const list = waiters.get(type) ?? [];
        list.push(handler);
        waiters.set(type, list);
      });
    }

    // Verify WS upgrade was accepted and server-side ready fires
    const serverReady = new Promise<void>(resolve => server.onReady(resolve));
    const wsReady = nextMsg('ready', 10_000);
    await Promise.all([serverReady, wsReady]);

    // Verify server is running and accepting input (send a ping)
    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await nextMsg('pong', 5000) as any;
    expect(pong.type).toBe('pong');

    // Inject mouse input (no assertion on CDP — integration verifies no errors thrown)
    ws.send(JSON.stringify({ type: 'mousedown', x: 0.5, y: 0.5, button: 0, modifiers: 0, timestamp: Date.now() }));
    ws.send(JSON.stringify({ type: 'mouseup', x: 0.5, y: 0.5, button: 0, modifiers: 0, timestamp: Date.now() }));
    await new Promise<void>(r => setTimeout(r, 200));

    // Verify the done flow completes
    const completionPromise = new Promise<any>(resolve => server.onComplete(resolve));
    ws.send(JSON.stringify({ type: 'done' }));
    const result = await completionPromise;
    expect(result.status).toBe('completed');

    ws.close();
    await server.stop();
  }, 30_000);

  it('rejects a second WS connection with same token (1008)', async () => {
    controller = new BrowserController();
    const session = await controller.launch({ headless: true, workflow: 'intervention-e2e-test-2' });
    const page = await session.page();
    const cdpSession = await page.createCDPSession();
    const token = 'd'.repeat(64);

    const server = new InterventionServer({
      page,
      cdpSession,
      token,
      allowNavigation: false,
    });

    const { port } = await server.start();

    // First connection succeeds
    const ws1 = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${token}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    // Second connection gets 1008
    const code = await new Promise<number>(resolve => {
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/${token}`);
      ws2.on('close', c => resolve(c));
      ws2.on('error', () => resolve(1006));
    });

    expect(code).toBe(1008);

    ws1.close();
    await server.stop();
  }, 20_000);
});
