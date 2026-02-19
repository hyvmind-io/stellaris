import { requireAdmin } from "@/lib/auth/get-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // redirects to /unauthorized if not admin, /login if not authed
  return (
    <div className="bg-background min-h-[calc(100vh-3.5rem)]">{children}</div>
  );
}
