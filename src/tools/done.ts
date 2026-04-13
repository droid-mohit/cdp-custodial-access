import type { ToolResult } from '../types.js';

export interface DoneParams { result: string; }
export interface DoneResult { message: string; completedAt: string; }

export async function done(params: DoneParams): Promise<ToolResult<DoneResult>> {
  return { success: true, data: { message: params.result, completedAt: new Date().toISOString() } };
}
