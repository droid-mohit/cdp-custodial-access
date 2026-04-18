1# GEMINI.md - CDP Custodial Access

## Project Overview
CDP Custodial Access is a TypeScript SDK and Model Context Protocol (MCP) server for stealth browser automation via the Chrome DevTools Protocol (CDP). It provides tool-based, programmatic browser control with built-in anti-detection, automatic session persistence, and comprehensive audit trails.

### Core Technologies
- **Runtime**: Node.js (>=20.0.0)
- **Language**: TypeScript (ESM project)
- **Browser Automation**: Puppeteer (with `puppeteer-extra` and `puppeteer-extra-plugin-stealth`)
- **Protocol**: Model Context Protocol (MCP) for AI assistant integration
- **Testing**: Vitest

### Architecture
The project follows a layered monolith architecture with unidirectional dependency flow:
1. **CLI (`src/cli/`)**: Thin orchestrator for running workflows.
2. **MCP Server (`src/mcp/`)**: stdio transport server for tool registration.
3. **SDK (`src/sdk/`)**: `BrowserController` and `EnrichedSession` (wraps tools with tracing).
4. **Tools (`src/tools/`)**: Standalone, atomic functions for browser actions (navigate, click, etc.).
5. **Auth (`src/auth/`)**: Domain-specific login recipes.
6. **Core/Stealth (`src/core/`, `src/stealth/`)**: Manages browser sessions, profiles, and anti-detection patches.
7. **Puppeteer**: The underlying browser automation engine.

---

## Building and Running

### Development Commands
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode compilation
npx tsc --noEmit     # Type check without emitting
```

### Testing Commands
```bash
npm test             # Run all tests (unit, integration, stealth)
npm run test:unit    # Run unit tests only
npm run test:integration # Run integration tests
npm run test:stealth # Run stealth tests
npm run test:watch   # Run tests in watch mode
npx vitest run <path> # Run specific test file/directory
```

### Running the Application
```bash
npx cdp list                    # List available workflows
npx cdp info <workflow>         # View details and params for a workflow
npx cdp run <workflow> --headed # Run a workflow in a visible browser
npm run mcp                     # Start the MCP server
```

---

## Development Conventions

### Coding Style & Patterns
- **ESM Modules**: This is an ESM project (`"type": "module"`). All imports **MUST** use `.js` extensions (e.g., `import { x } from './utils.js'`).
- **Tool-Based Design**: Tools are standalone functions taking `(session, params)` and returning a `ToolResult<T>`. Tools **MUST NOT** throw; errors should be returned in the `ToolResult`.
- **EnrichedSession**: Use `session.enrich()` (via `BrowserController`) to get an `EnrichedSession`, which provides tool methods directly (e.g., `session.click()`) and handles automatic tracing.
- **Dependency Flow**: Respect the unidirectional dependency flow (CLI -> MCP -> SDK -> Tools -> Core). Avoid circular dependencies.

### Stealth & Anti-Detection
- **Stealth Levels**: Default is `none` (uses `puppeteer-extra-plugin-stealth` only), which is often best for aggressive bot detection (e.g., Cloudflare, ChatGPT). Higher levels (`basic`, `advanced`, `maximum`) add custom property and behavioral patches.
- **Viewport/Window Size**: Ensure `defaultViewport` matches `--window-size` launch arguments to avoid detection. `BrowserManager` handles this automatically.

### Session & Profile Management
- **Profiles**: Located at `~/.cdp-custodial-access/profiles/{workflow}/{profile}/`. Profiles persist browser state (cookies, local storage) and fingerprints.
- **Authentication**: Use `session.autoLogin()` which orchestrates checking sessions, loading credentials, and replaying login recipes. Credential files are stored at `~/.cdp-custodial-access/credentials/`.

### Audit Trails & Tracing
- **Automatic Tracing**: All tool calls in an `EnrichedSession` are traced to `~/.cdp-custodial-access/runs/`. Traces include screenshots, HTML snapshots, and timing.
- **Logging**: Use `session.tracer.log(message)` instead of `console.log()` to capture logs in the audit trail.
- **Network Tracing**: Optional HAR 1.2 capture is available via `--network-trace`.

### Workflow Development
- **Registration**: All workflows must be registered in `workflows/registry.json`.
- **Type**: Most workflows use `type: "SIMPLE"`, which are linear scripts located in `workflows/simple/`.
- **Interactivity**: Use `--headed` mode for initial setup (e.g., manual login) and subsequent runs in headless mode.

---

## Technical Details

### Key Types (`src/types.ts`)
- `ToolResult<T>`: Standard return type for all tool operations.
- `StealthLevel`: `none` | `basic` | `advanced` | `maximum`.
- `FingerprintProfile`: Persisted browser fingerprint configuration.

### Cloudflare & Challenges
- Navigation tools resolve on Cloudflare challenge pages. Always verify success by checking the page title or content after navigation.
- If a challenge is detected, suggest `--headed` mode for manual resolution.
