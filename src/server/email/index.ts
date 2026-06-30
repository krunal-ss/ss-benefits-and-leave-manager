// Resend email. Lazily constructed; callers should also write an emailLog row.
import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";

let cached: Resend | null = null;

function getResend(): Resend {
  if (cached) return cached;
  const key = getEnv().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  cached = new Resend(key);
  return cached;
}

export async function sendEmail(params: { to: string | string[]; subject: string; html: string }) {
  const env = getEnv();
  return getResend().emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
