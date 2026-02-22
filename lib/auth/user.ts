import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { User } from "@/db/schema";
import { hashPassword } from "./password";

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  return (
    (await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .get()) ?? null
  );
}

export async function createUser(params: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  role?: "admin" | "user" | "guest";
}): Promise<User> {
  const passwordHash = await hashPassword(params.password);
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: params.email.toLowerCase().trim(),
      username: params.username.trim(),
      displayName: params.displayName ?? null,
      passwordHash,
      role: params.role ?? "guest",
    })
    .returning();
  return user!;
}
