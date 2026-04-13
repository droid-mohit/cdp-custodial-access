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

export interface BrowserControllerConfig {
  stealth?: SessionConfig['stealth'];
  profileDir?: string;
  defaultTimeout?: number;
  screenshotOnError?: boolean;
}

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
}

function enrichSession(session: BrowserSession): EnrichedSession {
  const enriched = session as EnrichedSession;
  enriched.navigate = (params) => navTools.navigate(session, params);
  enriched.search = (params) => navTools.search(session, params);
  enriched.goBack = () => navTools.goBack(session);
  enriched.wait = (params) => navTools.waitTool(session, params);
  enriched.click = (params) => interactionTools.click(session, params);
  enriched.input = (params) => interactionTools.input(session, params);
  enriched.scroll = (params) => interactionTools.scroll(session, params);
  enriched.sendKeys = (params) => interactionTools.sendKeys(session, params);
  enriched.findText = (params) => interactionTools.findText(session, params);
  enriched.uploadFile = (params) => interactionTools.uploadFile(session, params);
  enriched.getDropdownOptions = (params) => formTools.getDropdownOptions(session, params);
  enriched.selectDropdown = (params) => formTools.selectDropdown(session, params);
  enriched.extract = (params) => extractionTools.extract(session, params);
  enriched.screenshot = (params) => extractionTools.screenshot(session, params);
  enriched.getPageContent = () => extractionTools.getPageContent(session);
  enriched.listTabs = () => tabTools.listTabs(session);
  enriched.switchTab = (params) => tabTools.switchTab(session, params);
  enriched.closeTab = (params) => tabTools.closeTab(session, params);
  enriched.done = (params) => doneTools.done(params);
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
