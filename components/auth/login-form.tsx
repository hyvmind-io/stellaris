"use client";

import { useActionState, useEffect, useId } from "react";
import { toast } from "sonner";
import { loginAction } from "@/app/actions/auth";
import type { ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const emailErrorId = `${id}-email-error`;
  const passwordErrorId = `${id}-password-error`;

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

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

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor={passwordId}>Password</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          disabled={isPending}
          aria-describedby={
            state.fieldErrors?.password ? passwordErrorId : undefined
          }
          aria-invalid={!!state.fieldErrors?.password}
        />
        {state.fieldErrors?.password && (
          <p id={passwordErrorId} className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in\u2026" : "Sign in"}
      </Button>
    </form>
  );
}
