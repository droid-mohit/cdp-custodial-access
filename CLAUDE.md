# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CDP Custodial Access is a TypeScript SDK + MCP server for stealth browser automation via Chrome DevTools Protocol. It provides tool-based, programmatic browser control with maximum anti-detection built in.

**Consumption interfaces:**
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
MCP Server (src/mcp/)     ← stdio transport, tool registration
    ↓
SDK (src/sdk/)            ← BrowserController, EnrichedSession with tool methods
    ↓
Tools (src/tools/)        ← navigate, click, extract, etc. (standalone async functions)
    ↓
Core (src/core/)          ← BrowserManager, BrowserSession, ProfileManager
  + Stealth (src/stealth/) ← StealthManager, patches (property, fingerprint, behavioral, network)
    ↓
Puppeteer (puppeteer-extra + stealth plugin)
```

**Additional layers:**
- `src/llm/` — LLM abstraction (factory pattern): OpenAI, Anthropic, Bedrock. Bedrock is an optional dep loaded dynamically.
- `llmExtract` tool — extracts structured data from collected HTML pages via LLM. Uses tracer HTML snapshots or explicit pages.

**Key patterns:**
- Tools are standalone functions taking `(session, params)` → `ToolResult<T>`. They never throw — errors return `{ success: false, errorCode }`.
- Tools are atomic operations. Multi-step use cases (crawling, archiving) belong in `workflows/`, not `src/tools/`.
- `page.pdf()` only works in headless mode — workflows that generate PDFs must force `headless: true`.
- `EnrichedSession` is a `BrowserSession` with tool methods attached (e.g., `session.navigate(...)`, `session.click(...)`).
- Stealth patches come in two flavors: browser-injected JS strings (property/fingerprint patches) and Node.js data generators (behavioral patches for mouse/typing/scroll).
- ESM project (`"type": "module"`) — all imports use `.js` extensions even for `.ts` source files.
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

## Audit Trails

- Every tool call is automatically traced via `session.tracer` (baked into `enrichSession()`)
- Set output dir before tool calls: `session.tracer.setOutputDir(outputDir)` — save in finally: `session.tracer.save()`
- Traces capture: params, result, timing, page URL/title, full HTML (every step), screenshots (navigate/click/input/sendKeys/errors)
- Workflow logs: use `session.tracer.log(message)` instead of `console.log()` — captures logs in `trace.json` AND tees to stdout
- Browser console logs are auto-captured via page `console` event (source: `'browser'` in trace logs)
- Run context (headed/headless, profile, stealth level, locale, viewport, userAgent) auto-captured in `trace.json`
- Output: `~/.cdp-custodial-access/runs/{workflow}/{date}/{time}/traces/` — `trace.json` + `step-NNN-{tool}.html` + `step-NNN-{tool}.png`

## Workflows

- Live in `workflows/` as standalone TypeScript scripts, run via `npx tsx workflows/{name}.ts`
- Output goes to `~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/`
- Workflow name is derived from the script filename automatically
- To generate a workflow from a plain English use case: `/generate-workflow {use case}`
- To debug/improve a workflow from its audit traces: `/improve-workflow {workflow-name} [--runs N]`
- Every workflow has a `@prompt` tag in its top comment preserving the original user request

## Cloudflare Challenges

- `navigate()` reports `success: true` on Cloudflare challenge pages — `networkidle2` resolves on the lightweight challenge HTML. Always check page title after navigation.
- Detect with page title `"Just a moment..."` or Turnstile DOM elements (`cf-turnstile-response`, `cf-chl`)
- Headed mode: wait for manual solve, then continue. Headless: throw with actionable error suggesting `--headed`
- Once solved, the session cookie persists in the profile — subsequent headless runs may pass without challenge

## Instructions

1. All changes will be reviewed by a developer before merging. Create feature branches for non-trivial changes.
