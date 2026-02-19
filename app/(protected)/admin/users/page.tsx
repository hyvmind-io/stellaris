import { getAuth } from "@/lib/auth/get-auth";
import { redirect } from "next/navigation";
import { UserManagementContent } from "./user-management-content";

export default async function AdminUsersPage() {
  const auth = await getAuth();
  if (!auth) redirect("/unauthorized");
  return <UserManagementContent currentUserId={auth.user.id} />;
}
