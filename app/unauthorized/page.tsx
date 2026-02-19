"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page. This area is
            restricted to administrators.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => router.push("/")} variant="default">
            Go to Homepage
          </Button>
          <p className="text-xs text-muted-foreground">
            Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        </div>
      </div>
    </div>
  );
}
