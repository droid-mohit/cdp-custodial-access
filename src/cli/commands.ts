import type { Registry } from './registry.js';

export function listWorkflows(registry: Registry): string {
  const entries = Object.entries(registry.workflows);
  if (entries.length === 0) {
    return 'No workflows registered.';
  }

  const nameWidth = Math.max('NAME'.length, ...entries.map(([name]) => name.length));
  const typeWidth = Math.max('TYPE'.length, ...entries.map(([, e]) => e.type.length));

  const header = `${'NAME'.padEnd(nameWidth)}  ${'TYPE'.padEnd(typeWidth)}  DESCRIPTION`;
  const rows = entries.map(([name, entry]) =>
    `${name.padEnd(nameWidth)}  ${entry.type.padEnd(typeWidth)}  ${entry.description}`,
  );

  return [header, ...rows].join('\n');
}

export function infoWorkflow(registry: Registry, name: string): string {
  const entry = registry.workflows[name];
  if (!entry) {
    throw new Error(`Workflow "${name}" not found in registry. Run "cdp list" to see available workflows.`);
  }

  const lines: string[] = [
    `Workflow: ${name}`,
    `Type:     ${entry.type}`,
    `File:     workflows/${entry.file}`,
    `Description: ${entry.description}`,
  ];

  const paramEntries = Object.entries(entry.params);
  if (paramEntries.length > 0) {
    lines.push('', 'Parameters:');
    const keyWidth = Math.max(...paramEntries.map(([k]) => k.length + 2)); // +2 for --
    for (const [key, def] of paramEntries) {
      const flag = `--${key}`.padEnd(keyWidth + 2);
      const typeStr = def.type.padEnd(8);
      const reqStr = def.required ? '(required)' : '(optional)';
      lines.push(`  ${flag}${typeStr}${reqStr.padEnd(12)}${def.hint}`);
    }
  }

  lines.push('', 'Global flags:');
  lines.push('  --headed       Run in headed (visible browser) mode');

  return lines.join('\n');
}

export function buildRunArgs(
  workflowPath: string,
  params: Record<string, string | number | boolean>,
  headed: boolean,
): string[] {
  const args = [workflowPath];

  for (const [key, value] of Object.entries(params)) {
    args.push(`--${key}`);
    if (typeof value !== 'boolean') {
      args.push(String(value));
    }
  }

  if (headed) {
    args.push('--headed');
  }

  return args;
}
