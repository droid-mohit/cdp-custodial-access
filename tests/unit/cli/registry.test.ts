import { describe, it, expect } from 'vitest';
import { loadRegistry, parseAndValidateParams, resolveWorkflowPath } from '../../../src/cli/registry.js';
import type { WorkflowEntry, ParamDef } from '../../../src/cli/registry.js';

describe('loadRegistry', () => {
  it('returns a Registry object with workflows', () => {
    const reg = loadRegistry();
    expect(reg).toHaveProperty('workflows');
    expect(typeof reg.workflows).toBe('object');
  });

  it('contains the archive-site workflow', () => {
    const reg = loadRegistry();
    expect(reg.workflows['archive-site']).toBeDefined();
    expect(reg.workflows['archive-site'].type).toBe('SIMPLE');
    expect(reg.workflows['archive-site'].file).toBe('simple/archive-site.ts');
  });
});

describe('resolveWorkflowPath', () => {
  it('returns an absolute path to the workflow file', () => {
    const entry: WorkflowEntry = {
      description: 'test',
      file: 'simple/example.ts',
      type: 'SIMPLE',
      params: {},
    };
    const resolved = resolveWorkflowPath(entry);
    expect(resolved).toContain('workflows');
    expect(resolved).toContain('simple/example.ts');
    expect(resolved.startsWith('/')).toBe(true);
  });
});

describe('parseAndValidateParams', () => {
  const params: Record<string, ParamDef> = {
    url: { type: 'string', required: true, hint: 'The URL' },
    'max-pages': { type: 'number', required: false, hint: 'Max pages' },
    verbose: { type: 'boolean', required: false, hint: 'Verbose output' },
  };

  it('parses string params from argv', () => {
    const result = parseAndValidateParams(params, ['--url', 'https://example.com']);
    expect(result.url).toBe('https://example.com');
  });

  it('parses number params from argv', () => {
    const result = parseAndValidateParams(params, ['--url', 'https://example.com', '--max-pages', '20']);
    expect(result['max-pages']).toBe(20);
  });

  it('parses boolean params from argv', () => {
    const result = parseAndValidateParams(params, ['--url', 'https://example.com', '--verbose']);
    expect(result.verbose).toBe(true);
  });

  it('throws on missing required param', () => {
    expect(() => parseAndValidateParams(params, [])).toThrow(/required/i);
  });

  it('throws on invalid number param', () => {
    expect(() => parseAndValidateParams(params, ['--url', 'https://example.com', '--max-pages', 'abc'])).toThrow();
  });

  it('ignores unknown flags like --headed', () => {
    const result = parseAndValidateParams(params, ['--url', 'https://example.com', '--headed']);
    expect(result.url).toBe('https://example.com');
    expect(result).not.toHaveProperty('headed');
  });
});
