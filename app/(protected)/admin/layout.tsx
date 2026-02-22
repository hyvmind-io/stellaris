import { requireAdmin } from "@/lib/auth/get-auth";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // redirects to /unauthorized if not admin, /login if not authed
  return (
    <div className="bg-background min-h-[calc(100vh-3.5rem)]">
      <AdminNav />
      {children}
    </div>
  );
}
