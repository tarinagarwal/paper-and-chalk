import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/env";

import type { EmailContent } from "./templates";

export interface OutgoingEmail extends EmailContent {
  to: string;
  /** Logged by the console and outbox deliveries, so developers can click through. */
  link?: string;
}

const cache = globalThis as typeof globalThis & { __pcSmtp?: Transporter };

function smtp(): Transporter {
  cache.__pcSmtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return cache.__pcSmtp;
}

/**
 * Sends an email the way EMAIL_DELIVERY says:
 * - console: print it (local development default)
 * - outbox: write it as JSON to EMAIL_OUTBOX_DIR (end-to-end tests read it back)
 * - smtp: send it (required in staging and production)
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  switch (env.EMAIL_DELIVERY) {
    case "smtp": {
      await smtp().sendMail({
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return;
    }
    case "outbox": {
      await mkdir(env.EMAIL_OUTBOX_DIR, { recursive: true });
      const file = `${String(Date.now())}-${email.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`;
      await writeFile(
        join(env.EMAIL_OUTBOX_DIR, file),
        JSON.stringify({ ...email, sentAt: new Date().toISOString() }, null, 2),
      );
      return;
    }
    case "console": {
      console.info(
        [
          "",
          "┌─ Email (EMAIL_DELIVERY=console) ─────────────────────────────",
          `│ To:      ${email.to}`,
          `│ Subject: ${email.subject}`,
          ...(email.link ? [`│ Link:    ${email.link}`] : []),
          "└──────────────────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );
      return;
    }
  }
}
