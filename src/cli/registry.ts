import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ParamDef {
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  hint: string;
}

export interface WorkflowEntry {
  description: string;
  file: string;
  type: string;
  params: Record<string, ParamDef>;
}

export interface Registry {
  workflows: Record<string, WorkflowEntry>;
}

export function loadRegistry(): Registry {
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
  const registryPath = path.join(projectRoot, 'workflows', 'registry.json');

  if (!fs.existsSync(registryPath)) {
    throw new Error(`Workflow registry not found: ${registryPath}`);
  }

  const raw = fs.readFileSync(registryPath, 'utf-8');
  return JSON.parse(raw) as Registry;
}

export function resolveWorkflowPath(entry: WorkflowEntry): string {
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
  return path.join(projectRoot, 'workflows', entry.file);
}

export function parseAndValidateParams(
  params: Record<string, ParamDef>,
  argv: string[],
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  const paramNames = Object.keys(params);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    if (!paramNames.includes(key)) continue;

    const def = params[key];
    if (def.type === 'boolean') {
      result[key] = true;
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Parameter --${key} requires a value (${def.type}): ${def.hint}`);
    }
    i++; // skip value

    if (def.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Parameter --${key} must be a number, got: "${value}"`);
      }
      result[key] = num;
    } else {
      result[key] = value;
    }
  }

  // Check required params
  for (const [name, def] of Object.entries(params)) {
    if (def.required && !(name in result)) {
      throw new Error(`Required parameter --${name} is missing. ${def.hint}`);
    }
  }

  return result;
}
