"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, Check, Github, Mail, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
            <Card>
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
            </Card>
            <Switcher prompt="Don't have an account?" action="Sign up" onClick={() => setView("signup")} />
          </>
        )}

        {view === "signup" && (
          <>
            <Card>
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
            </Card>
            <Switcher prompt="Already have an account?" action="Login" onClick={() => setView("login")} />
          </>
        )}

        {view === "forgot" && (
          <>
            <Card>
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
            </Card>
            <div className="text-center text-[13px] text-muted-foreground">
              <button onClick={() => setView("login")} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                <ArrowLeft className="size-3.5" />
                Back to login
              </button>
            </div>
          </>
        )}

        {view === "reset" && (
          <Card>
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
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-[18px] rounded-[14px] border bg-card p-[26px] shadow-sm">{children}</div>;
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-[18px] font-semibold tracking-[-0.01em]">{title}</div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FormError({ state }: { state: AuthState }) {
  if (!state.error) return null;
  return <p className="text-[12.5px] text-destructive">{state.error}</p>;
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11.5px] text-muted-foreground">Or continue with</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Switcher({ prompt, action, onClick }: { prompt: string; action: string; onClick: () => void }) {
  return (
    <div className="text-center text-[13px] text-muted-foreground">
      {prompt}{" "}
      <button onClick={onClick} className="cursor-pointer font-medium text-foreground underline underline-offset-2">
        {action}
      </button>
    </div>
  );
}

function SuccessPanel({
  icon,
  title,
  sub,
  actionLabel,
  onAction,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
  variant: "primary" | "outline";
}) {
  return (
    <div className="flex flex-col items-center gap-[13px] py-1.5 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/[0.14] text-emerald-500">
        {icon}
      </span>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>
      </div>
      <Button variant={variant} className="mt-1 w-full" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
