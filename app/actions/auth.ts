"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getUserByEmail, createUser } from "@/lib/auth/user";
import { updateLastLogin } from "@/lib/data/users";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import {
  createSession,
  deleteSession,
  deleteAllUserSessions,
} from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/get-auth";
import { loginSchema, signupSchema } from "@/lib/validation/auth";
import { isSignupEnabled } from "@/lib/data/settings";
import { isCfAccessEnabled } from "@/lib/auth/cf-access-config";
import { allowRequest, clientIp } from "@/lib/security/rate-limit";

// ============================================================================
// Types
// ============================================================================

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ============================================================================
// Helpers
// ============================================================================

async function allowAuthAttempt(action: "login" | "signup"): Promise<boolean> {
  return allowRequest("AUTH_RATE_LIMITER", `${action}:${clientIp(await headers())}`);
}

// ============================================================================
// Actions
// ============================================================================

export async function loginAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  // Validate input
  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  if (!(await allowAuthAttempt("login"))) {
    return { error: "Too many login attempts. Please try again later." };
  }

  // Look up user
  const user = await getUserByEmail(email);
  if (!user) {
    await dummyVerify();
    return { error: "Invalid email or password" };
  }

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password" };
  }

  // Update last login timestamp (best-effort)
  try {
    await updateLastLogin(user.id);
  } catch {
    // Non-critical — don't block login on analytics update
  }

  // Create session and redirect
  await createSession(user.id);
  redirect("/");
}

export async function signupAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // CF Access deployments never permit local signup — users are provisioned
  // through the CF Access bridge on verified JWT assertions only.
  if (isCfAccessEnabled()) {
    return { error: "Signups are currently disabled." };
  }

  // Check if signup is enabled (DB-based toggle)
  const signupEnabled = await isSignupEnabled();
  if (!signupEnabled) {
    return { error: "Signups are currently disabled." };
  }

  const rawEmail = formData.get("email");
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const rawConfirmPassword = formData.get("confirmPassword");

  // Validate input
  const parsed = signupSchema.safeParse({
    email: rawEmail,
    username: rawUsername,
    password: rawPassword,
    confirmPassword: rawConfirmPassword,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, username, password } = parsed.data;

  if (!(await allowAuthAttempt("signup"))) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  // Check for existing email
  const existingEmail = await getUserByEmail(email);
  if (existingEmail) {
    return { error: "An account with this email already exists." };
  }

  // Check for existing username
  const db = getDb();
  const existingUsername = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim()))
    .get();
  if (existingUsername) {
    return { error: "This username is already taken." };
  }

  // First user ever gets admin role
  const [userCount] = await db.select({ value: count() }).from(users);
  const role = userCount!.value === 0 ? "admin" : "guest";

  // Create user, session, and redirect
  const newUser = await createUser({ email, username, password, role });
  await createSession(newUser.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuth();
  if (auth) {
    await deleteSession(auth.sessionId);
  }
  redirect("/login");
}

export async function logoutEverywhereAction(): Promise<void> {
  const auth = await getAuth();
  if (auth) {
    await deleteAllUserSessions(auth.user.id);
  }
  redirect("/login");
}
