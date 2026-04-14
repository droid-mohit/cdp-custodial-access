# CDP Custodial Access

Automate any website with a real browser — stealth built in, audit trails included.

## What It Does

- **Browse like a human** — clicks, types, and scrolls with realistic mouse movements and typing delays
- **Stay undetected** — built-in stealth defeats bot detection on sites like ChatGPT, LinkedIn, and Cloudflare-protected pages
- **Remember sessions** — login once, and cookies persist across runs automatically
- **Full audit trail** — every action is recorded with screenshots, HTML snapshots, and timing

## Three Ways to Use It

### 1. CLI (no coding required)

Run pre-built workflows by name:

```bash
# See what's available
cdp list

# Learn about a workflow's options
cdp info archive-site

# Run it
cdp run archive-site --url https://docs.example.com
cdp run example --headed
```

### 2. AI Assistant (via MCP)

Connect to Claude Desktop, ChatGPT, or any MCP-compatible AI and control the browser through conversation:

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

### 3. TypeScript SDK (for developers)

```typescript
import { BrowserController } from 'cdp-custodial-access';

const controller = new BrowserController();
const session = await controller.launch({ workflow: 'my-app', headless: false });

await session.navigate({ url: 'https://example.com' });
await session.click({ selector: '#login-button' });
await session.input({ selector: '#email', text: 'user@example.com' });

const content = await session.getPageContent();
console.log(content.data?.text);

await session.close({ persist: true });
```

## Getting Started

### Install

```bash
npm install cdp-custodial-access
```

This adds the `cdp` command to your project. Run it with `npx`:

```bash
npx cdp list                    # See available workflows
npx cdp run example --headed    # Run one with a visible browser
```

### Install globally (optional)

To use `cdp` without `npx`:

```bash
npm install -g cdp-custodial-access
cdp list
cdp run example --headed
```

> **macOS/Linux permission error?** Use `sudo npm install -g cdp-custodial-access` or [fix npm permissions](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

### From source

```bash
git clone https://github.com/mohit-goyal/cdp-custodial-access.git
cd cdp-custodial-access
npm install && npm run build
npm link          # Makes 'cdp' available as a command
```

## Built-in Workflows

| Workflow | What it does | Example |
|----------|-------------|---------|
| `example` | Asks ChatGPT about AI trends and saves the response | `cdp run example --headed` |
| `linkedin-feed` | Extracts your LinkedIn feed into a text file | `cdp run linkedin-feed --headed` |
| `archive-site` | Crawls a website and saves it as a single PDF | `cdp run archive-site --url https://docs.example.com` |

Use `cdp info <workflow>` to see all available options for any workflow.

## Creating Workflows

You can create new workflows without writing code — describe what you want in plain English using Claude Code:

```
/create-workflow Go to Google News, search for "AI breakthroughs", extract the top 10 headlines
```

This generates the workflow, runs it, and automatically fixes issues like wrong selectors or timing problems (up to 5 attempts).

Other workflow commands:

| Command | What it does |
|---------|-------------|
| `/generate-workflow <description>` | Quick single-pass generation (you debug manually) |
| `/create-workflow <description>` | Self-healing generation (auto-fixes issues) |
| `/validate-workflow <name>` | Run a workflow and report if it's working correctly |
| `/improve-workflow <name>` | Analyze past runs to diagnose and fix failures |

## Audit Trails

Every workflow run is automatically recorded:

```
~/.cdp-custodial-access/runs/{workflow}/{date}/{time}/
  traces/
    trace.json            # What happened at each step
    step-001-navigate.png # Screenshot after navigation
    step-002-click.png    # Screenshot after click
    ...
  metadata.json           # Run summary (duration, success, files)
```

## Authentication

Sites that require login (LinkedIn, ChatGPT, etc.) work through persistent browser profiles:

1. First run: use `--headed` to log in manually in the browser window
2. Subsequent runs: cookies are loaded automatically — no login needed

```bash
cdp run linkedin-feed --headed    # First time: log in manually
cdp run linkedin-feed             # After that: runs headless automatically
```

## Available Browser Tools

23 tools organized by what they do:

| Category | Tools |
|----------|-------|
| **Navigate** | `navigate`, `search`, `goBack`, `wait` |
| **Interact** | `click`, `input`, `scroll`, `sendKeys`, `findText`, `uploadFile` |
| **Forms** | `getDropdownOptions`, `selectDropdown` |
| **Extract** | `extract`, `screenshot`, `getPageContent`, `llmExtract` |
| **Tabs** | `listTabs`, `switchTab`, `closeTab` |
| **Auth** | `checkLogin`, `waitForLogin`, `exportCookies`, `importCookies` |
| **Site Discovery** | `fetchSitemap`, `fetchRobots` |

## Architecture & Development

See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details including project structure, stealth internals, SDK patterns, and development setup.

## License

MIT
