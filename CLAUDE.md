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

**Key patterns:**
- Tools are standalone functions taking `(session, params)` → `ToolResult<T>`. They never throw — errors return `{ success: false, errorCode }`.
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

- Stored at `~/.cdp-custodial-access/profiles/{name}/` (chrome/ dir + metadata.json)
- Fingerprint profiles persist to disk. Changing stealth config or locale requires deleting the profile dir to regenerate: `rm -rf ~/.cdp-custodial-access/profiles/{name}`
- Manage via `controller.getProfileManager()` — `.listProfiles()`, `.deleteProfile(name)`, `.loadMetadata(name)`

## Workflows

- Live in `workflows/` as standalone TypeScript scripts, run via `npx tsx workflows/{name}.ts`
- Output goes to `~/.cdp-custodial-access/runs/{filename}/{YYYY-MM-DD}/{HH-mm-ss}/`
- Workflow name is derived from the script filename automatically
- To generate a workflow from a plain English use case, use the `generate-workflow` skill at `skills/generate-workflow/SKILL.md`

## Instructions

1. Never commit anything to git. All changes will be reviewed by a developer and added to git by the developer.
