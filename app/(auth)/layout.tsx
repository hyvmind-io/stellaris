import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/get-auth";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await getAuth();
  if (auth) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
