---
name: create-workflow
description: Use when the user wants to create a browser workflow with automatic testing and self-correction. Triggers on "create workflow", "create a workflow", "build me a workflow", "make a workflow that", or any request where the user describes a browser automation use case and wants a fully working result without manual debugging. Generates the workflow, executes it, analyzes traces, fixes issues, and repeats up to 5 cycles.
---

# Create Workflow

Generate a workflow from natural language, execute it, analyze the audit trail for failures, fix the code, and repeat — up to 5 cycles. This compresses `/generate-workflow` and `/improve-workflow` into a single self-healing loop.

## Arguments

```
/create-workflow <use case description>
```

The use case description is a plain English description of what the workflow should do (e.g., "go to example.com and extract the pricing table").

## Process

### Phase 1: Clarify and Generate (same as /generate-workflow)

1. Clarify what the user wants (site, actions, what to extract/save)
2. Identify which tools are needed from the tool reference in `skills/generate-workflow/SKILL.md`
3. Generate the workflow file at `workflows/simple/{name}.ts` following the template in `skills/generate-workflow/SKILL.md`
4. Add an entry to `workflows/registry.json`:
   ```json
   "{name}": {
     "description": "{one-line description}",
     "file": "simple/{name}.ts",
     "type": "SIMPLE",
     "params": { ... }
   }
   ```
5. Verify compilation: `npx tsc --noEmit`

### Phase 2: Execute and Fix Loop (up to 5 cycles)

For each cycle:

**Step A: Execute the workflow**
```bash
npx tsx workflows/simple/{name}.ts --headed
```
Always use `--headed` during the loop so interactive elements, auth prompts, and Cloudflare challenges can be handled.

**Step B: Find the run output**
```bash
ls -d ~/.cdp-custodial-access/runs/{name}/*/* 2>/dev/null | sort -r | head -1
```

**Step C: Analyze the audit trail**

Read from the latest run directory:
- **`traces/trace.json`** — check every step's `result.success`, `result.errorCode`, `durationMs`
- **Screenshots** (`traces/step-*.png`) — read screenshots for failed steps. Describe what the page shows.
- **HTML snapshots** (`traces/step-*.html`) — for `ELEMENT_NOT_FOUND` failures, read the HTML to find the correct selectors. For empty extractions, check what content is actually in the DOM.
- **Logs** (inside `trace.json` → `logs[]`) — check for errors from `workflow` and `browser` sources.

**Step D: Evaluate**
- If all steps passed and output matches the user's intent → **DONE** — report success and exit loop.
- If failures found → diagnose and proceed to Step E.
- If cycle 5 and still failing → report final state and exit loop.

**Step E: Fix and continue**

Apply targeted fixes based on failure type:

| Failure | How to Fix |
|---------|-----------|
| Wrong selectors (`ELEMENT_NOT_FOUND`) | Read the HTML snapshot at the failing step. Find the correct CSS/XPath selector from the actual DOM. Update the workflow code. |
| Timing issues (elements not loaded) | Add or increase `session.wait({ ms })` calls. Increase `timeout` params on tool calls. |
| Navigation failures | Check URL is correct. Try different `waitUntil` strategy (`'domcontentloaded'` vs `'networkidle2'`). |
| Auth walls (redirect to login) | Add the login gate pattern from the generate-workflow template. |
| Empty extractions | Read the HTML snapshot. Refine the `selector` to target the right DOM element. |
| Cloudflare challenge | Note in final report that first run needs `--headed`. Ensure stealth level is `'none'`. |

After fixing, go back to Step A for the next cycle.

### Phase 3: Report

After the loop finishes (either success or cycle 5), report:

```
## Create Workflow: {name}
## Intent: {user's original description}

### Result: PASS (cycle {N}) | FAIL (after 5 cycles)

### Cycles:
- Cycle 1: {what was tried, what failed, what was fixed}
- Cycle 2: {what was tried, what failed, what was fixed}
- ...

### Final state:
- Workflow file: workflows/simple/{name}.ts
- Registry entry: added to workflows/registry.json
- {if PASS}: Ready to run: `cdp run {name} [params]`
- {if FAIL}: Remaining issues: {list what's still broken}
```

## Key Principles

- **Always `--headed` during the loop** — headless hides interactive elements and auth prompts that the workflow may need to handle.
- **Read HTML snapshots to fix selectors** — never guess selectors. The HTML from the trace shows exactly what's in the DOM at the point of failure.
- **One fix at a time** — fix the first failure in the trace, then re-run. Don't try to fix all issues at once — later failures may be caused by earlier ones.
- **Preserve working parts** — if steps 1-5 work and step 6 fails, only change step 6.
- **Cap at 5 cycles** — if it's not working after 5 attempts, report what's wrong and let the user decide next steps. The `/improve-workflow` skill can be used for further manual debugging.
- **Register in registry** — the workflow must be added to `workflows/registry.json` so it's runnable via `cdp run`.

## Relationship to Other Skills

- **`/generate-workflow`** — single-pass generation, no execution. Use when you want speed and will debug manually.
- **`/create-workflow`** — this skill. Self-healing loop. Use when you want a working workflow without manual debugging.
- **`/improve-workflow`** — fixes existing workflows from past run traces. Use to debug a workflow that was working but broke.
- **`/validate-workflow`** — executes and reports pass/fail. Use to verify a workflow works after changes.
