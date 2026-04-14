# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CDP Custodial Access is a TypeScript SDK + MCP server for stealth browser automation via Chrome DevTools Protocol. It provides tool-based, programmatic browser control with maximum anti-detection built in.

**Consumption interfaces:**
- **CLI**: `cdp run <workflow>` / `cdp list` / `cdp info <workflow>`
- **SDK**: `import { BrowserController } from 'cdp-custodial-access'`
- **MCP**: stdio transport server (`npx cdp-custodial-access`)

## Build & Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode compilation
npm test             # Run all tests
npm run test:unit    # Unit tests only
npm run test:watch   # Watch mode tests
npx tsc --noEmit     # Type check without emitting
```

Run a single test file:
```bash
npx vitest run tests/unit/tools/navigation.test.ts
```

Run tests in a directory:
```bash
npx vitest run tests/unit/stealth/
```

## Architecture

Layered monolith with unidirectional dependency flow:

```
CLI (src/cli/)            ← cdp run/list/info, registry-based workflow runner
    ↓ (spawns tsx, no SDK import)
MCP Server (src/mcp/)     ← stdio transport, tool registration
    ↓
SDK (src/sdk/)            ← BrowserController, EnrichedSession with tool methods
    ↓
Tools (src/tools/)        ← navigate, click, extract, etc. (standalone async functions)
    ↓
Auth (src/auth/)           ← login recipes (domain → login steps map)
    ↓
Core (src/core/)          ← BrowserManager, BrowserSession, ProfileManager
  + Stealth (src/stealth/) ← StealthManager, patches (property, fingerprint, behavioral, network)
  + NetworkTracer          ← optional HAR 1.2 capture via CDP Network domain
    ↓
Puppeteer (puppeteer-extra + stealth plugin)
```

**Additional layers:**
- `src/llm/` — LLM abstraction (factory pattern): OpenAI, Anthropic, Bedrock. Bedrock is an optional dep loaded dynamically.
- `llmExtract` tool — extracts structured data from collected HTML pages via LLM. Uses tracer HTML snapshots or explicit pages.
- `fetchSitemap`/`fetchRobots` tools — pure HTTP, no browser session needed. Pattern for non-browser utility tools.
- `src/auth/` — Login recipes: domain-keyed login step sequences for known sites. Used by `autoLogin` tool.
- `src/core/credential-store.ts` — CredentialStore: plaintext JSON CRUD at `~/.cdp-custodial-access/credentials/{workflow}/{profile}.json`. Interface-first for future encrypted/keychain backends.

**Key patterns:**
- Tools are standalone functions taking `(session, params)` → `ToolResult<T>`. They never throw — errors return `{ success: false, errorCode }`.
- Some tools are session-independent (sitemap, robots) — they take only params, no session. These use `fetch()` directly.
- Tools are atomic operations. Multi-step use cases (crawling, archiving) belong in `workflows/`, not `src/tools/`.
- `page.pdf()` only works in headless mode — workflows that generate PDFs must force `headless: true`.
- `EnrichedSession` is a `BrowserSession` with tool methods attached (e.g., `session.navigate(...)`, `session.click(...)`).
- CDP sessions: `page.createCDPSession()` for per-page events (network capture), `browser.target().createCDPSession()` for browser-level. The `session.cdp()` method returns browser-level.
- Stealth patches come in two flavors: browser-injected JS strings (property/fingerprint patches) and Node.js data generators (behavioral patches for mouse/typing/scroll).
- ESM project (`"type": "module"`) — all imports use `.js` extensions even for `.ts` source files.
- Node.js `process.stdout.write` callback type requires `Error | null | undefined`, not just `Error | undefined` — matters when overriding write for password masking.
- `puppeteer-extra` requires a type cast for the default import under `NodeNext` module resolution.

## Stealth

- Default stealth level is `none` (puppeteer-extra-plugin-stealth only, no custom patches). This works best against aggressive bot detection (ChatGPT, Cloudflare).
- Custom patch levels (`basic`/`advanced`/`maximum`) double-patch on top of the stealth plugin and can trigger detection on sophisticated sites. Use only when fingerprint diversity matters more than evasion.
- Keep Chrome launch args minimal — excessive `--disable-*` flags are themselves a bot fingerprint.
- `--window-size` must match `defaultViewport` or the page renders incorrectly. BrowserManager syncs these automatically.
- CDP `Emulation.setTimezoneOverride`/`setLocaleOverride` are detectable. Only applied when patches are active (not at `none` level).

## Profiles

- Workflow-namespaced: `~/.cdp-custodial-access/profiles/{workflow}/{profile}/` (chrome/ dir + metadata.json)
- `LaunchConfig` uses `workflow` (namespace) + `profile` (default: `'default'`): `controller.launch({ workflow: WORKFLOW_NAME })`
- Fingerprint profiles persist to disk. Changing stealth/locale requires deleting the profile: `rm -rf ~/.cdp-custodial-access/profiles/{workflow}/{profile}`
- ProfileManager API: `.listWorkflows()`, `.listProfiles(workflow)`, `.deleteProfile(workflow, profile)`, `.loadMetadata(workflow, profile)`
- Persistent profiles cause Chrome to restore previous tabs on launch. Close extra tabs before starting: `const pages = await session.pages(); for (let i = 1; i < pages.length; i++) await pages[i].close();`

## Authentication

- Auth tools: `checkLogin` (verify session), `waitForLogin` (headed manual login), `exportCookies`/`importCookies` (portable JSON)
- Auto-login tool: `autoLogin` — orchestrates: check session → load stored credentials → fill form → verify → fall back to manual
- Login persists via Chrome profile — first run: login manually with `--headed`, subsequent runs: cookies loaded automatically
- If cookies expire, `autoLogin` replays stored credentials automatically. If credentials fail, falls back to `--headed` manual login.
- Credential storage: `~/.cdp-custodial-access/credentials/{workflow}/{profile}.json` — plaintext JSON, one file per workflow+profile pair
- Login recipes: `src/auth/recipes.ts` — domain-keyed login sequences for known sites (LinkedIn, Google). Unknown sites use generic form detection.
- 2FA: credentials with `requires2FA: true` auto-fill username/password, then pause for human OTP entry
- `promptCredentialSave` — post-workflow CLI prompt to capture and store credentials after manual login
- Pattern for authenticated workflows: `session.autoLogin({ loginUrl, successSelector, workflow, profile })` replaces the manual checkLogin → waitForLogin block
- `autoLogin` can return `existing-session` even when the site triggers a post-auth challenge (e.g., LinkedIn App Challenge, device verification). Always verify the target page loaded after `autoLogin` — check URL/title for `/checkpoint/` or "Challenge" patterns.
- Post-auth challenge handling: headed mode should poll and wait for user resolution; headless should throw with `--headed` suggestion. See `ensureFeedLoaded()` in `linkedin-feed.ts` for the pattern.
- `promptCredentialSave` should also trigger when `CredentialStore.exists(workflow, profile)` is false — proactively capture credentials on first successful run, not just after manual login.
- `exportCookies` uses CDP `Network.getAllCookies` (all domains), not `page.cookies()` (current page only)

## Audit Trails

- Every tool call is automatically traced via `session.tracer` (baked into `enrichSession()`)
- Set output dir before tool calls: `session.tracer.setOutputDir(outputDir)` — save in finally: `session.tracer.save()`
- Traces capture: params, result, timing, page URL/title, full HTML (every step), screenshots (navigate/click/input/sendKeys/errors)
- Workflow logs: use `session.tracer.log(message)` instead of `console.log()` — captures logs in `trace.json` AND tees to stdout
- Browser console logs are auto-captured via page `console` event (source: `'browser'` in trace logs)
- Run context (headed/headless, profile, stealth level, locale, viewport, userAgent) auto-captured in `trace.json`
- Output: `~/.cdp-custodial-access/runs/{workflow}/{date}/{time}/traces/` — `trace.json` + `step-NNN-{tool}.html` + `step-NNN-{tool}.png`
- Network tracing: `--network-trace` captures all HTTP requests/responses as `traces/network.har` (HAR 1.2). `--network-trace=full` includes response bodies. Opt-in per run, no code changes needed.

## Workflows

- Registered in `workflows/registry.json` — each entry has name, description, file, type, and params
- Organized by type: `workflows/simple/` for single-script linear workflows (`type: "SIMPLE"`)
- Run via CLI: `cdp run <workflow-name> [--param value...] [--headed]`
- Run directly: `npx tsx workflows/simple/{name}.ts [--headed]`
- Discover workflows: `cdp list` (all workflows) or `cdp info <name>` (detailed params)
- Output goes to `~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/`
- Workflow name is derived from the script filename automatically
- To generate a workflow (single-pass): `/generate-workflow {use case}`
- To generate with self-healing execution: `/create-workflow {use case}`
- To validate a workflow runs correctly: `/validate-workflow {workflow-name}`
- To debug/improve a workflow from its audit traces: `/improve-workflow {workflow-name} [--runs N]`
- Every workflow has a `@prompt` tag in its top comment preserving the original user request

## Skills

- Project skills live in `skills/{name}/SKILL.md`, slash commands in `.claude/commands/{name}.md`
- `/generate-workflow` — single-pass workflow generation from plain English
- `/create-workflow` — self-healing generation: generate → execute → analyze → fix (up to 5 cycles)
- `/validate-workflow` — execute a workflow and report pass/fail diagnostics (read-only)
- `/improve-workflow` — debug existing workflows from past run audit traces
- When adding new workflows, register them in `workflows/registry.json` and place the file in `workflows/{type}/` (e.g., `workflows/simple/`)
- When adding new tools, update both `skills/generate-workflow/SKILL.md` (tool reference tables) and `skills/improve-workflow/SKILL.md` (failure categories + available tools)

## Cloudflare Challenges

- `navigate()` reports `success: true` on Cloudflare challenge pages — `networkidle2` resolves on the lightweight challenge HTML. Always check page title after navigation.
- Detect with page title `"Just a moment..."` or Turnstile DOM elements (`cf-turnstile-response`, `cf-chl`)
- Headed mode: wait for manual solve, then continue. Headless: throw with actionable error suggesting `--headed`
- Once solved, the session cookie persists in the profile — subsequent headless runs may pass without challenge

## Instructions

1. All changes will be reviewed by a developer before merging. Create feature branches for non-trivial changes.
