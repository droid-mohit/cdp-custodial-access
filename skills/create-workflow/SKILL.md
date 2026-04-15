---
name: create-workflow
description: Use when the user wants to create a browser workflow with automatic testing and self-correction. Triggers on "create workflow", "create a workflow", "build me a workflow", "make a workflow that", or any request where the user describes a browser automation use case and wants a fully working result without manual debugging. Generates the workflow, executes it, analyzes traces, fixes issues, and iterates until working.
---

# Create Workflow

Generate a workflow from natural language, execute it, analyze the audit trail for failures, fix the code, and iterate until working. This compresses `/generate-workflow` and `/improve-workflow` into a single self-healing loop.

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

#### Workflow Header: Intent + Steps Scratchpad

The workflow's top-level comment must capture the **exact user intent** and include a `@steps` section that serves as a scratchpad during iteration. The steps section starts with your best-guess plan and evolves as you discover what actually works during each cycle.

**Initial header (Phase 1 — before any execution):**
```typescript
/**
 * @prompt {The user's original plain-English request, copied verbatim}
 *
 * @steps
 * 1. Navigate to {url} — [UNTESTED]
 * 2. Authenticate via autoLogin — [UNTESTED]
 * 3. {action description} — [UNTESTED]
 * 4. Extract {data} — [UNTESTED]
 * 5. Save to {output files} — [UNTESTED]
 *
 * Workflow: {Title}
 * ...
 */
```

**During Phase 2**, update `@steps` as you verify each step works:
- `[UNTESTED]` → `[VERIFIED]` when a step passes in a cycle
- `[UNTESTED]` → `[FIXED]` when a step needed correction (briefly note what changed)
- Add new steps discovered during iteration (e.g., "Close extra tabs", "Re-navigate after login")
- Remove steps that turned out to be unnecessary

**Final header (after workflow is working):**
```typescript
/**
 * @prompt get all my connections with their names, current companies and current role from my linkedin
 *
 * @steps
 * 1. Navigate to /mynetwork/grow/ — auth landing page
 * 2. Authenticate via autoLogin (manual fallback on first run)
 * 3. Verify no challenge page, then navigate to /mynetwork/invite-connect/connections
 * 4. Scroll and extract connections (virtualized list — accumulate via Map, dedupe by profile URL)
 * 5. Save connections.json + connections.csv + metadata.json
 *
 * Workflow: LinkedIn Connections Extractor
 * ...
 */
```

The final `@steps` becomes documentation for anyone reading the workflow — it records the **verified working path**, not the initial guess. It also helps `/improve-workflow` understand the intended sequence when debugging future breakages.

### Phase 2: Execute and Fix Loop (fail fast, iterate fast)

The loop has **no fixed cycle limit**. Keep iterating until the workflow produces correct output or you and the user agree to stop. Each cycle should be fast — use short timeouts and targeted goals.

#### Strategy: Goal-Based Iterations

Don't try to get everything right in one run. Each cycle should target a specific goal:

1. **First cycle**: Verify the page loads and auth works. Use short timeouts (60-120s bash timeout). Don't wait for the full workflow to complete — just confirm the first few steps work.
2. **Next cycles**: Progressively verify deeper steps — navigation, page structure discovery, selector validation, data extraction.
3. **Later cycles**: Full end-to-end run once all individual pieces are confirmed working.

This means early cycles may intentionally be killed early once you've observed enough to diagnose the next fix.

#### Execution

**Step A: Execute the workflow**
```bash
echo "n" | npx tsx workflows/simple/{name}.ts --headed 2>&1
```
- Always use `--headed` during the loop so interactive elements, auth prompts, and Cloudflare challenges can be handled.
- Pipe `echo "n"` to auto-dismiss interactive credential save prompts that would block the process.
- **Use short bash timeouts (60-120s)** during exploration/debugging cycles. Only increase for full end-to-end runs once the workflow is known to work.
- Filter noisy output with `| grep -E "\[workflow\]|Fatal error|Error:"` to focus on workflow-level events.

**Step B: Find the run output**
```bash
ls -d ~/.cdp-custodial-access/runs/{name}/*/* 2>/dev/null | sort -r | head -1
```

**Step C: Analyze the audit trail**

Read from the latest run directory:
- **Screenshots** (`traces/step-*.png`) — read screenshots for failed steps first. Fastest way to understand what the page actually shows.
- **HTML snapshots** (`traces/step-*.html`) — for `ELEMENT_NOT_FOUND` failures, parse the HTML to find correct selectors. Use targeted extraction (python/grep) rather than reading raw HTML.
- **`traces/trace.json`** — check step `result.success`, `result.errorCode`, `durationMs`
- **Logs** (inside `trace.json` → `logs[]`) — check for errors from `workflow` and `browser` sources.

**Step D: Evaluate**
- If all steps passed and output matches the user's intent → **DONE** — report success and exit loop.
- If failures found → diagnose the **first** failure and proceed to Step E.

**Step E: Fix, update @steps, and continue**

After each fix, update the `@steps` section in the workflow header:
- Mark verified steps as `[VERIFIED]`
- Mark corrected steps as `[FIXED]` with a brief note
- Add any new steps discovered during this cycle
- Remove steps that turned out to be unnecessary

Then apply targeted fixes based on failure type:

| Failure | How to Fix |
|---------|-----------|
| Wrong URL (page doesn't exist, 404) | Read the screenshot/HTML. Find correct URLs from links on the page. Sites restructure URLs — don't guess, extract from DOM. |
| Wrong selectors (`ELEMENT_NOT_FOUND`) | Read the HTML snapshot at the failing step. Find the correct CSS/XPath selector from the actual DOM. Sites with obfuscated classes need `data-testid`, `aria-label`, or structural selectors (`tag > tag`). |
| Virtualized/recycled lists (DOM count doesn't grow on scroll) | The page only keeps N DOM nodes alive. Switch to accumulate-as-you-scroll: extract after each scroll, deduplicate by unique key, stop when no new items appear. Use `scrollIntoView` on the last list child + `window.scrollBy()` instead of `session.scroll()`. |
| Timing issues (elements not loaded) | Prefer polling (check DOM until content appears) over fixed `session.wait()` calls. Fixed waits accumulate and slow the workflow. |
| Navigation failures | Check URL is correct. Try different `waitUntil` strategy (`'domcontentloaded'` vs `'networkidle2'`). |
| Auth walls (redirect to login) | Add `autoLogin` pattern from the generate-workflow template. After login, the page may redirect to a different URL than expected — navigate explicitly to the target page after auth. |
| Post-auth redirect | After `autoLogin`, the page may land on `/feed/` or another default page, not where you navigated before auth. Always re-navigate to the target URL after login. |
| Empty extractions | Read the HTML snapshot. Refine the `selector` to target the right DOM element. |
| Cloudflare challenge | Note in final report that first run needs `--headed`. Ensure stealth level is `'none'`. |

After fixing, go back to Step A for the next cycle.

### Phase 3: Finalize and Report

Before reporting, clean up the workflow header's `@steps` section:
- Remove all `[UNTESTED]`, `[VERIFIED]`, `[FIXED]` tags
- Write each step as a clean, concise description of what it does
- Include key details discovered during iteration (correct URLs, selector strategies, scroll techniques)
- The final `@steps` should read as documentation for someone maintaining the workflow

After cleanup, report:

```
## Create Workflow: {name}
## Intent: {user's original description}

### Result: PASS (cycle {N}) | STOPPED (after {N} cycles)

### Cycles:
- Cycle 1: {goal, what was observed, what was fixed}
- Cycle 2: {goal, what was observed, what was fixed}
- ...

### Final state:
- Workflow file: workflows/simple/{name}.ts
- Registry entry: added to workflows/registry.json
- {if PASS}: Ready to run: `cdp run {name} [params]`
- {if STOPPED}: Remaining issues: {list what's still broken}
```

## Key Principles

- **Fail fast, iterate fast** — use short timeouts, kill early once you've seen enough, fix one thing, re-run. Don't wait 5 minutes for a run to complete when you can diagnose the issue from the first 30 seconds.
- **Goal-based cycles** — each iteration targets a specific goal (auth works? page loads? selectors match? data extracted?). Don't try to validate everything at once.
- **No fixed cycle limit** — keep iterating until the workflow works or the user decides to stop. Simple workflows may take 2 cycles; complex ones may take 10+. The skill doesn't artificially cap progress.
- **@steps as a living scratchpad** — the workflow header's `@steps` section evolves with each cycle. It starts as a best-guess plan, gets annotated with `[VERIFIED]`/`[FIXED]` during iteration, and ends as clean documentation of the verified working path.
- **Always `--headed` during the loop** — headless hides interactive elements and auth prompts that the workflow may need to handle.
- **Read HTML snapshots to fix selectors** — never guess selectors. The HTML from the trace shows exactly what's in the DOM at the point of failure.
- **One fix at a time** — fix the first failure in the trace, then re-run. Don't try to fix all issues at once — later failures may be caused by earlier ones.
- **Preserve working parts** — if steps 1-5 work and step 6 fails, only change step 6.
- **Prefer polling over fixed waits** — `session.wait({ ms: 3000 })` after every action adds up fast. Poll the DOM for the expected state instead. Use fixed waits only for initial page settle after navigation.
- **Register in registry** — the workflow must be added to `workflows/registry.json` so it's runnable via `cdp run`.

## Relationship to Other Skills

- **`/generate-workflow`** — single-pass generation, no execution. Use when you want speed and will debug manually.
- **`/create-workflow`** — this skill. Self-healing loop. Use when you want a working workflow without manual debugging.
- **`/improve-workflow`** — fixes existing workflows from past run traces. Use to debug a workflow that was working but broke.
- **`/validate-workflow`** — executes and reports pass/fail. Use to verify a workflow works after changes.
