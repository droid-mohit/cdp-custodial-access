#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { loadRegistry, parseAndValidateParams, resolveWorkflowPath } from './registry.js';
import { listWorkflows, infoWorkflow, buildRunArgs } from './commands.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`Usage:
  cdp run <workflow> [--param value...] [--headed]
  cdp list
  cdp info <workflow>

Run "cdp list" to see available workflows.`);
}

function main(): void {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const registry = loadRegistry();

  switch (command) {
    case 'list': {
      console.log(listWorkflows(registry));
      break;
    }

    case 'info': {
      const name = args[1];
      if (!name) {
        console.error('Usage: cdp info <workflow>');
        process.exit(1);
      }
      console.log(infoWorkflow(registry, name));
      break;
    }

    case 'run': {
      const name = args[1];
      if (!name) {
        console.error('Usage: cdp run <workflow> [--param value...] [--headed]');
        process.exit(1);
      }

      const entry = registry.workflows[name];
      if (!entry) {
        console.error(`Workflow "${name}" not found. Run "cdp list" to see available workflows.`);
        process.exit(1);
      }

      const workflowPath = resolveWorkflowPath(entry);
      const headed = args.includes('--headed');
      const workflowArgs = args.slice(2).filter((a) => a !== '--headed');
      const params = parseAndValidateParams(entry.params, workflowArgs);
      const runArgs = buildRunArgs(workflowPath, params, headed);

      const child = spawn('npx', ['tsx', ...runArgs], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      child.on('close', (code) => {
        process.exit(code ?? 0);
      });

      child.on('error', (err) => {
        console.error(`Failed to execute workflow: ${err.message}`);
        process.exit(1);
      });
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  }
}

main();
