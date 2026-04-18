export interface NotifyOptions {
  url: string;
  reason: string;
  expiresAt: Date;
}

export interface Notifier {
  notify(opts: NotifyOptions): Promise<void>;
}

export interface SlackNotifierConfig {
  type: 'slack';
  webhook: string;
}

export interface WebhookNotifierConfig {
  type: 'webhook';
  url: string;
  headers?: Record<string, string>;
}

export type NotifierConfig = SlackNotifierConfig | WebhookNotifierConfig;
