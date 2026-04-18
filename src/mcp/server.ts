import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserController } from '../sdk/index.js';
import type { EnrichedSession } from '../sdk/index.js';
import type { MCPToolDefinition } from './session-tools.js';
import { SESSION_TOOL_DEFINITIONS } from './session-tools.js';

// Re-export MCPToolDefinition for consumers
export type { MCPToolDefinition };

// ------- Tool definitions (plain schema metadata for external use) -------

const NAVIGATION_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL in the active browser session',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'When to consider navigation complete' },
        timeout: { type: 'number', description: 'Navigation timeout in milliseconds' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search',
    description: 'Search the web using a search engine',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        engine: { type: 'string', enum: ['duckduckgo', 'google', 'bing'], description: 'Search engine to use (default: duckduckgo)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'go_back',
    description: 'Navigate back in browser history',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'wait',
    description: 'Wait for a specified number of milliseconds',
    inputSchema: {
      type: 'object',
      properties: { ms: { type: 'number', description: 'Milliseconds to wait' } },
      required: ['ms'],
    },
  },
];

const INTERACTION_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'click',
    description: 'Click on an element identified by a CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to click' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'input',
    description: 'Type text into an element identified by a CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input element' },
        text: { type: 'string', description: 'Text to type' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page in a given direction',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction to scroll' },
        amount: { type: 'number', description: 'Amount to scroll in pixels (default: 300)' },
        selector: { type: 'string', description: 'CSS selector of element to scroll (default: window)' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'send_keys',
    description: 'Send keyboard key presses (e.g. Enter, Tab, Escape)',
    inputSchema: {
      type: 'object',
      properties: { keys: { type: 'string', description: 'Key name to press (e.g. Enter, Tab)' } },
      required: ['keys'],
    },
  },
  {
    name: 'find_text',
    description: 'Find text on the page and optionally scroll to it',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to find on the page' },
        scrollTo: { type: 'boolean', description: 'Whether to scroll to the found text (default: true)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file to a file input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the file input element' },
        filePath: { type: 'string', description: 'Absolute path to the file to upload' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['selector', 'filePath'],
    },
  },
];

const FORMS_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'get_dropdown_options',
    description: 'Get all options from a dropdown/select element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the select element' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'select_dropdown',
    description: 'Select an option in a dropdown/select element by value',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the select element' },
        value: { type: 'string', description: 'Value of the option to select' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['selector', 'value'],
    },
  },
];

const EXTRACTION_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'extract',
    description: 'Extract text or elements from the page using an optional CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to extract specific elements (omit for full page text)' },
      },
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Whether to capture the full page (default: false)' },
      },
    },
  },
  {
    name: 'get_page_content',
    description: 'Get the visible text content of the current page',
    inputSchema: { type: 'object', properties: {} },
  },
];

const TABS_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'switch_tab',
    description: 'Switch to a browser tab by index',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: 'Zero-based tab index' } },
      required: ['index'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a browser tab by index (default: last tab)',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: 'Zero-based tab index (default: last tab)' } },
    },
  },
  {
    name: 'list_tabs',
    description: 'List all open browser tabs',
    inputSchema: { type: 'object', properties: {} },
  },
];

const FILES_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'write_file',
    description: 'Write content to a file on disk',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path to write to' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read content from a file on disk',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute file path to read' } },
      required: ['path'],
    },
  },
];

const DONE_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'done',
    description: 'Signal that the task is complete with a result message',
    inputSchema: {
      type: 'object',
      properties: { result: { type: 'string', description: 'The result or summary of the completed task' } },
      required: ['result'],
    },
  },
];

export const TOOL_DEFINITIONS: MCPToolDefinition[] = [
  ...NAVIGATION_TOOL_DEFINITIONS,
  ...INTERACTION_TOOL_DEFINITIONS,
  ...FORMS_TOOL_DEFINITIONS,
  ...EXTRACTION_TOOL_DEFINITIONS,
  ...TABS_TOOL_DEFINITIONS,
  ...FILES_TOOL_DEFINITIONS,
  ...DONE_TOOL_DEFINITIONS,
  ...SESSION_TOOL_DEFINITIONS,
];

// ------- MCP response helpers -------

type ContentItem = { type: 'text'; text: string };

function toContent(data: unknown): ContentItem[] {
  return [{ type: 'text', text: JSON.stringify(data, null, 2) }];
}

function errorContent(message: string): { content: ContentItem[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// ------- createMCPServer -------

export function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'cdp-custodial-access',
    version: '0.1.0',
  });

  const controller = new BrowserController();
  let activeSessionId: string | undefined;

  function getActiveSession(): EnrichedSession {
    if (!activeSessionId) {
      throw new Error('No active session. Use launch_session or connect_session first.');
    }
    const session = controller.getSession(activeSessionId);
    if (!session) {
      throw new Error(`Session ${activeSessionId} not found. It may have been closed.`);
    }
    return session;
  }

  // ---- Session tools ----

  server.registerTool(
    'launch_session',
    {
      description: 'Launch a new browser session with optional profile, headless mode, and proxy config',
      inputSchema: {
        profile: z.string().optional().describe('Profile name for persistent sessions'),
        headless: z.boolean().optional().describe('Run in headless mode (default: true)'),
        proxy: z.object({
          server: z.string(),
          username: z.string().optional(),
          password: z.string().optional(),
        }).optional().describe('Proxy configuration'),
      },
    },
    async (params) => {
      try {
        const session = await controller.launch({
          profile: params.profile,
          headless: params.headless ?? true,
          proxy: params.proxy,
        });
        activeSessionId = session.id;
        return { content: toContent({ sessionId: session.id }) };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'connect_session',
    {
      description: 'Connect to an existing Chrome browser via WebSocket endpoint',
      inputSchema: {
        wsEndpoint: z.string().describe('WebSocket debugger URL'),
      },
    },
    async (params) => {
      try {
        const session = await controller.connect({ wsEndpoint: params.wsEndpoint });
        activeSessionId = session.id;
        return { content: toContent({ sessionId: session.id }) };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'list_sessions',
    {
      description: 'List all active browser sessions',
      inputSchema: {},
    },
    async () => {
      const sessions = controller.getSessions().map((s) => ({
        sessionId: s.id,
        active: s.id === activeSessionId,
      }));
      return { content: toContent({ sessions }) };
    },
  );

  server.registerTool(
    'close_session',
    {
      description: 'Close a browser session, optionally persisting its state',
      inputSchema: {
        sessionId: z.string().optional().describe('Session ID to close (default: active session)'),
        persist: z.boolean().optional().describe('Whether to persist the session profile'),
      },
    },
    async (params) => {
      try {
        const sessionId = params.sessionId ?? activeSessionId;
        if (!sessionId) {
          return errorContent('No session to close.');
        }
        await controller.closeSession(sessionId, { persist: params.persist });
        if (activeSessionId === sessionId) {
          const remaining = controller.getSessions();
          activeSessionId = remaining.length > 0 ? remaining[remaining.length - 1].id : undefined;
        }
        return { content: toContent({ closed: sessionId }) };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Navigation tools ----

  server.registerTool(
    'navigate',
    {
      description: 'Navigate to a URL in the active browser session',
      inputSchema: {
        url: z.string().describe('The URL to navigate to'),
        waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional(),
        timeout: z.number().optional().describe('Navigation timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.navigate(params);
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Navigation failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'search',
    {
      description: 'Search the web using a search engine',
      inputSchema: {
        query: z.string().describe('Search query'),
        engine: z.enum(['duckduckgo', 'google', 'bing']).optional().describe('Search engine (default: duckduckgo)'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.search(params);
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Search failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'go_back',
    {
      description: 'Navigate back in browser history',
      inputSchema: {},
    },
    async () => {
      try {
        const session = getActiveSession();
        const result = await session.goBack();
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Go back failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'wait',
    {
      description: 'Wait for a specified number of milliseconds',
      inputSchema: {
        ms: z.number().describe('Milliseconds to wait'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        await session.wait({ ms: params.ms });
        return { content: toContent({ waited: params.ms }) };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Interaction tools ----

  server.registerTool(
    'click',
    {
      description: 'Click on an element identified by a CSS selector',
      inputSchema: {
        selector: z.string().describe('CSS selector for the element to click'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.click(params);
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Click failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'input',
    {
      description: 'Type text into an element identified by a CSS selector',
      inputSchema: {
        selector: z.string().describe('CSS selector for the input element'),
        text: z.string().describe('Text to type'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.input(params);
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Input failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'scroll',
    {
      description: 'Scroll the page in a given direction',
      inputSchema: {
        direction: z.enum(['up', 'down', 'left', 'right']).describe('Direction to scroll'),
        amount: z.number().optional().describe('Amount to scroll in pixels (default: 300)'),
        selector: z.string().optional().describe('CSS selector of element to scroll'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.scroll(params);
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Scroll failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'send_keys',
    {
      description: 'Send keyboard key presses (e.g. Enter, Tab, Escape)',
      inputSchema: {
        keys: z.string().describe('Key name to press (e.g. Enter, Tab)'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.sendKeys({ keys: params.keys });
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Send keys failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'find_text',
    {
      description: 'Find text on the page and optionally scroll to it',
      inputSchema: {
        text: z.string().describe('Text to find on the page'),
        scrollTo: z.boolean().optional().describe('Whether to scroll to the found text (default: true)'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.findText(params);
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Text not found');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'upload_file',
    {
      description: 'Upload a file to a file input element',
      inputSchema: {
        selector: z.string().describe('CSS selector for the file input element'),
        filePath: z.string().describe('Absolute path to the file to upload'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.uploadFile(params);
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Upload failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Forms tools ----

  server.registerTool(
    'get_dropdown_options',
    {
      description: 'Get all options from a dropdown/select element',
      inputSchema: {
        selector: z.string().describe('CSS selector for the select element'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.getDropdownOptions(params);
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Get dropdown options failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'select_dropdown',
    {
      description: 'Select an option in a dropdown/select element by value',
      inputSchema: {
        selector: z.string().describe('CSS selector for the select element'),
        value: z.string().describe('Value of the option to select'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.selectDropdown(params);
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Select dropdown failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Extraction tools ----

  server.registerTool(
    'extract',
    {
      description: 'Extract text or elements from the page using an optional CSS selector',
      inputSchema: {
        selector: z.string().optional().describe('CSS selector to extract specific elements'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.extract({ selector: params.selector });
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Extract failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'screenshot',
    {
      description: 'Take a screenshot of the current page',
      inputSchema: {
        fullPage: z.boolean().optional().describe('Whether to capture the full page (default: false)'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.screenshot({ fullPage: params.fullPage });
        if (!result.success) {
          return errorContent(result.error ?? 'Screenshot failed');
        }
        return {
          content: [{ type: 'image' as const, data: result.data!.base64, mimeType: 'image/png' }],
        };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'get_page_content',
    {
      description: 'Get the visible text content of the current page',
      inputSchema: {},
    },
    async () => {
      try {
        const session = getActiveSession();
        const result = await session.getPageContent();
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Get page content failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Tabs tools ----

  server.registerTool(
    'switch_tab',
    {
      description: 'Switch to a browser tab by index',
      inputSchema: {
        index: z.number().describe('Zero-based tab index'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.switchTab({ index: params.index });
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Switch tab failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'close_tab',
    {
      description: 'Close a browser tab by index (default: last tab)',
      inputSchema: {
        index: z.number().optional().describe('Zero-based tab index (default: last tab)'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const result = await session.closeTab({ index: params.index });
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Close tab failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'list_tabs',
    {
      description: 'List all open browser tabs',
      inputSchema: {},
    },
    async () => {
      try {
        const session = getActiveSession();
        const result = await session.listTabs();
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'List tabs failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Files tools ----

  server.registerTool(
    'write_file',
    {
      description: 'Write content to a file on disk',
      inputSchema: {
        path: z.string().describe('Absolute file path to write to'),
        content: z.string().describe('Content to write'),
      },
    },
    async (params) => {
      try {
        const { writeFileTool } = await import('../tools/files.js');
        const result = await writeFileTool({ path: params.path, content: params.content });
        return result.success
          ? { content: toContent({ success: true }) }
          : errorContent(result.error ?? 'Write file failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'read_file',
    {
      description: 'Read content from a file on disk',
      inputSchema: {
        path: z.string().describe('Absolute file path to read'),
      },
    },
    async (params) => {
      try {
        const { readFileTool } = await import('../tools/files.js');
        const result = await readFileTool({ path: params.path });
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Read file failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // ---- Done tool ----

  server.registerTool(
    'done',
    {
      description: 'Signal that the task is complete with a result message',
      inputSchema: {
        result: z.string().describe('The result or summary of the completed task'),
      },
    },
    async (params) => {
      try {
        const { done } = await import('../tools/done.js');
        const result = await done({ result: params.result });
        return result.success
          ? { content: toContent(result.data) }
          : errorContent(result.error ?? 'Done failed');
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'request_human_intervention',
    {
      description:
        'Pause the workflow and stream the live browser to a public URL so a human operator can complete a step (captcha, device verification, etc.). Blocks until the operator clicks Done or the timeout expires.',
      inputSchema: {
        reason: z.string().describe('Human-readable explanation of what the operator needs to do.'),
        timeoutMs: z.number().optional().describe('Max wait time in ms (default 900000 = 15 min). Pass 0 to wait forever.'),
        tunnelType: z.enum(['ngrok', 'custom']).optional().describe('Tunnel adapter (default: ngrok). Requires NGROK_AUTHTOKEN env var.'),
        notifierType: z.enum(['slack', 'webhook']).optional().describe('Channel to send the operator link.'),
        notifierWebhook: z.string().optional().describe('Slack webhook URL or generic webhook URL.'),
        streamQuality: z.enum(['low', 'medium', 'high']).optional().describe('Streaming quality preset (default: medium).'),
        allowNavigation: z.boolean().optional().describe('Allow operator to navigate cross-origin (default: false).'),
      },
    },
    async (params) => {
      try {
        const session = getActiveSession();
        const tunnelConfig = params.tunnelType === 'custom'
          ? undefined
          : { type: (params.tunnelType ?? 'ngrok') as 'ngrok' };
        const notifierConfig = params.notifierType && params.notifierWebhook
          ? { type: params.notifierType as 'slack' | 'webhook', webhook: params.notifierWebhook, url: params.notifierWebhook }
          : undefined;

        const result = await session.requestHumanIntervention({
          reason: params.reason,
          timeoutMs: params.timeoutMs,
          tunnel: tunnelConfig,
          notifier: notifierConfig ?? null,
          streamQuality: params.streamQuality as 'low' | 'medium' | 'high' | undefined,
          allowNavigation: params.allowNavigation,
        });

        if (!result.success) {
          return errorContent(result.error ?? 'Intervention setup failed');
        }

        const handle = result.data!;
        const completion = await handle.waitForCompletion();
        return { content: toContent({ interventionId: handle.interventionId, url: handle.url, ...completion }) };
      } catch (error) {
        return errorContent(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
