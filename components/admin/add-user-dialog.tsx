"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction } from "@/app/actions/admin";
import type { UserRole } from "@/types/auth";

const addUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  displayName: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user", "guest"] as const),
});

type AddUserFormData = z.infer<typeof addUserSchema>;

const ROLES: { value: UserRole; label: string; description: string }[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access, can publish modules and manage users",
  },
  {
    value: "user",
    label: "User",
    description: "Standard access, can view modules and providers",
  },
  {
    value: "guest",
    label: "Guest",
    description: "Read-only access to the registry",
  },
];

interface AddUserDialogProps {
  onUserCreated: () => void;
}

export function AddUserDialog({ onUserCreated }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof AddUserFormData, string>>
  >({});

  const [formData, setFormData] = useState<AddUserFormData>({
    email: "",
    username: "",
    displayName: "",
    password: "",
    role: "user",
  });

  function resetForm() {
    setFormData({
      email: "",
      username: "",
      displayName: "",
      password: "",
      role: "user",
    });
    setError(null);
    setFieldErrors({});
    setShowPassword(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (newOpen) {
      resetForm();
    }
    setOpen(newOpen);
  }

  function updateField<K extends keyof AddUserFormData>(
    field: K,
    value: AddUserFormData[K],
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setFieldErrors({});

    // Validate
    const parsed = addUserSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Partial<Record<keyof AddUserFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof AddUserFormData;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createUserAction(parsed.data);
      if (result.success) {
        setOpen(false);
        onUserCreated();
      } else {
        setError(result.error ?? "Failed to create user");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account in the registry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="add-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-email"
              type="email"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="add-username">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-username"
              placeholder="johndoe"
              value={formData.username}
              onChange={(e) => updateField("username", e.target.value)}
              disabled={isSubmitting}
            />
            {fieldErrors.username && (
              <p className="text-xs text-destructive">{fieldErrors.username}</p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="add-display-name">Display Name</Label>
            <Input
              id="add-display-name"
              placeholder="John Doe"
              value={formData.displayName}
              onChange={(e) => updateField("displayName", e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="add-password">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="add-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => updateField("password", e.target.value)}
                disabled={isSubmitting}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                <span className="sr-only">
                  {showPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="add-role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(val) => updateField("role", val as UserRole)}
            >
              <SelectTrigger id="add-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col">
                      <span>{role.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.role && (
              <p className="text-xs text-destructive">{fieldErrors.role}</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
