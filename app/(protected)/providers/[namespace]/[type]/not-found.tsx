import Link from "next/link";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProviderNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <Plug className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
      <h1 className="text-2xl font-bold mb-2">Provider Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The provider you&apos;re looking for doesn&apos;t exist or has been
        removed.
      </p>
      <Button asChild>
        <Link href="/providers">Browse Providers</Link>
      </Button>
    </div>
  );
}
