"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, Check, Github, Mail, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shell/brand";
import { useTheme, useToast } from "@/components/providers";
import { ROLE_LABEL, SIGNUP_ROLES } from "@/server/users";
import {
  type AuthState,
  loginAction,
  requestResetAction,
  signupAction,
  updatePasswordAction,
} from "./actions";
import { LoginCard } from "@/app/login/login-card";
import { Heading } from "@/app/login/heading";
import { Field } from "@/app/login/field";
import { FormError } from "@/app/login/form-error";
import { Divider } from "@/app/login/divider";
import { Switcher } from "@/app/login/switcher";
import { SuccessPanel } from "@/app/login/success-panel";

type View = "login" | "signup" | "forgot" | "reset";
const initial: AuthState = {};

export default function LoginPage() {
  const { isDark, toggleTheme } = useTheme();
  const { flash } = useToast();
  const [view, setView] = useState<View>("login");

  // Where to land after login: the protected path the user was sent here from
  // (middleware adds ?redirectTo=…), passed straight through to loginAction.
  const [redirectTo, setRedirectTo] = useState("");
  useEffect(() => {
    setRedirectTo(new URLSearchParams(window.location.search).get("redirectTo") ?? "");
  }, []);

  const [login, loginAct, loginPending] = useActionState(loginAction, initial);
  const [signup, signupAct, signupPending] = useActionState(signupAction, initial);
  const [forgot, forgotAct, forgotPending] = useActionState(requestResetAction, initial);
  const [reset, resetAct, resetPending] = useActionState(updatePasswordAction, initial);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute top-5 right-5 inline-flex size-[34px] cursor-pointer items-center justify-center rounded-lg border bg-background text-foreground shadow-xs hover:bg-accent"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="flex w-full max-w-[400px] flex-col gap-[22px]">
        <div className="flex flex-col items-center gap-[11px]">
          <BrandMark className="size-[42px] rounded-[11px]" iconClassName="size-[23px]" />
          <div className="text-center">
            <div className="text-base font-semibold tracking-[-0.01em]">SmartSense</div>
            <div className="text-[12.5px] text-muted-foreground">Benefits &amp; Leave portal</div>
          </div>
        </div>

        {view === "login" && (
          <>
            <LoginCard>
              <form action={loginAct} className="flex flex-col gap-[18px]">
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <Heading title="Login to your account" sub="Enter your email below to sign in." />
                <Field label="Email">
                  <Input name="email" type="email" required placeholder="aarav@smartsense.com" />
                </Field>
                <div>
                  <div className="mb-2 flex items-center">
                    <Label className="mb-0">Password</Label>
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      className="ml-auto cursor-pointer text-[12.5px] text-muted-foreground underline underline-offset-2"
                    >
                      Forgot your password?
                    </button>
                  </div>
                  <Input name="password" type="password" required placeholder="••••••••" />
                </div>
                <FormError state={login} />
                <Button type="submit" className="w-full" disabled={loginPending}>
                  {loginPending ? "Signing in…" : "Login"}
                </Button>
              </form>
              <Divider />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => flash("Enable the GitHub provider in Supabase to use this.", "warn")}
              >
                <Github className="size-4" />
                Continue with GitHub
              </Button>
            </LoginCard>
            <Switcher prompt="Don't have an account?" action="Sign up" onClick={() => setView("signup")} />
          </>
        )}

        {view === "signup" && (
          <>
            <LoginCard>
              <form action={signupAct} className="flex flex-col gap-[18px]">
                <Heading title="Create an account" sub="Sign up with your work email to get started." />
                <Field label="Full name">
                  <Input name="name" required placeholder="Aarav Sharma" />
                </Field>
                <Field label="Work email">
                  <Input name="email" type="email" required placeholder="aarav@smartsense.com" />
                </Field>
                <div>
                  <Label>Role</Label>
                  <select
                    name="role"
                    defaultValue="employee"
                    className="h-[38px] w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SIGNUP_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                    Pick the role that matches your responsibilities.
                  </div>
                </div>
                <div>
                  <Label>Password</Label>
                  <Input name="password" type="password" required placeholder="At least 8 characters" />
                  <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                    Use 8+ characters with a mix of letters and numbers.
                  </div>
                </div>
                <FormError state={signup} />
                {signup.message && <p className="text-[12.5px] text-emerald-500">{signup.message}</p>}
                <Button type="submit" className="w-full" disabled={signupPending}>
                  {signupPending ? "Creating…" : "Create account"}
                </Button>
              </form>
            </LoginCard>
            <Switcher prompt="Already have an account?" action="Login" onClick={() => setView("login")} />
          </>
        )}

        {view === "forgot" && (
          <>
            <LoginCard>
              {forgot.ok ? (
                <SuccessPanel
                  icon={<Mail className="size-[22px]" strokeWidth={2} />}
                  title="Check your email"
                  sub="We sent a reset link to your inbox. The link expires in 30 minutes."
                  actionLabel="I have the link → reset password"
                  variant="outline"
                  onAction={() => setView("reset")}
                />
              ) : (
                <form action={forgotAct} className="flex flex-col gap-[18px]">
                  <Heading title="Forgot your password?" sub="Enter your account email and we'll send a reset link." />
                  <Field label="Email">
                    <Input name="email" type="email" required placeholder="aarav@smartsense.com" />
                  </Field>
                  <FormError state={forgot} />
                  <Button type="submit" className="w-full" disabled={forgotPending}>
                    {forgotPending ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
              )}
            </LoginCard>
            <div className="text-center text-[13px] text-muted-foreground">
              <button onClick={() => setView("login")} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                <ArrowLeft className="size-3.5" />
                Back to login
              </button>
            </div>
          </>
        )}

        {view === "reset" && (
          <LoginCard>
            {reset.ok ? (
              <SuccessPanel
                icon={<Check className="size-[22px]" strokeWidth={2.5} />}
                title="Password updated"
                sub="Your password has been changed. You can now sign in."
                actionLabel="Continue to login"
                variant="primary"
                onAction={() => setView("login")}
              />
            ) : (
              <form action={resetAct} className="flex flex-col gap-[18px]">
                <Heading title="Set a new password" sub="Choose a strong password you haven't used before." />
                <Field label="New password">
                  <Input name="password" type="password" required placeholder="At least 8 characters" />
                </Field>
                <Field label="Confirm new password">
                  <Input name="confirm" type="password" required placeholder="Re-enter password" />
                </Field>
                <FormError state={reset} />
                <Button type="submit" className="w-full" disabled={resetPending}>
                  {resetPending ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </LoginCard>
        )}
      </div>
    </div>
  );
}
