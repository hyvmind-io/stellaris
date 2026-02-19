"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/role-badge";
import { updateProfileAction } from "@/app/actions/profile";
import type { AuthUser } from "@/types/auth";

// ============================================================================
// Validation Schema
// ============================================================================

const accountSettingsSchema = z.object({
  displayName: z.string().max(50, "Display name must be at most 50 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  email: z.string().email("Invalid email address"),
});

type AccountSettingsValues = z.infer<typeof accountSettingsSchema>;

// ============================================================================
// Component Props
// ============================================================================

interface AccountSettingsProps {
  user: AuthUser;
}

// ============================================================================
// Account Settings Component
// ============================================================================

/**
 * AccountSettings Component
 *
 * Allows users to update their profile information.
 * Only admin users can edit their email address.
 */
export function AccountSettings({ user }: AccountSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canEditEmail = user.role === "admin";

  const form = useForm<AccountSettingsValues>({
    resolver: zodResolver(accountSettingsSchema),
    defaultValues: {
      displayName: user.displayName || "",
      username: user.username,
      email: user.email,
    },
  });

  async function onSubmit(values: AccountSettingsValues) {
    startTransition(async () => {
      const result = await updateProfileAction({
        displayName: values.displayName || null,
        username: values.username,
        email: canEditEmail ? values.email : undefined,
      });

      if (result.success) {
        toast.success("Profile updated", {
          description: "Your changes have been saved.",
        });
        router.refresh();
      } else {
        toast.error("Update failed", {
          description: result.error || "Could not update profile",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
        <CardDescription>
          Update your account details and preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This is the name displayed throughout the application
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="johndoe"
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    3-20 characters, letters, numbers, and underscores only
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Email
                    {!canEditEmail && (
                      <Lock className="size-3 text-muted-foreground" />
                    )}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        disabled={isPending || !canEditEmail}
                        className={!canEditEmail ? "bg-muted" : ""}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  {!canEditEmail && (
                    <FormDescription>
                      Only administrators can change their email address
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Role:</span>
                <RoleBadge role={user.role} />
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
