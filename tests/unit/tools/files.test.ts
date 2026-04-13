import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileTool, readFileTool } from '../../../src/tools/files.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('file tools', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-file-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  describe('writeFileTool', () => {
    it('writes content to a file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const result = await writeFileTool({ path: filePath, content: 'hello world' });
      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });
  });

  describe('readFileTool', () => {
    it('reads content from a file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');
      const result = await readFileTool({ path: filePath });
      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('hello world');
    });

    it('returns error for non-existent file', async () => {
      const result = await readFileTool({ path: path.join(tmpDir, 'nope.txt') });
      expect(result.success).toBe(false);
    });
  });
});
