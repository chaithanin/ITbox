/**
 * Email notification channel (SMTP via nodemailer).
 * Active only when SMTP_HOST is configured; otherwise all sends are no-ops
 * returning false. Never include secret values in email content.
 */
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export function emailEnabled(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  text: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return true;
  } catch (e) {
    // Never log message content — recipients/subjects may reference secrets' names only
    console.error("email send failed", (e as Error).message);
    return false;
  }
}
