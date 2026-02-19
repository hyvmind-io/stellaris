"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { signupAction } from "@/app/actions/auth";
import type { ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "destructive" };
  if (score <= 3) return { score, label: "Fair", color: "yellow" };
  return { score, label: "Strong", color: "green" };
}

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState,
  );
  const [password, setPassword] = useState("");

  const id = useId();
  const emailId = `${id}-email`;
  const usernameId = `${id}-username`;
  const passwordId = `${id}-password`;
  const confirmPasswordId = `${id}-confirmPassword`;
  const emailErrorId = `${id}-email-error`;
  const usernameErrorId = `${id}-username-error`;
  const passwordErrorId = `${id}-password-error`;
  const confirmPasswordErrorId = `${id}-confirmPassword-error`;
  const strengthId = `${id}-strength`;

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const strength = password ? getPasswordStrength(password) : null;
  const filledBars =
    strength === null
      ? 0
      : strength.score <= 1
        ? 1
        : strength.score <= 3
          ? 2
          : 3;

  return (
    <form action={formAction} className="space-y-4">
      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          disabled={isPending}
          aria-describedby={state.fieldErrors?.email ? emailErrorId : undefined}
          aria-invalid={!!state.fieldErrors?.email}
        />
        {state.fieldErrors?.email && (
          <p id={emailErrorId} className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Username */}
      <div className="space-y-2">
        <Label htmlFor={usernameId}>Username</Label>
        <Input
          id={usernameId}
          name="username"
          type="text"
          placeholder="your-username"
          autoComplete="username"
          required
          disabled={isPending}
          aria-describedby={
            state.fieldErrors?.username ? usernameErrorId : undefined
          }
          aria-invalid={!!state.fieldErrors?.username}
        />
        {state.fieldErrors?.username && (
          <p id={usernameErrorId} className="text-sm text-destructive">
            {state.fieldErrors.username[0]}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor={passwordId}>Password</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          placeholder="Create a strong password"
          autoComplete="new-password"
          required
          disabled={isPending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={
            cn(
              strength && strengthId,
              state.fieldErrors?.password && passwordErrorId,
            ) || undefined
          }
          aria-invalid={!!state.fieldErrors?.password}
        />
        {/* Password strength indicator */}
        {password && strength && (
          <div id={strengthId} className="space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3].map((bar) => (
                <div
                  key={bar}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    bar <= filledBars
                      ? {
                          "bg-destructive": strength.color === "destructive",
                          "bg-yellow-500": strength.color === "yellow",
                          "bg-green-500": strength.color === "green",
                        }
                      : "bg-muted",
                  )}
                />
              ))}
            </div>
            <p
              className={cn("text-xs", {
                "text-destructive": strength.color === "destructive",
                "text-yellow-500": strength.color === "yellow",
                "text-green-500": strength.color === "green",
              })}
            >
              {strength.label}
            </p>
          </div>
        )}
        {state.fieldErrors?.password && (
          <p id={passwordErrorId} className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor={confirmPasswordId}>Confirm password</Label>
        <Input
          id={confirmPasswordId}
          name="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          required
          disabled={isPending}
          aria-describedby={
            state.fieldErrors?.confirmPassword
              ? confirmPasswordErrorId
              : undefined
          }
          aria-invalid={!!state.fieldErrors?.confirmPassword}
        />
        {state.fieldErrors?.confirmPassword && (
          <p id={confirmPasswordErrorId} className="text-sm text-destructive">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account\u2026" : "Create account"}
      </Button>
    </form>
  );
}
