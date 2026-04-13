export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const SESSION_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'launch_session',
    description: 'Launch a new browser session with optional profile, headless mode, and proxy config',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', description: 'Profile name for persistent sessions' },
        headless: { type: 'boolean', description: 'Run in headless mode (default: true)' },
        proxy: { type: 'object', description: 'Proxy configuration', properties: { server: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' } }, required: ['server'] },
      },
    },
  },
  {
    name: 'connect_session',
    description: 'Connect to an existing Chrome browser via WebSocket endpoint',
    inputSchema: { type: 'object', properties: { wsEndpoint: { type: 'string', description: 'WebSocket debugger URL' } }, required: ['wsEndpoint'] },
  },
  {
    name: 'list_sessions',
    description: 'List all active browser sessions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'close_session',
    description: 'Close a browser session, optionally persisting its state',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, persist: { type: 'boolean' } } },
  },
];
