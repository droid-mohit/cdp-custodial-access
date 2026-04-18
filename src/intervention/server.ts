import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Page, CDPSession } from 'puppeteer';
import { CLIENT_HTML, CLIENT_JS, CLIENT_CSS } from './client/assets.js';
import type { StreamQualityPreset } from '../tools/human-intervention.js';

export interface InterventionServerOptions {
  page: Page;
  cdpSession: CDPSession;
  token: string;
  allowNavigation: boolean;
  quality?: StreamQualityPreset;
}

type CompletePayload = { status: string; reason?: string };

export class InterventionServer {
  private readonly httpServer: http.Server;
  private readonly wss: WebSocketServer;
  private client: WebSocket | null = null;
  private tokenConsumed = false;
  private completeCallback: ((r: CompletePayload) => void) | null = null;
  private connectCallback: ((at: Date) => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private isReady = false;
  private lockedOrigin = '';
  private lockedUrl = '';
  private viewportWidth = 1280;
  private viewportHeight = 720;
  private navigatingBack = false;

  public operatorConnectedAt: Date | null = null;

  constructor(private readonly opts: InterventionServerOptions) {
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.wss = new WebSocketServer({ noServer: true });
    this.httpServer.on('upgrade', this.handleUpgrade.bind(this));
  }

  async start(): Promise<{ port: number }> {
    const port = await this.findFreePort();
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(port, '127.0.0.1', () => resolve({ port }));
    });
  }

  async stop(): Promise<void> {
    this.client?.terminate();
    return new Promise<void>(resolve => {
      // 300ms fallback — httpServer.close() can linger if TCP FIN handshake is in progress
      const fallback = setTimeout(resolve, 300);
      this.httpServer.close(() => {
        clearTimeout(fallback);
        resolve();
      });
    });
  }

  onComplete(fn: (r: CompletePayload) => void): void {
    this.completeCallback = fn;
  }

  onOperatorConnect(fn: (at: Date) => void): void {
    this.connectCallback = fn;
  }

  onReady(fn: () => void): void {
    if (this.isReady) { fn(); return; }
    this.readyCallback = fn;
  }

  abort(reason?: string): void {
    this.sendToClient({ type: 'aborted', reason });
    this.completeCallback?.({ status: 'aborted', reason });
    this.client?.close();
  }

  private sendToClient(msg: object): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const ASSETS: Record<string, { body: string; type: string }> = {
      '/': { body: CLIENT_HTML, type: 'text/html; charset=utf-8' },
      '/client.js': { body: CLIENT_JS, type: 'application/javascript; charset=utf-8' },
      '/client.css': { body: CLIENT_CSS, type: 'text/css; charset=utf-8' },
    };
    const asset = ASSETS[pathname];
    if (!asset) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': asset.type });
    res.end(asset.body);
  }

  private handleUpgrade(
    req: http.IncomingMessage,
    socket: net.Socket,
    head: Buffer,
  ): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = url.pathname.match(/^\/ws\/([a-f0-9]+)$/i);
    if (!match) { socket.destroy(); return; }

    const requestToken = match[1];
    const isValidLength = requestToken.length === this.opts.token.length;
    const requestBuf = Buffer.from(requestToken.padEnd(this.opts.token.length, '0'));
    const expectedBuf = Buffer.from(this.opts.token);
    const tokenValid = isValidLength && crypto.timingSafeEqual(requestBuf, expectedBuf);

    if (!tokenValid) {
      // Invalid token: reject at HTTP level (no WS handshake)
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    if (this.tokenConsumed) {
      // Valid token but already consumed: complete WS handshake then close 1008
      this.wss.handleUpgrade(req, socket, head, ws => ws.close(1008, 'Session already in use'));
      return;
    }

    this.tokenConsumed = true;
    this.wss.handleUpgrade(req, socket, head, ws => this.handleWebSocket(ws));
  }

  private async handleWebSocket(ws: WebSocket): Promise<void> {
    this.client = ws;
    this.operatorConnectedAt = new Date();
    this.connectCallback?.(this.operatorConnectedAt);

    this.lockedUrl = this.opts.page.url();
    try {
      this.lockedOrigin = new URL(this.lockedUrl).origin;
    } catch {
      this.lockedOrigin = '';
    }

    // Cache viewport dimensions
    try {
      const metrics = await (this.opts.cdpSession as any).send('Page.getLayoutMetrics') as any;
      this.viewportWidth = metrics.visualViewport.clientWidth;
      this.viewportHeight = metrics.visualViewport.clientHeight;
    } catch {}

    // Start screencast
    const q = this.opts.quality ?? { format: 'jpeg', quality: 70, maxWidth: 1280, maxHeight: 960, everyNthFrame: 2 };
    await (this.opts.cdpSession as any).send('Page.startScreencast', q);

    // Forward screencast frames to operator
    (this.opts.cdpSession as any).on('Page.screencastFrame', async (params: any) => {
      this.sendToClient({
        type: 'frame',
        data: params.data,
        frameWidth: params.metadata?.deviceWidth ?? q.maxWidth,
        frameHeight: params.metadata?.deviceHeight ?? q.maxHeight,
        vmViewportWidth: this.viewportWidth,
        vmViewportHeight: this.viewportHeight,
        timestamp: Date.now(),
      });
      await (this.opts.cdpSession as any).send('Page.screencastFrameAck', { sessionId: params.sessionId });
    });

    // Navigation lock: detect cross-origin navigation and undo it
    if (!this.opts.allowNavigation && this.lockedOrigin) {
      this.opts.page.on('framenavigated', async (frame: any) => {
        if (this.navigatingBack) return;
        if (frame !== this.opts.page.mainFrame?.()) return;
        const newUrl: string = frame.url();
        try {
          if (new URL(newUrl).origin !== this.lockedOrigin) {
            this.navigatingBack = true;
            await this.opts.page.goto(this.lockedUrl);
            this.navigatingBack = false;
            this.sendToClient({ type: 'toast', message: 'Navigation blocked for security.' });
          }
        } catch {
          this.navigatingBack = false;
        }
      });
    }

    // Keepalive ping every 20s
    const keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 20_000);

    ws.on('message', async (raw) => {
      try {
        await this.handleClientMessage(JSON.parse(raw.toString()));
      } catch {}
    });

    ws.on('pong', () => this.sendToClient({ type: 'pong' }));

    ws.on('close', () => {
      clearInterval(keepalive);
      this.client = null;
    });

    this.isReady = true;
    this.sendToClient({ type: 'ready' });
    this.readyCallback?.();
  }

  private async handleClientMessage(msg: any): Promise<void> {
    const cdp = this.opts.cdpSession as any;
    switch (msg.type) {
      case 'done':
        this.completeCallback?.({ status: 'completed' });
        break;
      case 'cancel':
        this.completeCallback?.({ status: 'aborted', reason: 'operator cancelled' });
        break;
      case 'mousedown':
      case 'mouseup': {
        const { x, y } = this.denormalize(msg.x, msg.y);
        const buttonMap: Record<number, string> = { 0: 'left', 1: 'middle', 2: 'right' };
        await cdp.send('Input.dispatchMouseEvent', {
          type: msg.type === 'mousedown' ? 'mousePressed' : 'mouseReleased',
          x, y,
          button: buttonMap[msg.button as number] ?? 'left',
          clickCount: 1,
          modifiers: msg.modifiers ?? 0,
        });
        break;
      }
      case 'mousemove': {
        const { x, y } = this.denormalize(msg.x, msg.y);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x, y,
          button: 'none',
          modifiers: msg.modifiers ?? 0,
        });
        break;
      }
      case 'wheel': {
        const { x, y } = this.denormalize(msg.x, msg.y);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x, y,
          deltaX: msg.deltaX ?? 0,
          deltaY: msg.deltaY ?? 0,
        });
        break;
      }
      case 'keydown':
      case 'keyup':
        await cdp.send('Input.dispatchKeyEvent', {
          type: msg.type === 'keydown' ? 'keyDown' : 'keyUp',
          key: msg.key,
          code: msg.code,
          modifiers: msg.modifiers ?? 0,
        });
        break;
      case 'ping':
        this.sendToClient({ type: 'pong' });
        break;
    }
  }

  private denormalize(normX: number, normY: number): { x: number; y: number } {
    return {
      x: Math.round(normX * this.viewportWidth),
      y: Math.round(normY * this.viewportHeight),
    };
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }
}
