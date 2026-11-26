/**
 * Outgoing mail, kept pluggable. OpenChar sends three kinds of message:
 * password resets, team invites, and whatever an extension adds.
 *
 * Delivery, in order of preference:
 *   1. a mailer an extension registered with setMailer() (the hosted
 *      service registers Amazon SES this way);
 *   2. MAIL_WEBHOOK_URL: a POST of the message as JSON to any endpoint you
 *      run (a small SMTP relay, a Slack hook, a support inbox);
 *   3. nothing configured: the message is written to the API log, so an
 *      operator can copy the link from `docker compose logs api`.
 */
export type Mail = {
  to: string
  subject: string
  text: string
  html?: string
  /** The one link the message exists to deliver, when there is one. */
  link?: string
}

export type Mailer = (mail: Mail) => Promise<void>

let registered: Mailer | null = null

export function setMailer(mailer: Mailer): void {
  registered = mailer
}

export function mailConfigured(): boolean {
  return !!registered || !!webhookUrl()
}

function webhookUrl(): string | undefined {
  // RESET_WEBHOOK_URL is the name older deployments used.
  return process.env.MAIL_WEBHOOK_URL || process.env.RESET_WEBHOOK_URL || undefined
}

export async function sendMail(mail: Mail): Promise<void> {
  try {
    if (registered) return await registered(mail)
    const url = webhookUrl()
    if (url) {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // email and link repeat to and link for receivers built against the
        // older reset-only webhook.
        body: JSON.stringify({ ...mail, email: mail.to }),
      })
      return
    }
    console.log(`[mail] no mailer configured; message for ${mail.to}: ${mail.subject}\n${mail.text}`)
  } catch (err) {
    console.error(`[mail] delivery to ${mail.to} failed:`, err)
  }
}
