"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { SIGNUP_ROLES, homeRouteFor } from "@/server/users";
import { checkAuthRateLimit, clearAuthRateLimit } from "@/server/security/rate-limit";

export type AuthState = { error?: string; ok?: boolean; message?: string };

const creds = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Best-effort client IP for rate-limit keying. Behind Vercel/most proxies the
 * real client is the first hop in x-forwarded-for; fall back to a constant so an
 * unknown IP still shares one bucket rather than escaping the limiter entirely.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** KAN-69: throttle an auth attempt by both IP and email; returns an error state when blocked. */
async function rateLimit(action: string, email: string): Promise<AuthState | null> {
  const ip = await clientIp();
  for (const id of [`ip:${ip}`, `email:${email}`]) {
    const res = checkAuthRateLimit(action, id);
    if (!res.allowed) {
      return {
        error: `Too many attempts. Try again in about ${res.retryAfterSec}s.`,
      };
    }
  }
  return null;
}

/** Only allow same-origin in-app paths as a post-login destination. */
function safeRedirect(to: FormDataEntryValue | null): string | null {
  return typeof to === "string" && to.startsWith("/") && !to.startsWith("//")
    ? to
    : null;
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = creds.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const limited = await rateLimit("login", parsed.data.email);
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  // Legit sign-in: stop counting failed attempts against this email.
  clearAuthRateLimit("login", `email:${parsed.data.email}`);

  const user = await getCurrentUser(); // ensure the DB user row exists
  redirect(
    safeRedirect(formData.get("redirectTo")) ??
      (user ? homeRouteFor(user.role) : "/dashboard"),
  );
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const schema = creds.extend({
    name: z.string().min(1, "Enter your name."),
    role: z.enum(SIGNUP_ROLES as [string, ...string[]]).default("employee"),
  });
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const limited = await rateLimit("signup", parsed.data.email);
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name, app_role: parsed.data.role },
    },
  });
  if (error) return { error: error.message };

  // Auto-confirm dev setup returns a session immediately; otherwise sign in.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInError)
      return {
        ok: true,
        message: "Account created — check your email to confirm, then log in.",
      };
  }

  const user = await getCurrentUser();
  redirect(user ? homeRouteFor(user.role) : "/dashboard");
}

export async function requestResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };

  // KAN-69: throttle reset-email requests so the endpoint can't be used to spam.
  const limited = await rateLimit("reset", email.data);
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = z.string().min(8).safeParse(formData.get("password"));
  const confirm = formData.get("confirm");
  if (!password.success)
    return { error: "Password must be at least 8 characters." };
  if (password.data !== confirm) return { error: "Passwords do not match." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
