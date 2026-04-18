import crypto from 'node:crypto';
import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';
import { InterventionServer } from '../intervention/server.js';
import { createTunnel } from '../tunnel/index.js';
import { createNotifier } from '../notifiers/index.js';
import type { TunnelConfig, TunnelErrorCode } from '../tunnel/types.js';
import { TunnelError } from '../tunnel/types.js';
import type { NotifierConfig } from '../notifiers/types.js';

export interface StreamQualityPreset {
  format: 'jpeg';
  quality: number;
  maxWidth: number;
  maxHeight: number;
  everyNthFrame: number;
}

export const QUALITY_PRESETS: Record<string, StreamQualityPreset> = {
  low:    { format: 'jpeg', quality: 50, maxWidth: 1024, maxHeight: 768,  everyNthFrame: 3 },
  medium: { format: 'jpeg', quality: 70, maxWidth: 1280, maxHeight: 960,  everyNthFrame: 2 },
  high:   { format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1440, everyNthFrame: 1 },
};

export interface HumanInterventionParams {
  reason: string;
  timeoutMs?: number;
  tunnel?: TunnelConfig;
  notifier?: NotifierConfig | null;
  streamQuality?: 'low' | 'medium' | 'high';
  allowNavigation?: boolean;
}

export interface InterventionResult {
  status: 'completed' | 'timeout' | 'aborted' | 'tunnel_lost' | 'session_lost';
  durationMs: number;
  operatorConnectedAt?: Date;
}

export interface HumanInterventionHandle {
  interventionId: string;
  url: string;
  tunnelUrl: string;
  expiresAt: Date;
  waitForCompletion(): Promise<InterventionResult>;
  abort(reason?: string): Promise<void>;
}

const TUNNEL_CODE_MAP: Record<TunnelErrorCode, ToolErrorCode> = {
  DEPENDENCY_MISSING: ToolErrorCode.TUNNEL_DEPENDENCY_MISSING,
  AUTH_FAILED:        ToolErrorCode.TUNNEL_AUTH_FAILED,
  UNAVAILABLE:        ToolErrorCode.TUNNEL_UNAVAILABLE,
  CUSTOM_FAILED:      ToolErrorCode.TUNNEL_CUSTOM_FAILED,
};

export async function requestHumanIntervention(
  session: BrowserSession,
  params: HumanInterventionParams,
): Promise<ToolResult<HumanInterventionHandle>> {
  const interventionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const timeoutMs = params.timeoutMs ?? 900_000;
  const quality = QUALITY_PRESETS[params.streamQuality ?? 'medium'];

  const page = await session.page();
  const cdpSession = await page.createCDPSession();

  const server = new InterventionServer({
    page,
    cdpSession,
    token,
    allowNavigation: params.allowNavigation ?? false,
    quality,
  });

  let port: number;
  try {
    ({ port } = await server.start());
  } catch {
    return {
      success: false,
      error: 'Could not bind a local port for intervention.',
      errorCode: ToolErrorCode.INTERVENTION_PORT_EXHAUSTED,
    };
  }

  const tunnel = createTunnel(params.tunnel ?? { type: 'ngrok' });
  let publicUrl: string;
  try {
    ({ publicUrl } = await tunnel.expose(port));
  } catch (err) {
    await server.stop();
    if (err instanceof TunnelError) {
      return { success: false, error: err.message, errorCode: TUNNEL_CODE_MAP[err.code] };
    }
    return { success: false, error: String(err), errorCode: ToolErrorCode.TUNNEL_UNAVAILABLE };
  }

  const url = `${publicUrl}/?t=${token}`;
  const expiresAt = new Date(Date.now() + (timeoutMs > 0 ? timeoutMs : 24 * 60 * 60 * 1000));

  if (params.notifier) {
    try {
      await createNotifier(params.notifier).notify({ url, reason: params.reason, expiresAt });
    } catch (err) {
      session.tracer.log(`[intervention] Notifier failed (non-fatal): ${(err as Error).message}`);
    }
  }

  const handle: HumanInterventionHandle = {
    interventionId,
    url,
    tunnelUrl: publicUrl,
    expiresAt,

    async waitForCompletion(): Promise<InterventionResult> {
      const startedAt = Date.now();
      try {
        const serverDone = new Promise<InterventionResult>(resolve => {
          server.onComplete(({ status }) => {
            resolve({
              status: status as InterventionResult['status'],
              durationMs: Date.now() - startedAt,
              operatorConnectedAt: server.operatorConnectedAt ?? undefined,
            });
          });
        });

        const timeoutPromise: Promise<InterventionResult> = timeoutMs > 0
          ? new Promise(resolve =>
              setTimeout(() =>
                resolve({
                  status: 'timeout',
                  durationMs: Date.now() - startedAt,
                  operatorConnectedAt: server.operatorConnectedAt ?? undefined,
                }),
                timeoutMs,
              ),
            )
          : new Promise(() => {}); // never resolves when timeoutMs === 0

        return await Promise.race([serverDone, timeoutPromise]);
      } finally {
        await (cdpSession as any).send('Page.stopScreencast').catch(() => {});
        await server.stop();
        await tunnel.close();
      }
    },

    async abort(reason?: string): Promise<void> {
      server.abort(reason);
    },
  };

  return { success: true, data: handle };
}
