import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrowserSession } from './browser-session.js';
import type { ToolResult } from '../types.js';
import type { NetworkTracer } from './network-tracer.js';

/** Tools that get an automatic screenshot after execution */
const SCREENSHOT_TOOLS = new Set([
  'navigate', 'search', 'goBack',
  'click', 'input', 'sendKeys',
  'selectDropdown', 'uploadFile',
]);

export type LogSource = 'workflow' | 'browser';
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  source: LogSource;
  level: LogLevel;
  message: string;
}

export interface TraceEntry {
  step: number;
  tool: string;
  params: Record<string, unknown>;
  result: {
    success: boolean;
    error?: string;
    errorCode?: string;
    dataKeys?: string[];
  };
  startedAt: string;
  completedAt: string;
  durationMs: number;
  pageUrl: string;
  pageTitle: string;
  screenshot?: string;
  html?: string;
  error?: string;
}

export interface TraceRunContext {
  headless: boolean;
  profile?: string;
  stealthLevel: string;
  locale?: string;
  timezone?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  startedAt: string;
}

export class Tracer {
  private entries: TraceEntry[] = [];
  private logs: LogEntry[] = [];
  private stepCounter = 0;
  private tracesDir: string | null = null;
  private runContext: TraceRunContext | null = null;
  private networkTracer: NetworkTracer | null = null;
  private muted = false;

  /** Link a NetworkTracer so its HAR is saved alongside trace.json */
  setNetworkTracer(tracer: NetworkTracer): void {
    this.networkTracer = tracer;
  }

  /** Set run-level context (headed/headless, profile, stealth, etc.) */
  setRunContext(context: TraceRunContext): void {
    this.runContext = context;
  }

  /** Suppress console output (logs still captured in trace). Use during interactive prompts. */
  mute(): void { this.muted = true; }

  /** Resume console output. */
  unmute(): void { this.muted = false; }

  /**
   * Log a message and store it in the trace. Also prints to stdout/stderr
   * so the caller sees output in real time.
   */
  log(message: string, options?: { source?: LogSource; level?: LogLevel }): void {
    const source = options?.source ?? 'workflow';
    const level = options?.level ?? 'info';
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      source,
      level,
      message,
    };
    this.logs.push(entry);

    // Skip console output when muted (e.g., during interactive prompts)
    if (this.muted) return;

    // Tee to console so the user still sees real-time output
    const prefix = source === 'browser' ? '[browser]' : '';
    const line = prefix ? `${prefix} ${message}` : message;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  /** Get all log entries collected so far */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Set the output directory for trace artifacts (screenshots, HTML).
   * Must be called before any tool calls if you want artifacts saved to disk.
   * If not set, trace entries are still collected in memory but no files are written.
   */
  setOutputDir(runOutputDir: string): void {
    this.tracesDir = path.join(runOutputDir, 'traces');
    fs.mkdirSync(this.tracesDir, { recursive: true });
  }

  /**
   * Wrap a tool call with tracing. Captures params, result, timing,
   * page state, screenshot, and HTML snapshot.
   */
  async record<T>(
    toolName: string,
    params: unknown,
    session: BrowserSession,
    execute: () => Promise<ToolResult<T>>,
  ): Promise<ToolResult<T>> {
    this.stepCounter++;
    const step = this.stepCounter;
    const stepPrefix = `step-${String(step).padStart(3, '0')}-${toolName}`;
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Execute the tool
    const result = await execute();

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    // Capture page state
    let pageUrl = '';
    let pageTitle = '';
    try {
      const page = await session.page();
      pageUrl = page.url();
      pageTitle = await page.title();
    } catch {
      // Session may be closed (e.g., after closeTab of last tab)
    }

    // Build trace entry
    const entry: TraceEntry = {
      step,
      tool: toolName,
      params: sanitizeParams(params as Record<string, unknown> ?? {}),
      result: {
        success: result.success,
        error: result.error,
        errorCode: result.errorCode,
        dataKeys: result.data ? Object.keys(result.data as Record<string, unknown>) : undefined,
      },
      startedAt,
      completedAt,
      durationMs,
      pageUrl,
      pageTitle,
    };

    if (result.error) {
      entry.error = result.error;
    }

    // Capture artifacts if output dir is set
    if (this.tracesDir) {
      try {
        const page = await session.page();

        // HTML snapshot on every step
        const html = await page.content();
        const htmlFile = `${stepPrefix}.html`;
        fs.writeFileSync(path.join(this.tracesDir, htmlFile), html, 'utf-8');
        entry.html = htmlFile;

        // Screenshot: on applicable tools OR on any error
        const shouldScreenshot = SCREENSHOT_TOOLS.has(toolName) || !result.success;
        if (shouldScreenshot) {
          const buffer = await page.screenshot({ fullPage: false, encoding: 'binary' });
          const pngFile = `${stepPrefix}.png`;
          fs.writeFileSync(path.join(this.tracesDir, pngFile), Buffer.from(buffer));
          entry.screenshot = pngFile;
        }
      } catch {
        // Page may not be available (tab closed, etc.) — skip artifacts
      }
    }

    this.entries.push(entry);
    return result;
  }

  /** Get all trace entries collected so far */
  getEntries(): TraceEntry[] {
    return [...this.entries];
  }

  /** Save the trace.json summary to the traces directory */
  save(): void {
    if (!this.tracesDir) return;
    const output = {
      context: this.runContext,
      steps: this.entries,
      logs: this.logs,
    };
    fs.writeFileSync(
      path.join(this.tracesDir, 'trace.json'),
      JSON.stringify(output, null, 2),
      'utf-8',
    );

    // Save network HAR if network tracing is active
    if (this.networkTracer) {
      this.networkTracer.save(this.tracesDir);
    }
  }

  /** Total number of steps recorded */
  get stepCount(): number {
    return this.stepCounter;
  }

  /** Get the traces directory path (null if not set) */
  getTracesDir(): string | null {
    return this.tracesDir;
  }
}

/** Remove potentially sensitive values from params for logging */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
      sanitized[key] = '***';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
