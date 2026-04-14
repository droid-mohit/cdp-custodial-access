import { describe, it, expect } from 'vitest';
import { listWorkflows, infoWorkflow, buildRunArgs } from '../../../src/cli/commands.js';
import type { Registry } from '../../../src/cli/registry.js';

const testRegistry: Registry = {
  workflows: {
    'archive-site': {
      description: 'Crawl a website 1 level deep and merge all pages into a single PDF',
      file: 'simple/archive-site.ts',
      type: 'SIMPLE',
      params: {
        url: { type: 'string', required: true, hint: 'The URL to start crawling from' },
        'max-pages': { type: 'number', required: false, hint: 'Maximum pages (default: 50)' },
      },
    },
    'example': {
      description: 'Go to ChatGPT and ask about trending AI topics',
      file: 'simple/example.ts',
      type: 'SIMPLE',
      params: {},
    },
  },
};

describe('listWorkflows', () => {
  it('returns formatted table with all workflows', () => {
    const output = listWorkflows(testRegistry);
    expect(output).toContain('archive-site');
    expect(output).toContain('example');
    expect(output).toContain('SIMPLE');
    expect(output).toContain('NAME');
  });
});

describe('infoWorkflow', () => {
  it('returns detailed info for a workflow with params', () => {
    const output = infoWorkflow(testRegistry, 'archive-site');
    expect(output).toContain('archive-site');
    expect(output).toContain('SIMPLE');
    expect(output).toContain('--url');
    expect(output).toContain('required');
    expect(output).toContain('--max-pages');
    expect(output).toContain('optional');
    expect(output).toContain('--headed');
  });

  it('returns info for a workflow with no params', () => {
    const output = infoWorkflow(testRegistry, 'example');
    expect(output).toContain('example');
    expect(output).not.toContain('--url');
    expect(output).toContain('--headed');
  });

  it('throws for unknown workflow', () => {
    expect(() => infoWorkflow(testRegistry, 'nonexistent')).toThrow(/not found/i);
  });
});

describe('buildRunArgs', () => {
  it('builds tsx command args with params', () => {
    const args = buildRunArgs('/path/to/workflow.ts', { url: 'https://example.com', 'max-pages': 20 }, false);
    expect(args).toContain('/path/to/workflow.ts');
    expect(args).toContain('--url');
    expect(args).toContain('https://example.com');
    expect(args).toContain('--max-pages');
    expect(args).toContain('20');
    expect(args).not.toContain('--headed');
  });

  it('includes --headed when headed is true', () => {
    const args = buildRunArgs('/path/to/workflow.ts', {}, true);
    expect(args).toContain('--headed');
  });

  it('does not include --headed when headed is false', () => {
    const args = buildRunArgs('/path/to/workflow.ts', {}, false);
    expect(args).not.toContain('--headed');
  });
});
