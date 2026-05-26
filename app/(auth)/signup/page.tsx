import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";
import { isSignupEnabled } from "@/lib/data/settings";
import { isCfAccessEnabled } from "@/lib/auth/cf-access-config";
import type { Metadata } from "next";
import { brandPageIdentity } from "@/lib/branding";

export function generateMetadata(): Metadata {
  return { title: `Sign Up — ${brandPageIdentity()}` };
}

export default async function SignupPage() {
  // CF Access deployments do not expose self-serve signup at all — identities
  // come from verified Access JWTs only.
  if (isCfAccessEnabled()) notFound();

  const signupEnabled = await isSignupEnabled();
  if (!signupEnabled) {
    return (
      <Card className="shadow-card">
        <CardHeader className="text-center">
          <CardTitle>Sign up disabled</CardTitle>
          <CardDescription>
            New account registration is currently closed.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="text-center">
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Sign up to publish and access Terraform modules and providers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
