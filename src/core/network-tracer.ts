import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page, CDPSession } from 'puppeteer';

// ─── HAR Types ──────────────────────────────────────────────────────

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarQueryParam {
  name: string;
  value: string;
}

export interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HarHeader[];
  queryString: HarQueryParam[];
  headersSize: number;
  bodySize: number;
}

export interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HarHeader[];
  content: HarContent;
  headersSize: number;
  bodySize: number;
  _error?: string;
}

export interface HarTimings {
  send: number;
  wait: number;
  receive: number;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  timings: HarTimings;
}

export interface HarLog {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

// ─── CDP Event Types ────────────────────────────────────────────────

export interface CdpRequestEvent {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  };
  timestamp: number;
  wallTime: number;
}

export interface CdpResponseEvent {
  requestId: string;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
  };
  timestamp: number;
}

export interface CdpLoadingFinishedEvent {
  requestId: string;
  encodedDataLength: number;
  timestamp: number;
}

export interface CdpLoadingFailedEvent {
  requestId: string;
  errorText: string;
  timestamp: number;
}

// ─── Pending Request ────────────────────────────────────────────────

interface PendingRequest {
  requestId: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  postData?: string;
  startTimestamp: number;
  wallTime: number;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseMimeType?: string;
  responseTimestamp?: number;
}

// ─── NetworkTracer ──────────────────────────────────────────────────

export class NetworkTracer {
  private readonly includeBodies: boolean;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly completed: HarEntry[] = [];
  private readonly completedRequestIds: string[] = [];
  private readonly bodyMap = new Map<string, { body: string; base64Encoded: boolean }>();
  private readonly cdpSessions = new Map<Page, CDPSession>();
  private readonly attachedPages = new WeakSet<Page>();

  constructor(options: { includeBodies: boolean }) {
    this.includeBodies = options.includeBodies;
  }

  async attachToPage(page: Page): Promise<void> {
    if (this.attachedPages.has(page)) return;
    this.attachedPages.add(page);

    const client = await page.createCDPSession();
    this.cdpSessions.set(page, client);

    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', (event: any) => {
      this.handleRequest(event as CdpRequestEvent);
    });

    client.on('Network.responseReceived', (event: any) => {
      this.handleResponse(event as CdpResponseEvent);
    });

    client.on('Network.loadingFinished', async (event: any) => {
      this.handleLoadingFinished(event as CdpLoadingFinishedEvent);

      if (this.includeBodies) {
        try {
          const { body, base64Encoded } = await client.send('Network.getResponseBody', {
            requestId: event.requestId,
          }) as { body: string; base64Encoded: boolean };
          this.setResponseBody(event.requestId, body, base64Encoded);
        } catch {
          // Some responses have no body (204, redirects, etc.)
        }
      }
    });

    client.on('Network.loadingFailed', (event: any) => {
      this.handleLoadingFailed(event as CdpLoadingFailedEvent);
    });
  }

  async detachFromPage(page: Page): Promise<void> {
    const client = this.cdpSessions.get(page);
    if (client) {
      try {
        await client.detach();
      } catch {
        // Page may already be closed
      }
      this.cdpSessions.delete(page);
    }
  }

  handleRequest(event: CdpRequestEvent): void {
    this.pending.set(event.requestId, {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      requestHeaders: event.request.headers,
      postData: event.request.postData,
      startTimestamp: event.timestamp,
      wallTime: event.wallTime,
    });
  }

  handleResponse(event: CdpResponseEvent): void {
    const req = this.pending.get(event.requestId);
    if (!req) return;
    req.responseStatus = event.response.status;
    req.responseStatusText = event.response.statusText;
    req.responseHeaders = event.response.headers;
    req.responseMimeType = event.response.mimeType;
    req.responseTimestamp = event.timestamp;
  }

  handleLoadingFinished(event: CdpLoadingFinishedEvent): void {
    const req = this.pending.get(event.requestId);
    if (!req) return;
    this.pending.delete(event.requestId);
    this.completed.push(this.buildEntry(req, event.encodedDataLength, event.timestamp));
    this.completedRequestIds.push(event.requestId);
  }

  handleLoadingFailed(event: CdpLoadingFailedEvent): void {
    const req = this.pending.get(event.requestId);
    if (!req) return;
    this.pending.delete(event.requestId);
    const entry = this.buildEntry(req, 0, event.timestamp);
    entry.response.status = 0;
    entry.response.statusText = '';
    entry.response._error = event.errorText;
    this.completed.push(entry);
    this.completedRequestIds.push(event.requestId);
  }

  setResponseBody(requestId: string, body: string, base64Encoded: boolean): void {
    this.bodyMap.set(requestId, { body, base64Encoded });
  }

  getEntryCount(): number {
    return this.completed.length;
  }

  save(tracesDir: string): void {
    if (this.completed.length === 0) return;

    // Apply stored bodies to completed entries before writing
    if (this.includeBodies) {
      for (let i = 0; i < this.completed.length; i++) {
        const requestId = this.completedRequestIds[i];
        const storedBody = this.bodyMap.get(requestId);
        if (storedBody) {
          this.completed[i].response.content.text = storedBody.body;
          if (storedBody.base64Encoded) {
            this.completed[i].response.content.encoding = 'base64';
          }
        }
      }
    }

    const har: HarLog = {
      log: {
        version: '1.2',
        creator: { name: 'cdp-custodial-access', version: '0.1.0' },
        entries: this.completed,
      },
    };

    fs.writeFileSync(
      path.join(tracesDir, 'network.har'),
      JSON.stringify(har, null, 2),
      'utf-8',
    );
  }

  private buildEntry(req: PendingRequest, encodedDataLength: number, endTimestamp: number): HarEntry {
    const totalTimeMs = (endTimestamp - req.startTimestamp) * 1000;
    const waitTimeMs = req.responseTimestamp ? (req.responseTimestamp - req.startTimestamp) * 1000 : totalTimeMs;
    const receiveTimeMs = req.responseTimestamp ? (endTimestamp - req.responseTimestamp) * 1000 : 0;

    const parsedUrl = safeParseUrl(req.url);

    const content: HarContent = {
      size: encodedDataLength,
      mimeType: req.responseMimeType ?? 'application/octet-stream',
    };

    return {
      startedDateTime: new Date(req.wallTime * 1000).toISOString(),
      time: Math.round(totalTimeMs),
      request: {
        method: req.method,
        url: req.url,
        httpVersion: 'HTTP/2.0',
        headers: headersToHar(req.requestHeaders),
        queryString: parsedUrl?.searchParams
          ? Array.from(parsedUrl.searchParams.entries()).map(([name, value]) => ({ name, value }))
          : [],
        headersSize: -1,
        bodySize: req.postData ? req.postData.length : 0,
      },
      response: {
        status: req.responseStatus ?? 0,
        statusText: req.responseStatusText ?? '',
        httpVersion: 'HTTP/2.0',
        headers: headersToHar(req.responseHeaders ?? {}),
        content,
        headersSize: -1,
        bodySize: encodedDataLength,
      },
      timings: {
        send: 0,
        wait: Math.round(waitTimeMs),
        receive: Math.round(receiveTimeMs),
      },
    };
  }
}

function headersToHar(headers: Record<string, string>): HarHeader[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function safeParseUrl(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}
