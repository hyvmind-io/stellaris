import { requireUser } from "@/lib/auth/get-auth";
import { getUserApiKeys } from "@/lib/data/api-keys";
import { Separator } from "@/components/ui/separator";
import { AccountSettings } from "@/components/profile/account-settings";
import { PasswordChange } from "@/components/profile/password-change";
import { ApiKeys } from "@/components/profile/api-keys";

export default async function ProfilePage() {
  const { user } = await requireUser();

  // Pre-load API keys for eligible users
  const canCreateKeys = user.role === "admin" || user.role === "user";
  const initialKeys = canCreateKeys ? await getUserApiKeys(user.id) : [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and API access
        </p>
      </div>

      <div className="space-y-8">
        <AccountSettings user={user} />

        <Separator />

        <PasswordChange />

        <Separator />

        <ApiKeys userRole={user.role} initialKeys={initialKeys} />
      </div>
    </div>
  );
}
