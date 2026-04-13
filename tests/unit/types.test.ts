import { describe, it, expect } from 'vitest';
import { ToolErrorCode } from '../../src/types.js';
import type { ToolResult, StealthConfig, FingerprintProfile } from '../../src/types.js';

describe('ToolErrorCode', () => {
  it('has all expected error codes', () => {
    expect(ToolErrorCode.ELEMENT_NOT_FOUND).toBe('ELEMENT_NOT_FOUND');
    expect(ToolErrorCode.NAVIGATION_FAILED).toBe('NAVIGATION_FAILED');
    expect(ToolErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(ToolErrorCode.SESSION_CLOSED).toBe('SESSION_CLOSED');
    expect(ToolErrorCode.STEALTH_DETECTION).toBe('STEALTH_DETECTION');
    expect(ToolErrorCode.CDP_ERROR).toBe('CDP_ERROR');
  });
});

describe('ToolResult type', () => {
  it('accepts a success result', () => {
    const result: ToolResult<{ title: string }> = {
      success: true,
      data: { title: 'Hello' },
      metadata: { url: 'https://example.com', timestamp: Date.now() },
    };
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Hello');
  });

  it('accepts an error result', () => {
    const result: ToolResult = {
      success: false,
      error: 'Element not found',
      errorCode: ToolErrorCode.ELEMENT_NOT_FOUND,
    };
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ToolErrorCode.ELEMENT_NOT_FOUND);
  });
});