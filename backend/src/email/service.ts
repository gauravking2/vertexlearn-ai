import { getConfig } from '../config';
import { logger } from '../logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  delivered: boolean;
  provider: string;
  messageId?: string;
  reason?: string;
}

/**
 * Email service abstraction (Phase 5).
 *
 * Provider is selected by env var NAMES only (see .env.example):
 *   EMAIL_PROVIDER = mock | console | smtp | sendgrid | <unset>
 *   EMAIL_FROM, SMTP_HOST/PORT/USER/PASS, SENDGRID_API_KEY
 *
 * - `mock` (default in tests): records messages in memory, never sends.
 * - `console`: logs to structured logger, reports delivered=false with reason.
 * - unset/unknown: reports delivered=false with reason "email-provider-unconfigured".
 * - smtp/sendgrid: NOT wired to a paid SDK in this phase; they report
 *   delivered=false with an explicit reason instead of fabricating success.
 */
const outbox: EmailMessage[] = [];

export function getEmailOutbox(): EmailMessage[] {
  return outbox;
}

export function clearEmailOutbox(): void {
  outbox.length = 0;
}

export function emailProviderName(): string {
  return getConfig().EMAIL_PROVIDER || 'unconfigured';
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = emailProviderName();
  if (process.env.NODE_ENV === 'test' || provider === 'mock') {
    outbox.push(message);
    return { delivered: true, provider: 'mock', messageId: `mock-${outbox.length}` };
  }
  if (provider === 'console') {
    logger.info({ to: message.to, subject: message.subject }, 'email (console provider, not delivered)');
    return { delivered: false, provider, reason: 'console-provider-does-not-deliver' };
  }
  if (!provider || provider === 'unconfigured') {
    return { delivered: false, provider: 'unconfigured', reason: 'email-provider-unconfigured' };
  }
  // smtp / sendgrid / resend etc. are intentionally not auto-wired in Phase 5.
  return { delivered: false, provider, reason: 'email-provider-not-configured-for-delivery' };
}
