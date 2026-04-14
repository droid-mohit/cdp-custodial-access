---
name: validate-workflow
description: Use when the user wants to validate, test, or check that a workflow runs correctly. Triggers on "validate workflow", "test workflow", "check workflow", "does this workflow work". Executes the workflow, analyzes its audit trail, and reports pass/fail with diagnostics. Does NOT fix code.
---

# Validate Workflow

Execute an existing workflow and analyze its audit trail to report pass/fail with diagnostics.

## Arguments

```
/validate-workflow <workflow-name> [--headed] [--params "--key value ..."]
```

- `workflow-name`: name as registered in `workflows/registry.json`
- `--headed`: run in headed mode (useful for auth-gated workflows)
- `--params`: pass-through params for workflows that require them (e.g., `--params "--url https://example.com"`)

## Process

1. **Look up workflow** — read `workflows/registry.json`, find the entry by name. If not found, list available workflows and stop.

2. **Execute the workflow**:
   ```bash
   npx tsx workflows/{entry.file} {params} [--headed]
   ```
   Let it run to completion (or failure). Capture the exit code.

3. **Find the latest run output**:
   ```bash
   ls -d ~/.cdp-custodial-access/runs/{workflow-name}/*/* 2>/dev/null | sort -r | head -1
   ```

4. **Analyze the audit trail** — read the following from the latest run directory:

   - **`traces/trace.json`** — iterate every step:
     - Check `result.success` — mark PASS or FAIL
     - Note `result.errorCode` and `result.error` on failures
     - Note `durationMs` — flag steps over 30s as slow
   - **Screenshots** (`traces/step-*.png`) — read screenshots for any FAIL steps. Describe what the page shows (login wall, blank page, Cloudflare challenge, etc.)
   - **HTML snapshots** (`traces/step-*.html`) — only read these when a step failed with `ELEMENT_NOT_FOUND` to check what selectors are actually available in the DOM
   - **`metadata.json`** — check overall duration, completion status
   - **Logs** (inside `trace.json` → `logs[]`) — check for `level: 'error'` entries from both `workflow` and `browser` sources
   - **Network HAR** (`traces/network.har`, if present) — check for failed requests (status 0), unexpected redirects, or API errors that might explain extraction failures

5. **Extract the `@prompt`** — read the workflow source file, extract the `@prompt` tag from the top comment. This is the user's original intent.

6. **Compare against intent** — even if all steps passed, check whether the output files and extracted data match what the `@prompt` describes.

7. **Report verdict** using this format:

```
## Validation: {workflow-name}
## Intent: {the @prompt text}

### Result: PASS | FAIL

### Steps: {N passed} / {N total}
- Step 1: {tool} -> PASS ({duration}s)
- Step 2: {tool} -> PASS ({duration}s)
- Step 3: {tool} -> FAIL {errorCode} ({duration}s)
  Screenshot: {describe what the page shows}
  HTML: {if ELEMENT_NOT_FOUND — list available selectors that might work}

### Issues:
1. {Issue description}
   - Root cause: {diagnosis}
   - Suggestion: {what to fix — but do NOT apply it}

### Logs:
- {any notable errors from workflow or browser console}
```

## Key Principles

- **Read-only** — this skill diagnoses but never modifies code. Report suggestions, don't apply them.
- **Screenshots first** — always read the screenshot for failed steps before diagnosing. A screenshot of a login wall tells you more than an error code.
- **HTML selectively** — only read HTML snapshots when the failure is `ELEMENT_NOT_FOUND` and you need to check what selectors exist.
- **Cross-reference with @prompt** — a workflow that runs with no errors but produces wrong output is still a FAIL.
- **Check auth state** — if traces show redirects to login pages, the issue is expired authentication, not broken selectors.
- **Check run context** — `trace.json` → `context` shows headed/headless, stealth level, etc. A workflow that fails in headless but works headed is usually a bot detection or auth issue.
