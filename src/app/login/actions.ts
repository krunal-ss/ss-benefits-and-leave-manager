"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { SIGNUP_ROLES, homeRouteFor } from "@/server/users";

export type AuthState = { error?: string; ok?: boolean; message?: string };

const creds = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/** Only allow same-origin in-app paths as a post-login destination. */
function safeRedirect(to: FormDataEntryValue | null): string | null {
  return typeof to === "string" && to.startsWith("/") && !to.startsWith("//") ? to : null;
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = creds.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  const user = await getCurrentUser(); // ensure the DB user row exists
  redirect(safeRedirect(formData.get("redirectTo")) ?? (user ? homeRouteFor(user.role) : "/dashboard"));
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.name, app_role: parsed.data.role } },
  });
  if (error) return { error: error.message };

  // Auto-confirm dev setup returns a session immediately; otherwise sign in.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInError) return { ok: true, message: "Account created — check your email to confirm, then log in." };
  }

  const user = await getCurrentUser();
  redirect(user ? homeRouteFor(user.role) : "/dashboard");
}

export async function requestResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updatePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = z.string().min(8).safeParse(formData.get("password"));
  const confirm = formData.get("confirm");
  if (!password.success) return { error: "Password must be at least 8 characters." };
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
