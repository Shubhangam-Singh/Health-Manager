import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email behind an INTERFACE, so the provider is swappable. Moving to SendGrid
 * or SES means writing one more implementation of this type -- no service or
 * worker code changes.
 */
export type Email = { to: string; subject: string; html: string; text: string };

export interface EmailSender {
  send(email: Email): Promise<void>;
  describe(): string;
}

/** Real delivery over Gmail SMTP using an App Password (not a Google password). */
class SmtpSender implements EmailSender {
  private transporter: Transporter;
  constructor(private user: string, pass: string, private from: string) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  async send(email: Email) {
    await this.transporter.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }
  describe() { return `gmail smtp as ${this.user}`; }
}

/**
 * Development fallback: prints instead of sending. Used when SMTP credentials
 * are absent. It is deliberately loud about not being real, because a silent
 * no-op that reports success is how you ship a system that never emails
 * anyone.
 */
class ConsoleSender implements EmailSender {
  async send(email: Email) {
    console.log(
      `\n──── EMAIL (NOT SENT — no SMTP credentials configured) ────\n` +
      `to:      ${email.to}\nsubject: ${email.subject}\n\n${email.text}\n` +
      `──────────────────────────────────────────────────────────\n`,
    );
  }
  describe() { return "console (no SMTP credentials configured)"; }
}

let cached: EmailSender | null = null;

export function getMailer(): EmailSender {
  if (cached) return cached;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.MAIL_FROM || (user ? `Healthcare Portal <${user}>` : "");

  cached = user && pass ? new SmtpSender(user, pass, from) : new ConsoleSender();
  return cached;
}
