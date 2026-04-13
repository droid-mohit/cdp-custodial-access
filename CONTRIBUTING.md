# Contributing

Thanks for your interest in contributing to CDP Custodial Access!

## Getting Started

```bash
git clone https://github.com/mohit-goyal/cdp-custodial-access.git
cd cdp-custodial-access
npm install
npm test
```

## Development

- **Build:** `npm run build`
- **Test:** `npm test` (unit tests), `npm run test:integration` (requires Chrome)
- **Type check:** `npx tsc --noEmit`
- **Watch:** `npm run test:watch`

## Project Conventions

- **ESM** — `"type": "module"`, all imports use `.js` extensions
- **Tools never throw** — return `{ success: false, errorCode }` instead
- **Stealth default is `none`** — only `puppeteer-extra-plugin-stealth`, no custom patches
- **Workflows vs tools** — atomic operations go in `src/tools/`, multi-step use cases go in `workflows/`
- **Audit trails are mandatory** — every tool call is traced automatically

## Adding a New Tool

1. Create `src/tools/{tool-name}.ts` with the tool function
2. Export from `src/tools/index.ts`
3. Add to `EnrichedSession` interface in `src/sdk/browser-controller.ts`
4. Wire through the tracer in `enrichSession()`
5. Add tests in `tests/unit/tools/{tool-name}.test.ts`
6. Register in MCP server if applicable (`src/mcp/server.ts`)

## Adding a New Workflow

1. Create `workflows/{name}.ts` following the template in `skills/generate-workflow/SKILL.md`
2. Include `@prompt` tag with the use case description
3. Set up tracer: `session.tracer.setOutputDir(outputDir)`
4. Save traces in the `finally` block

## Pull Requests

- Create a feature branch from `main`
- Include tests for new functionality
- Ensure `npx tsc --noEmit` passes with no errors
- Ensure `npm test` passes
- Keep PRs focused — one feature or fix per PR
