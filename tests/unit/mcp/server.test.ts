import { describe, it, expect, vi } from 'vitest';

vi.mock('puppeteer-extra', () => {
  const mockPage = {
    evaluateOnNewDocument: vi.fn(), setUserAgent: vi.fn(), setViewport: vi.fn(),
    setExtraHTTPHeaders: vi.fn(),
    createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    url: vi.fn().mockReturnValue('about:blank'), title: vi.fn().mockResolvedValue('Test'),
    goto: vi.fn().mockResolvedValue(null), screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
    evaluate: vi.fn(), mouse: { move: vi.fn(), click: vi.fn() },
    keyboard: { type: vi.fn(), press: vi.fn(), down: vi.fn(), up: vi.fn() },
    waitForSelector: vi.fn().mockResolvedValue({
      boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 100, height: 30 }),
    }),
    bringToFront: vi.fn(), close: vi.fn(), content: vi.fn().mockResolvedValue('<html></html>'),
  };
  const mockBrowser = {
    pages: vi.fn().mockResolvedValue([mockPage]),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(), wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9222'),
    target: vi.fn().mockReturnValue({
      createCDPSession: vi.fn().mockResolvedValue({ send: vi.fn(), detach: vi.fn() }),
    }),
  };
  return { default: { use: vi.fn(), launch: vi.fn().mockResolvedValue(mockBrowser), connect: vi.fn().mockResolvedValue(mockBrowser) } };
});

vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn().mockReturnValue({}) }));

import { createMCPServer, TOOL_DEFINITIONS } from '../../../src/mcp/server.js';

describe('MCP Server', () => {
  it('createMCPServer returns a server instance', () => {
    const server = createMCPServer();
    expect(server).toBeTruthy();
  });

  it('TOOL_DEFINITIONS includes all expected tools', () => {
    const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
    // Navigation
    expect(toolNames).toContain('navigate');
    expect(toolNames).toContain('search');
    expect(toolNames).toContain('go_back');
    expect(toolNames).toContain('wait');
    // Interaction
    expect(toolNames).toContain('click');
    expect(toolNames).toContain('input');
    expect(toolNames).toContain('scroll');
    expect(toolNames).toContain('send_keys');
    expect(toolNames).toContain('find_text');
    expect(toolNames).toContain('upload_file');
    // Forms
    expect(toolNames).toContain('get_dropdown_options');
    expect(toolNames).toContain('select_dropdown');
    // Extraction
    expect(toolNames).toContain('extract');
    expect(toolNames).toContain('screenshot');
    expect(toolNames).toContain('get_page_content');
    // Tabs
    expect(toolNames).toContain('switch_tab');
    expect(toolNames).toContain('close_tab');
    expect(toolNames).toContain('list_tabs');
    // Files
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('read_file');
    // Done
    expect(toolNames).toContain('done');
    // Session management
    expect(toolNames).toContain('launch_session');
    expect(toolNames).toContain('connect_session');
    expect(toolNames).toContain('list_sessions');
    expect(toolNames).toContain('close_session');
  });

  it('each tool definition has name, description, and inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
