# Accessibility Interfaces Design

**Date:** 2026-04-14
**Status:** Approved
**Goal:** Make CDP Custodial Access usable by non-technical personas (business users, AI-first users) without requiring TypeScript knowledge.

## Target Personas

1. **Business users / analysts** — know what they want from a website but can't code (e.g., "scrape competitor pricing daily")
2. **AI-first users** — interact through natural language (Claude Desktop, ChatGPT) and expect tasks to "just work" via conversation

## Approach

**CLI Shell + Registry** — a `cdp` CLI binary with `run`, `list`, `info` commands. Workflows are registered in a manifest (`registry.json`), organized by type in subdirectories. Two new skills handle authoring: `/create-workflow` (self-healing generation) and `/validate-workflow` (diagnostic execution).

## 1. Workflow Registry (`workflows/registry.json`)

The registry is the central manifest that makes workflows discoverable and runnable by name.

```jsonc
{
  "workflows": {
    "archive-site": {
      "description": "Crawl a website 1 level deep and merge all pages into a single PDF",
      "file": "simple/archive-site.ts",
      "type": "SIMPLE",
      "params": {
        "url": {
          "type": "string",
          "required": true,
          "hint": "The URL to start crawling from"
        },
        "max-pages": {
          "type": "number",
          "required": false,
          "hint": "Maximum number of pages to crawl (default: 50)"
        }
      }
    },
    "example": {
      "description": "Go to ChatGPT and ask about trending AI topics",
      "file": "simple/example.ts",
      "type": "SIMPLE",
      "params": {}
    },
    "linkedin-feed": {
      "description": "Extract latest posts from LinkedIn feed",
      "file": "simple/linkedin-feed.ts",
      "type": "SIMPLE",
      "params": {}
    }
  }
}
```

### Key decisions

- Workflow names are keys (no separate `name` field) — they match the CLI invocation
- `file` is relative to `workflows/` — so `simple/archive-site.ts`
- `type` defaults to `SIMPLE`, future-proofed for new types
- `params` declares each flag with `type` (string/number/boolean), `required`, and `hint`
- The `--headed` flag is implicit for all workflows (not declared per-workflow)

## 2. CLI (`cdp` command)

A new bin entry `cdp` providing three subcommands.

### `cdp run <workflow> [--param value...]`

- Looks up `<workflow>` in `workflows/registry.json`
- Validates all required params are present, types match
- Executes via `tsx workflows/{type}/{file} --param value...`
- Passes `--headed` through if provided
- Exits with the workflow's exit code

```
$ cdp run archive-site --url https://docs.example.com --max-pages 20
[workflow] Starting: archive-site
...
```

### `cdp list`

- Reads registry, prints all workflows in a formatted table
- Columns: name, type, description (truncated)

```
$ cdp list
NAME              TYPE    DESCRIPTION
archive-site      SIMPLE  Crawl a website 1 level deep and merge all pages into a single PDF
example           SIMPLE  Go to ChatGPT and ask about trending AI topics
linkedin-feed     SIMPLE  Extract latest posts from LinkedIn feed
```

### `cdp info <workflow>`

- Shows full detail for a single workflow: description, type, file path, and all params with types/hints/required

```
$ cdp info archive-site
Workflow: archive-site
Type:     SIMPLE
File:     workflows/simple/archive-site.ts
Description: Crawl a website 1 level deep and merge all pages into a single PDF

Parameters:
  --url          string  (required)  The URL to start crawling from
  --max-pages    number  (optional)  Maximum number of pages to crawl (default: 50)

Global flags:
  --headed       Run in headed (visible browser) mode
```

### Implementation

- New file: `src/cli/index.ts` — the CLI entry point
- New bin entry in `package.json`: `"cdp": "./dist/cli/index.js"`
- Argument parsing: lightweight, hand-rolled (no dep needed for 3 subcommands). Parses `--key value` pairs and validates against registry param definitions.
- The CLI does NOT import the SDK — it's a thin orchestrator that spawns `tsx` as a child process. This keeps it fast and decoupled.

## 3. Directory Restructure

### Workflow layout

```
workflows/
  registry.json
  simple/
    archive-site.ts
    example.ts
    linkedin-feed.ts
```

- All existing workflows move from `workflows/` to `workflows/simple/`
- Internal logic unchanged — only import paths update (`'../src/...'` → `'../../src/...'`)
- `WORKFLOW_NAME` derivation from filename still works as-is
- Output paths (`~/.cdp-custodial-access/runs/{name}/...`) are unchanged
- Future workflow types get their own subdirectory (e.g., `workflows/multi-step/`)

## 4. `validate-workflow` Skill

Slash command: `/validate-workflow <workflow-name> [--headed] [--params "--key value ..."]`

### Purpose

Execute an existing workflow, analyze its audit trail, and report pass/fail with diagnostics. Read-only — no code fixes.

### Process

1. Look up workflow in `registry.json` — get file path, params, type
2. Execute the workflow: `npx tsx workflows/{type}/{file} [default params if any]`
3. Find the run output: latest dir in `~/.cdp-custodial-access/runs/{name}/`
4. Analyze the audit trail:
   - `traces/trace.json` — check every step's success/failure
   - Screenshots — visual verification of page state
   - HTML snapshots (selectively) — verify selectors matched correctly
   - `metadata.json` — check duration, completion
   - Trace logs — check for browser console errors
5. Extract the `@prompt` from the workflow source
6. Compare actual results against `@prompt` intent
7. Report verdict

### Output format

```
## Validation: {workflow-name}
## Intent: {the @prompt text}

### Result: PASS | FAIL

### Steps: {N passed} / {N total}
- Step 1: navigate -> PASS (1.2s)
- Step 2: click -> PASS (0.3s)
- Step 3: extract -> FAIL ELEMENT_NOT_FOUND (0.5s)
  Screenshot: [description of what the page shows]

### Issues:
1. {Issue description}
   - Root cause: {diagnosis}
   - Suggestion: {what to fix — does not apply it}

### Logs:
- {any notable workflow or browser console errors}
```

### Skill file

`skills/validate-workflow/SKILL.md`

## 5. `create-workflow` Skill

Slash command: `/create-workflow <use case description>`

### Purpose

Generate a workflow from natural language, execute it, analyze the audit trail for failures, fix the code, and repeat — up to 5 cycles. Compresses generation and improvement into a single self-healing loop.

### Process

**Cycle 1:**
1. Clarify what the user wants (same as existing `/generate-workflow`)
2. Generate workflow file at `workflows/simple/{name}.ts`
3. Add registry entry to `workflows/registry.json`
4. Verify compilation: `npx tsc --noEmit`
5. Execute: `npx tsx workflows/simple/{name}.ts --headed`
6. Analyze audit trail (same method as `validate-workflow`):
   - `trace.json` — step success/failure
   - Screenshots — visual page state
   - HTML snapshots — actual DOM selectors available
   - Logs — browser console errors
7. If all steps passed and output matches intent: **DONE**
8. If failures found: diagnose, fix code, increment cycle

**Cycles 2-5:**
- Fix identified issues using HTML snapshots (correct selectors, adjust waits, etc.)
- Re-execute
- Re-analyze
- If passing: **DONE**
- If still failing and cycle < 5: next cycle

**After cycle 5:**
- Report final state (pass or remaining issues)
- Leave the best version of the code in place

### What gets fixed each cycle

| Failure | Fix |
|---------|-----|
| Wrong selectors | Read HTML snapshot at failing step, find correct selector, update code |
| Timing issues | Add/increase `wait()` calls or adjust `timeout` params |
| Navigation failures | Check URL correctness, try different `waitUntil` strategy |
| Auth walls | Add the login gate pattern if redirect to login detected |
| Empty extractions | Refine selector or extraction approach based on actual DOM |
| Cloudflare challenges | Note in output that first run needs `--headed` |

### Execution mode

Always runs `--headed` during the explore loop. The final generated workflow supports both `--headed` and headless.

### Relationship to existing skills

- `/generate-workflow` — unchanged. Fast, single-pass generator for manual iteration.
- `/create-workflow` — the "hands-off" version. Self-healing, up to 5 cycles.
- `/improve-workflow` — unchanged. Fixes existing workflows from past run traces.
- `/validate-workflow` — can re-verify independently after `/create-workflow` finishes.

### Skill file

`skills/create-workflow/SKILL.md`

## 6. Updates to Existing Skills & Documentation

### Skills updates

**`skills/generate-workflow/SKILL.md`**
- Update template to write files to `workflows/simple/` instead of `workflows/`
- Update import paths in template: `'../../src/sdk/...'`
- Add step after generation: register in `workflows/registry.json`
- Update "Usage" line in workflow header comment

**`skills/improve-workflow/SKILL.md`**
- Look up file path from registry instead of assuming `workflows/{name}.ts`
- Add `validate-workflow` and `create-workflow` to related skills section

### Documentation updates

**`CLAUDE.md`**
- Update Workflows section: document `workflows/simple/` directory, `registry.json`, `type` field
- Update Skills section: add `validate-workflow` and `create-workflow`
- Add CLI section: document `cdp run`, `cdp list`, `cdp info`
- Update workflow generation references

**`README.md`**
- Add CLI usage section
- Update workflow examples to show `cdp run` syntax alongside `npx tsx`

## New & Moved Files Summary

### New files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI entry point (`cdp` command) |
| `workflows/registry.json` | Workflow manifest |
| `skills/validate-workflow/SKILL.md` | Validate workflow skill |
| `skills/create-workflow/SKILL.md` | Self-healing workflow generation skill |

### Moved files

| From | To |
|------|-----|
| `workflows/example.ts` | `workflows/simple/example.ts` |
| `workflows/archive-site.ts` | `workflows/simple/archive-site.ts` |
| `workflows/linkedin-feed.ts` | `workflows/simple/linkedin-feed.ts` |
