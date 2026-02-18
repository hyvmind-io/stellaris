import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ModuleNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <Package className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
      <h1 className="text-2xl font-bold mb-2">Module Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The module you&apos;re looking for doesn&apos;t exist or has been
        removed.
      </p>
      <Button asChild>
        <Link href="/modules">Browse Modules</Link>
      </Button>
    </div>
  );
}
