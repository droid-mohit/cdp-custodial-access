# Architecture

Technical reference for developers working on or extending CDP Custodial Access.

## Project Structure

```
src/
  cli/        # CLI entry point (cdp run/list/info) — spawns tsx, no SDK import
  core/       # BrowserManager, BrowserSession, ProfileManager, Tracer
  stealth/    # StealthManager, patches (property, fingerprint, behavioral, network)
  tools/      # Browser tools (navigation, interaction, forms, extraction, tabs, files, llm-extract)
  llm/        # LLM abstraction layer (factory, OpenAI/Anthropic/Bedrock clients, text processing)
  sdk/        # BrowserController, EnrichedSession
  mcp/        # MCP server with stdio transport
  types.ts    # Shared type definitions
workflows/
  registry.json   # Workflow manifest (name, type, params)
  simple/         # SIMPLE type workflows (single-script, linear)
skills/       # Claude Code skills (generate-workflow, create-workflow, validate-workflow, improve-workflow)
tests/
  unit/           # Unit tests (mirrors src/ structure)
  integration/    # Browser lifecycle tests
```

## Dependency Flow

Layered monolith with unidirectional dependencies:

```
CLI (src/cli/)            ← cdp run/list/info, registry-based workflow runner
    ↓ (spawns tsx, no SDK import)
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
- `fetchSitemap`/`fetchRobots` tools — pure HTTP, no browser session needed. Pattern for non-browser utility tools.

## Key Patterns

### Tools

Tools are standalone functions taking `(session, params)` → `ToolResult<T>`. They never throw — errors return `{ success: false, errorCode }`.

```typescript
const result = await session.navigate({ url: 'https://example.com' });
if (!result.success) {
  console.error(result.errorCode, result.error);
}
```

Some tools are session-independent (sitemap, robots) — they take only params, no session. These use `fetch()` directly.

Tools are atomic operations. Multi-step use cases (crawling, archiving) belong in `workflows/`, not `src/tools/`.

### EnrichedSession

`EnrichedSession` is a `BrowserSession` with all 23 tool methods attached (e.g., `session.navigate(...)`, `session.click(...)`). Created by `enrichSession()` which wraps each tool call with automatic tracing.

### ESM

ESM project (`"type": "module"`) — all imports use `.js` extensions even for `.ts` source files. `puppeteer-extra` requires a type cast for the default import under `NodeNext` module resolution.

### CLI

The CLI (`src/cli/`) is a thin orchestrator that reads `workflows/registry.json`, validates params, and spawns `tsx` as a child process. It does NOT import the SDK — this keeps startup instant.

### Workflow Registry

`workflows/registry.json` is the source of truth for workflow discovery. Each entry declares:
- `description` — human-readable summary
- `file` — path relative to `workflows/` (e.g., `simple/archive-site.ts`)
- `type` — workflow type (`SIMPLE` is the only type currently)
- `params` — CLI parameters with `type` (string/number/boolean), `required`, and `hint`

## Stealth

- Default stealth level is `none` (puppeteer-extra-plugin-stealth only, no custom patches). This works best against aggressive bot detection (ChatGPT, Cloudflare).
- Custom patch levels (`basic`/`advanced`/`maximum`) double-patch on top of the stealth plugin and can trigger detection on sophisticated sites. Use only when fingerprint diversity matters more than evasion.
- Keep Chrome launch args minimal — excessive `--disable-*` flags are themselves a bot fingerprint.
- `--window-size` must match `defaultViewport` or the page renders incorrectly. BrowserManager syncs these automatically.
- CDP `Emulation.setTimezoneOverride`/`setLocaleOverride` are detectable. Only applied when patches are active (not at `none` level).

### Stealth Levels

| Level | What it does |
|-------|-------------|
| `none` (default) | `puppeteer-extra-plugin-stealth` only. Best for sites with aggressive bot detection. |
| `basic` | Adds custom property patches (webdriver, chrome.runtime, plugins, permissions) |
| `advanced` | Adds behavioral stealth (mouse/typing/scroll) and TLS fingerprinting |
| `maximum` | Adds fingerprint randomization (WebGL, Canvas, AudioContext, fonts) |

Stealth patches come in two flavors:
- **Browser-injected JS strings** — property and fingerprint patches, executed via `page.evaluateOnNewDocument()`
- **Node.js data generators** — behavioral patches for mouse, typing, and scroll patterns

## Profiles

Workflow-namespaced: `~/.cdp-custodial-access/profiles/{workflow}/{profile}/` (chrome/ dir + metadata.json)

```
~/.cdp-custodial-access/profiles/
  my-app/                    # workflow namespace
    default/                 # profile name (auto-created)
      chrome/                # Chrome user data dir
      metadata.json          # fingerprint, proxy, timestamps
    logged-in/               # named profile
      chrome/
      metadata.json
```

- `LaunchConfig` uses `workflow` (namespace) + `profile` (default: `'default'`): `controller.launch({ workflow: WORKFLOW_NAME })`
- Fingerprint profiles persist to disk. Changing stealth/locale requires deleting the profile.
- Persistent profiles cause Chrome to restore previous tabs on launch. Close extra tabs before starting.

```typescript
const pm = controller.getProfileManager();
pm.listWorkflows();                          // ['my-app', ...]
pm.listProfiles('my-app');                   // ['default', 'logged-in']
pm.deleteProfile('my-app', 'default');       // Reset to fresh state
```

## Audit Trails

- Every tool call is automatically traced via `session.tracer` (baked into `enrichSession()`)
- Traces capture: params, result, timing, page URL/title, full HTML (every step), screenshots (navigate/click/input/sendKeys/errors)
- Workflow logs: use `session.tracer.log(message)` instead of `console.log()` — captures logs in `trace.json` AND tees to stdout
- Browser console logs are auto-captured via page `console` event (source: `'browser'` in trace logs)
- Run context (headed/headless, profile, stealth level, locale, viewport, userAgent) auto-captured in `trace.json`

```typescript
session.tracer.setOutputDir(outputDir);
// ... run workflow steps ...
session.tracer.save();
```

Output structure:
```
~/.cdp-custodial-access/runs/{workflow}/{YYYY-MM-DD}/{HH-mm-ss}/
  traces/
    trace.json              # Full audit trail with run context
    step-001-navigate.html  # HTML snapshot
    step-001-navigate.png   # Screenshot
    step-002-click.png
    ...
  metadata.json             # Run metadata
```

## Authentication

- Auth tools: `checkLogin` (verify session), `waitForLogin` (headed manual login), `exportCookies`/`importCookies` (portable JSON)
- Login persists via Chrome profile — first run: login manually with `--headed`, subsequent runs: cookies loaded automatically
- Pattern for authenticated workflows: navigate → `checkLogin()` → if expired, `waitForLogin()` in headed mode or throw in headless
- `autoLogin` may redirect to a default page (e.g., `/feed/`) after login, not the page you navigated to before auth. Always re-navigate to the target URL after successful login.
- `exportCookies` uses CDP `Network.getAllCookies` (all domains), not `page.cookies()` (current page only)

### Credential Store

Plaintext JSON credential storage at `~/.cdp-custodial-access/credentials/{workflow}/{profile}.json`.

**Components:**
- `CredentialStore` (`src/core/credential-store.ts`) — CRUD for credential files. Interface-first design for future encrypted/keychain backends.
- Login Recipes (`src/auth/recipes.ts`) — static domain → login steps map for known sites (LinkedIn single-step, Google multi-step). Falls back to generic DOM form detection for unknown sites.
- `autoLogin` tool (`src/tools/auto-login.ts`) — orchestrator: check session → load credentials → recipe/selector fill → verify → 2FA wait → manual fallback
- `promptCredentialSave` tool (`src/tools/auto-login.ts`) — post-workflow CLI prompt to capture credentials via stdin (masked password input)

**Upgrade path:** Replace `CredentialStore` class with encrypted file or OS keychain implementation. No other code changes needed — all consumers use the `get/save/delete/exists` interface.

### Network Tracing

Optional HAR 1.2 capture of all network traffic during a session.

**Components:**
- `NetworkTracer` (`src/core/network-tracer.ts`) — listens to CDP Network domain events (`requestWillBeSent`, `responseReceived`, `loadingFinished`, `loadingFailed`), builds HAR incrementally, writes `traces/network.har`
- Activated via `LaunchConfig.networkTrace`: `true` for headers-only, `'full'` for response bodies included
- Attached to pages alongside `captureConsole` in `BrowserSession`
- `Tracer.save()` calls `NetworkTracer.save()` automatically — one save writes both `trace.json` and `network.har`

**CLI usage:** `--network-trace` (headers only) or `--network-trace=full` (with response bodies). Passes through `cdp run` automatically.

**HAR format:** Standard 1.2 spec. Failed requests get `status: 0` and `_error` field. Binary response bodies are base64-encoded. Creator field identifies `cdp-custodial-access`.

## Virtualized Lists

Many modern sites (LinkedIn, Twitter, etc.) use virtualized/recycled lists that only keep a fixed number of DOM nodes alive (~20), recycling content as the user scrolls.

**Key patterns:**
- `session.scroll()` may not advance virtual lists. Use `element.scrollIntoView()` on the last list child + `window.scrollBy()` instead.
- Accumulate-as-you-scroll: extract visible items after each scroll, deduplicate by unique key (e.g., profile URL), stop after N consecutive scrolls with no new items.
- Sites with obfuscated CSS classes (hashed/random): use `data-testid`, `aria-label`, `componentkey`, or structural selectors instead of class names.

```typescript
// Example: accumulate from a virtualized list
const allItems = new Map<string, Item>();
for (let i = 0; i < MAX_SCROLLS; i++) {
  const visible = await page.evaluate(extractVisibleItems, CONTAINER_SELECTOR);
  for (const item of visible) {
    if (!allItems.has(item.id)) allItems.set(item.id, item);
  }
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid="lazy-column"]');
    container?.lastElementChild?.scrollIntoView({ behavior: 'instant', block: 'end' });
    window.scrollBy(0, 3000);
  });
  await new Promise(r => setTimeout(r, 3000));
}
```

## Cloudflare Challenges

- `navigate()` reports `success: true` on Cloudflare challenge pages — `networkidle2` resolves on the lightweight challenge HTML. Always check page title after navigation.
- Detect with page title `"Just a moment..."` or Turnstile DOM elements (`cf-turnstile-response`, `cf-chl`)
- Headed mode: wait for manual solve, then continue. Headless: throw with actionable error suggesting `--headed`
- Once solved, the session cookie persists in the profile — subsequent headless runs may pass without challenge

## LLM Extract

Extract structured data from pages visited during a workflow:

```typescript
const result = await session.llmExtract({
  instruction: 'Extract all product names and prices',
  schema: {
    type: 'object',
    properties: {
      products: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' },
        price: { type: 'number' },
      }}}
    }
  },
  llm: { provider: 'openai', model: 'gpt-4o' },
  selector: '.product-card',
});
```

Supports OpenAI, Anthropic, and AWS Bedrock. Auto-cleans HTML (strips scripts/styles/nav), chunks across context limits, and merges partial results.

## Site Discovery

Session-independent tools for discovering pages and checking crawl rules:

```typescript
import { fetchSitemap, fetchRobots, isUrlAllowed } from 'cdp-custodial-access/tools';

const sitemap = await fetchSitemap({ url: 'https://docs.example.com' });
const robots = await fetchRobots({ url: 'https://example.com' });
const allowed = isUrlAllowed({ url: 'https://example.com/admin', rules: robots.data.rules });
```

## Development

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
npx vitest run tests/unit/cli/
```

### Package Exports

| Export | Entry point | Purpose |
|--------|------------|---------|
| `.` (default) | `dist/sdk/index.js` | SDK: `BrowserController`, types |
| `./tools` | `dist/tools/index.js` | Session-independent tools (sitemap, robots, llm-extract) |
| `cdp-custodial-access` (bin) | `dist/mcp/index.js` | MCP server |
| `cdp` (bin) | `dist/cli/index.js` | CLI runner |

### Adding a New Workflow

1. Create the workflow file in `workflows/simple/{name}.ts`
2. Use `../../src/sdk/browser-controller.js` for imports
3. Include `@prompt` (original user request) and `@steps` (verified working sequence) tags in the top-level comment
4. Register in `workflows/registry.json` with name, description, file, type, and params
5. Update skills if the workflow introduces new patterns

**Development tips:**
- Run non-interactively: `echo "n" | npx tsx workflows/simple/{name}.ts --headed 2>&1`
- Filter noisy browser console output: `| grep -E "\[workflow\]|Fatal error|Error:"`

### Adding a New Tool

1. Create the tool in `src/tools/`
2. Export from `src/tools/index.ts`
3. Add to `EnrichedSession` in `src/sdk/`
4. Register in MCP server (`src/mcp/`)
5. Update `skills/generate-workflow/SKILL.md` (tool reference tables)
6. Update `skills/improve-workflow/SKILL.md` (failure categories + available tools)
