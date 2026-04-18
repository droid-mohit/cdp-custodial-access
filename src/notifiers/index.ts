import type { Notifier, NotifierConfig } from './types.js';
import { SlackNotifier } from './slack.js';
import { WebhookNotifier } from './webhook.js';

export function createNotifier(config: NotifierConfig): Notifier {
  if (config.type === 'slack') return new SlackNotifier(config.webhook);
  return new WebhookNotifier(config);
}
