import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';

export interface WriteFileParams { path: string; content: string; }

export async function writeFileTool(params: WriteFileParams): Promise<ToolResult<void>> {
  try {
    const dir = path.dirname(params.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(params.path, params.content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}

export interface ReadFileParams { path: string; }
export interface ReadFileResult { content: string; }

export async function readFileTool(params: ReadFileParams): Promise<ToolResult<ReadFileResult>> {
  try {
    if (!fs.existsSync(params.path)) {
      return { success: false, error: `File not found: ${params.path}`, errorCode: ToolErrorCode.CDP_ERROR };
    }
    const content = fs.readFileSync(params.path, 'utf-8');
    return { success: true, data: { content } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: ToolErrorCode.CDP_ERROR };
  }
}
