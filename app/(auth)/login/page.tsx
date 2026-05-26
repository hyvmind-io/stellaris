import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";
import { brandPageIdentity } from "@/lib/branding";

export function generateMetadata(): Metadata {
  return { title: `Sign In — ${brandPageIdentity()}` };
}

export default function LoginPage() {
  return (
    <Card className="shadow-card">
      <CardHeader className="text-center">
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your credentials to access the registry
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
