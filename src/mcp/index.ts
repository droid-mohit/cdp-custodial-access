#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMCPServer } from './server.js';

const server = createMCPServer();
const transport = new StdioServerTransport();
await server.connect(transport);
