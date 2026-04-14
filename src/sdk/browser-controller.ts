import { BrowserManager } from '../core/browser-manager.js';
import { BrowserSession } from '../core/browser-session.js';
import type { SessionConfig, LaunchConfig, ConnectConfig } from '../core/types.js';
import type { ToolResult } from '../types.js';
import * as navTools from '../tools/navigation.js';
import * as interactionTools from '../tools/interaction.js';
import * as formTools from '../tools/forms.js';
import * as extractionTools from '../tools/extraction.js';
import * as tabTools from '../tools/tabs.js';
import * as fileTools from '../tools/files.js';
import * as doneTools from '../tools/done.js';
import * as llmExtractTools from '../tools/llm-extract.js';
import * as authTools from '../tools/session-auth.js';
import * as autoLoginTools from '../tools/auto-login.js';

export interface BrowserControllerConfig {
  stealth?: SessionConfig['stealth'];
  profileDir?: string;
  defaultTimeout?: number;
  screenshotOnError?: boolean;
}

export type { Tracer } from '../core/tracer.js';

// Define the enriched session type with tool methods
export interface EnrichedSession extends BrowserSession {
  navigate(params: navTools.NavigateParams): Promise<ToolResult<navTools.NavigateResult>>;
  search(params: navTools.SearchParams): Promise<ToolResult<navTools.NavigateResult>>;
  goBack(): Promise<ToolResult<navTools.NavigateResult>>;
  wait(params: navTools.WaitParams): Promise<ToolResult<void>>;
  click(params: interactionTools.ClickParams): Promise<ToolResult<any>>;
  input(params: interactionTools.InputParams): Promise<ToolResult<void>>;
  scroll(params: interactionTools.ScrollParams): Promise<ToolResult<void>>;
  sendKeys(params: interactionTools.SendKeysParams): Promise<ToolResult<void>>;
  findText(params: interactionTools.FindTextParams): Promise<ToolResult<interactionTools.FindTextResult>>;
  uploadFile(params: interactionTools.UploadFileParams): Promise<ToolResult<void>>;
  getDropdownOptions(params: formTools.GetDropdownOptionsParams): Promise<ToolResult<formTools.DropdownOption[]>>;
  selectDropdown(params: formTools.SelectDropdownParams): Promise<ToolResult<void>>;
  extract(params: extractionTools.ExtractParams): Promise<ToolResult<extractionTools.ExtractResult>>;
  screenshot(params: extractionTools.ScreenshotParams): Promise<ToolResult<extractionTools.ScreenshotResult>>;
  getPageContent(): Promise<ToolResult<extractionTools.GetPageContentResult>>;
  listTabs(): Promise<ToolResult<tabTools.ListTabsResult>>;
  switchTab(params: tabTools.SwitchTabParams): Promise<ToolResult<tabTools.TabInfo>>;
  closeTab(params: tabTools.CloseTabParams): Promise<ToolResult<void>>;
  done(params: doneTools.DoneParams): Promise<ToolResult<doneTools.DoneResult>>;
  llmExtract(params: llmExtractTools.LLMExtractParams): Promise<ToolResult<llmExtractTools.LLMExtractResult>>;
  checkLogin(params: authTools.CheckLoginParams): Promise<ToolResult<authTools.CheckLoginResult>>;
  waitForLogin(params: authTools.WaitForLoginParams): Promise<ToolResult<authTools.WaitForLoginResult>>;
  exportCookies(params?: authTools.ExportCookiesParams): Promise<ToolResult<authTools.ExportCookiesResult>>;
  importCookies(params: authTools.ImportCookiesParams): Promise<ToolResult<authTools.ImportCookiesResult>>;
  autoLogin(params: autoLoginTools.AutoLoginParams): Promise<ToolResult<autoLoginTools.AutoLoginResult>>;
  promptCredentialSave(params: autoLoginTools.PromptCredentialSaveParams): Promise<ToolResult<void>>;
}

function enrichSession(session: BrowserSession): EnrichedSession {
  const enriched = session as EnrichedSession;
  const t = session.tracer;

  // Wrap each tool through the tracer for automatic audit trails
  enriched.navigate = (params) =>
    t.record('navigate', params, session, () => navTools.navigate(session, params));
  enriched.search = (params) =>
    t.record('search', params, session, () => navTools.search(session, params));
  enriched.goBack = () =>
    t.record('goBack', {}, session, () => navTools.goBack(session));
  enriched.wait = (params) =>
    t.record('wait', params, session, () => navTools.waitTool(session, params));
  enriched.click = (params) =>
    t.record('click', params, session, () => interactionTools.click(session, params));
  enriched.input = (params) =>
    t.record('input', params, session, () => interactionTools.input(session, params));
  enriched.scroll = (params) =>
    t.record('scroll', params, session, () => interactionTools.scroll(session, params));
  enriched.sendKeys = (params) =>
    t.record('sendKeys', params, session, () => interactionTools.sendKeys(session, params));
  enriched.findText = (params) =>
    t.record('findText', params, session, () => interactionTools.findText(session, params));
  enriched.uploadFile = (params) =>
    t.record('uploadFile', params, session, () => interactionTools.uploadFile(session, params));
  enriched.getDropdownOptions = (params) =>
    t.record('getDropdownOptions', params, session, () => formTools.getDropdownOptions(session, params));
  enriched.selectDropdown = (params) =>
    t.record('selectDropdown', params, session, () => formTools.selectDropdown(session, params));
  enriched.extract = (params) =>
    t.record('extract', params, session, () => extractionTools.extract(session, params));
  enriched.screenshot = (params) =>
    t.record('screenshot', params, session, () => extractionTools.screenshot(session, params));
  enriched.getPageContent = () =>
    t.record('getPageContent', {}, session, () => extractionTools.getPageContent(session));
  enriched.listTabs = () =>
    t.record('listTabs', {}, session, () => tabTools.listTabs(session));
  enriched.switchTab = (params) =>
    t.record('switchTab', params, session, () => tabTools.switchTab(session, params));
  enriched.closeTab = (params) =>
    t.record('closeTab', params, session, () => tabTools.closeTab(session, params));
  enriched.done = (params) =>
    t.record('done', params, session, () => doneTools.done(params));
  enriched.llmExtract = (params) =>
    t.record('llmExtract', { instruction: params.instruction, selector: params.selector }, session, () => llmExtractTools.llmExtract(session, params));
  enriched.checkLogin = (params) =>
    t.record('checkLogin', params, session, () => authTools.checkLogin(session, params));
  enriched.waitForLogin = (params) =>
    t.record('waitForLogin', params, session, () => authTools.waitForLogin(session, params));
  enriched.exportCookies = (params) =>
    t.record('exportCookies', params ?? {}, session, () => authTools.exportCookies(session, params));
  enriched.importCookies = (params) =>
    t.record('importCookies', { count: params.cookies.length }, session, () => authTools.importCookies(session, params));
  enriched.autoLogin = (params) =>
    t.record('autoLogin', params, session, () => autoLoginTools.autoLogin(session, params));
  enriched.promptCredentialSave = (params) =>
    t.record('promptCredentialSave', params, session, () => autoLoginTools.promptCredentialSave(session, params));
  return enriched;
}

export class BrowserController {
  private readonly manager: BrowserManager;
  private readonly sessions: Map<string, EnrichedSession> = new Map();

  constructor(config?: BrowserControllerConfig) {
    this.manager = new BrowserManager({
      stealth: config?.stealth ?? { level: 'none' },
      profileDir: config?.profileDir ?? '~/.cdp-custodial/profiles',
      defaultTimeout: config?.defaultTimeout ?? 30000,
      screenshotOnError: config?.screenshotOnError ?? true,
    });
  }

  async launch(config: LaunchConfig = {}): Promise<EnrichedSession> {
    const session = await this.manager.launch(config);
    const enriched = enrichSession(session);
    this.sessions.set(session.id, enriched);
    return enriched;
  }

  async connect(config: ConnectConfig): Promise<EnrichedSession> {
    const session = await this.manager.connect(config);
    const enriched = enrichSession(session);
    this.sessions.set(session.id, enriched);
    return enriched;
  }

  getSessions(): EnrichedSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): EnrichedSession | undefined {
    return this.sessions.get(id);
  }

  async closeSession(id: string, options?: { persist?: boolean }): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.close(options);
      this.sessions.delete(id);
    }
  }

  getProfileManager() {
    return this.manager.getProfileManager();
  }
}
