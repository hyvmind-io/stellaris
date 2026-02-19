import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/get-auth";

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  // requireUser() calls redirect("/login") if not authenticated.
  // Middleware already protects these routes at the Edge layer,
  // but this provides RSC-level enforcement as a second layer.
  await requireUser();
  return <>{children}</>;
}
