# CDP Custodial Access

A TypeScript SDK and MCP server for stealth browser automation via Chrome DevTools Protocol. Provides tool-based, programmatic browser control with anti-detection built in.

## Features

- **Stealth browsing** — `puppeteer-extra-plugin-stealth` with optional fingerprint randomization (WebGL, Canvas, AudioContext, fonts)
- **Human-like interaction** — Bezier curve mouse movement, Gaussian typing delays, momentum scrolling
- **Persistent profiles** — Browser sessions persist cookies, localStorage, and fingerprints across runs
- **Audit trails** — Every tool call is traced with screenshots, HTML snapshots, timing, and page state
- **LLM extraction** — Extract structured data from visited pages using OpenAI, Anthropic, or AWS Bedrock with JSON schema output
- **23 browser tools** — Navigate, click, type, scroll, extract, screenshot, tab management, LLM extract, and more
- **MCP server** — Expose all tools to LLM agents via stdio transport
- **Workflow engine** — Define browser automations as TypeScript scripts with built-in output management
- **Website archiver** — Crawl a site 1 level deep and generate a merged PDF

## Quick Start

```bash
npm install
npm run build
```

### SDK Usage

```typescript
import { BrowserController } from 'cdp-custodial-access';

const controller = new BrowserController();
const session = await controller.launch({
  workflow: 'my-app',      // profile namespace
  headless: false,
});

await session.navigate({ url: 'https://example.com' });
await session.click({ selector: '#login-button' });
await session.input({ selector: '#email', text: 'user@example.com' });

const content = await session.getPageContent();
console.log(content.data?.text);

// Persist cookies/localStorage for next run, then close
await session.close({ persist: true });
```

### MCP Server

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["cdp-custodial-access"]
    }
  }
}
```

### Workflows

Workflows are standalone TypeScript scripts that automate browser tasks:

```bash
npx tsx workflows/example.ts --headed
```

Generate a new workflow from a plain English description:

```
/generate-workflow Go to Google News, search for "AI breakthroughs", extract the top 10 headlines
```

Debug a workflow using its audit traces:

```
/improve-workflow example --runs 3
```

## Available Tools

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `search`, `goBack`, `wait` |
| **Interaction** | `click`, `input`, `scroll`, `sendKeys`, `findText`, `uploadFile` |
| **Forms** | `getDropdownOptions`, `selectDropdown` |
| **Extraction** | `extract`, `screenshot`, `getPageContent` |
| **LLM** | `llmExtract` |
| **Tabs** | `listTabs`, `switchTab`, `closeTab` |
| **Files** | `writeFile`, `readFile` |
| **Task** | `done` |

All tools return `ToolResult<T>` with `success`, `data`, `error`, and `errorCode` fields. Tools never throw.

### LLM Extract

Extract structured data from pages visited during a workflow using an LLM:

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
  selector: '.product-card',  // optional: narrow to specific elements
});
```

Supports OpenAI, Anthropic, and AWS Bedrock. Auto-cleans HTML (strips scripts/styles/nav), chunks across context limits, and merges partial results.

## Stealth Levels

| Level | What it does |
|-------|-------------|
| `none` (default) | `puppeteer-extra-plugin-stealth` only. Best for sites with aggressive bot detection. |
| `basic` | Adds custom property patches (webdriver, chrome.runtime, plugins, permissions) |
| `advanced` | Adds behavioral stealth (mouse/typing/scroll) and TLS fingerprinting |
| `maximum` | Adds fingerprint randomization (WebGL, Canvas, AudioContext, fonts) |

## Profiles

Profiles are namespaced per workflow. Each workflow gets its own isolated browser identity that persists cookies, localStorage, cache, and fingerprint across runs.

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

```typescript
// Uses 'default' profile — persists across runs
await controller.launch({ workflow: 'my-app' });

// Uses a named profile
await controller.launch({ workflow: 'my-app', profile: 'logged-in' });

// Manage profiles programmatically
const pm = controller.getProfileManager();
pm.listWorkflows();                          // ['my-app', ...]
pm.listProfiles('my-app');                   // ['default', 'logged-in']
pm.deleteProfile('my-app', 'default');       // Reset to fresh state
```

## Audit Trails

Every tool call is automatically traced. Set up the tracer in your workflow:

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
  page.html                 # Workflow output
  metadata.json             # Run metadata
```

## Built-in Workflows

| Workflow | Description | Usage |
|----------|-------------|-------|
| `example` | Query ChatGPT and save the response HTML | `npx tsx workflows/example.ts --headed` |
| `yahoo-finance-stocks` | Extract trending stock data from Yahoo Finance | `npx tsx workflows/yahoo-finance-stocks.ts` |
| `archive-site` | Crawl a site 1 level deep, merge all pages into a single PDF | `npx tsx workflows/archive-site.ts <url> [--max-pages N]` |

## Project Structure

```
src/
  core/       # BrowserManager, BrowserSession, ProfileManager, Tracer
  stealth/    # StealthManager, patches (property, fingerprint, behavioral, network)
  tools/      # Browser tools (navigation, interaction, forms, extraction, tabs, files, llm-extract)
  llm/        # LLM abstraction layer (factory, OpenAI/Anthropic/Bedrock clients, text processing)
  sdk/        # BrowserController, EnrichedSession
  mcp/        # MCP server with stdio transport
workflows/    # Standalone automation scripts
skills/       # Claude Code skills (generate-workflow, improve-workflow)
```

## Development

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode
npx tsc --noEmit      # Type check
```
