import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NetworkTracer } from '../../../src/core/network-tracer.js';
import type { HarLog } from '../../../src/core/network-tracer.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('NetworkTracer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'net-trace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('creates a tracer with zero entries', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      expect(tracer.getEntryCount()).toBe(0);
    });
  });

  describe('handleRequest', () => {
    it('tracks a new request by requestId', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({
        requestId: 'req-1',
        request: { url: 'https://example.com/api', method: 'GET', headers: { 'Accept': 'application/json' } },
        timestamp: 1000,
        wallTime: Date.now() / 1000,
      });
      expect(tracer.getEntryCount()).toBe(0);
    });
  });

  describe('handleResponse', () => {
    it('associates response with tracked request', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({
        requestId: 'req-1',
        request: { url: 'https://example.com/api', method: 'GET', headers: {} },
        timestamp: 1000,
        wallTime: Date.now() / 1000,
      });
      tracer.handleResponse({
        requestId: 'req-1',
        response: { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' }, mimeType: 'application/json' },
        timestamp: 1001,
      });
      expect(tracer.getEntryCount()).toBe(0);
    });
  });

  describe('handleLoadingFinished', () => {
    it('completes an entry and adds to HAR entries', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({
        requestId: 'req-1',
        request: { url: 'https://example.com/page', method: 'GET', headers: {} },
        timestamp: 1000, wallTime: Date.now() / 1000,
      });
      tracer.handleResponse({
        requestId: 'req-1',
        response: { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/html' }, mimeType: 'text/html' },
        timestamp: 1000.5,
      });
      tracer.handleLoadingFinished({ requestId: 'req-1', encodedDataLength: 5000, timestamp: 1001 });
      expect(tracer.getEntryCount()).toBe(1);
    });
  });

  describe('handleLoadingFailed', () => {
    it('creates an error entry for failed requests', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({
        requestId: 'req-fail',
        request: { url: 'https://example.com/missing', method: 'GET', headers: {} },
        timestamp: 1000, wallTime: Date.now() / 1000,
      });
      tracer.handleLoadingFailed({ requestId: 'req-fail', errorText: 'net::ERR_CONNECTION_REFUSED', timestamp: 1001 });
      expect(tracer.getEntryCount()).toBe(1);
    });
  });

  describe('save', () => {
    it('writes a valid HAR file to the traces directory', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({
        requestId: 'req-1',
        request: { url: 'https://example.com/', method: 'GET', headers: { 'User-Agent': 'test' } },
        timestamp: 1000, wallTime: 1713100000,
      });
      tracer.handleResponse({
        requestId: 'req-1',
        response: { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/html' }, mimeType: 'text/html' },
        timestamp: 1000.2,
      });
      tracer.handleLoadingFinished({ requestId: 'req-1', encodedDataLength: 1234, timestamp: 1000.5 });

      tracer.save(tmpDir);

      const harPath = path.join(tmpDir, 'network.har');
      expect(fs.existsSync(harPath)).toBe(true);

      const har = JSON.parse(fs.readFileSync(harPath, 'utf-8')) as HarLog;
      expect(har.log.version).toBe('1.2');
      expect(har.log.creator.name).toBe('cdp-custodial-access');
      expect(har.log.entries).toHaveLength(1);

      const entry = har.log.entries[0];
      expect(entry.request.method).toBe('GET');
      expect(entry.request.url).toBe('https://example.com/');
      expect(entry.response.status).toBe(200);
      expect(entry.response.content.mimeType).toBe('text/html');
    });

    it('omits response body text in headers-only mode', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.handleRequest({ requestId: 'req-1', request: { url: 'https://example.com/', method: 'GET', headers: {} }, timestamp: 1000, wallTime: 1713100000 });
      tracer.handleResponse({ requestId: 'req-1', response: { status: 200, statusText: 'OK', headers: {}, mimeType: 'text/html' }, timestamp: 1000.2 });
      tracer.handleLoadingFinished({ requestId: 'req-1', encodedDataLength: 500, timestamp: 1000.5 });

      tracer.save(tmpDir);
      const har = JSON.parse(fs.readFileSync(path.join(tmpDir, 'network.har'), 'utf-8')) as HarLog;
      expect(har.log.entries[0].response.content.text).toBeUndefined();
    });

    it('does not write file when no entries exist', () => {
      const tracer = new NetworkTracer({ includeBodies: false });
      tracer.save(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'network.har'))).toBe(false);
    });
  });

  describe('setResponseBody', () => {
    it('stores response body text for full mode entries', () => {
      const tracer = new NetworkTracer({ includeBodies: true });
      tracer.handleRequest({ requestId: 'req-1', request: { url: 'https://example.com/', method: 'GET', headers: {} }, timestamp: 1000, wallTime: 1713100000 });
      tracer.handleResponse({ requestId: 'req-1', response: { status: 200, statusText: 'OK', headers: {}, mimeType: 'application/json' }, timestamp: 1000.2 });
      tracer.handleLoadingFinished({ requestId: 'req-1', encodedDataLength: 100, timestamp: 1000.5 });
      tracer.setResponseBody('req-1', '{"hello":"world"}', false);

      tracer.save(tmpDir);
      const har = JSON.parse(fs.readFileSync(path.join(tmpDir, 'network.har'), 'utf-8')) as HarLog;
      expect(har.log.entries[0].response.content.text).toBe('{"hello":"world"}');
    });

    it('marks base64-encoded binary content', () => {
      const tracer = new NetworkTracer({ includeBodies: true });
      tracer.handleRequest({ requestId: 'req-img', request: { url: 'https://example.com/img.png', method: 'GET', headers: {} }, timestamp: 1000, wallTime: 1713100000 });
      tracer.handleResponse({ requestId: 'req-img', response: { status: 200, statusText: 'OK', headers: {}, mimeType: 'image/png' }, timestamp: 1000.1 });
      tracer.handleLoadingFinished({ requestId: 'req-img', encodedDataLength: 2000, timestamp: 1000.3 });
      tracer.setResponseBody('req-img', 'iVBORw0KGgo=', true);

      tracer.save(tmpDir);
      const har = JSON.parse(fs.readFileSync(path.join(tmpDir, 'network.har'), 'utf-8')) as HarLog;
      const content = har.log.entries[0].response.content;
      expect(content.text).toBe('iVBORw0KGgo=');
      expect(content.encoding).toBe('base64');
    });
  });
});
