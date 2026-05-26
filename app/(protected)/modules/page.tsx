import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { ModuleCard } from "@/components/module-card";
import { browseModules } from "@/lib/data/modules";
import type { Metadata } from "next";
import { getBranding, brandPageIdentity } from "@/lib/branding";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  return {
    title: `Modules — ${brandPageIdentity()}`,
    description: branding.whitelabelEnabled
      ? "Browse modules in the registry"
      : "Browse Terraform modules in the Stellaris registry",
  };
}

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    namespace?: string;
    provider?: string;
    offset?: string;
    limit?: string;
  }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 15));

  let modules: Awaited<ReturnType<typeof browseModules>>["modules"] = [];
  let meta = { offset, limit, total: 0 };

  try {
    const result = await browseModules({
      q: params.q,
      namespace: params.namespace,
      provider: params.provider,
      offset,
      limit,
    });
    modules = result.modules;
    meta = result.meta;
  } catch (error) {
    console.warn(
      "ModulesPage: failed to browse modules (tables may not exist yet):",
      error,
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Package className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Modules</h1>
        <Badge variant="secondary">{meta.total}</Badge>
      </div>

      {/* Search */}
      <div className="max-w-md mb-6">
        <SearchInput placeholder="Search modules..." />
      </div>

      <Separator className="mb-6" />

      {/* Results */}
      {modules.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {modules.map((mod) => (
              <ModuleCard
                key={`${mod.namespace}/${mod.name}/${mod.provider}`}
                module={mod}
              />
            ))}
          </div>
          <Pagination
            offset={meta.offset}
            limit={meta.limit}
            total={meta.total}
          />
        </>
      ) : (
        <div className="text-center py-16">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No modules found</h2>
          <p className="text-muted-foreground">
            {params.q
              ? `No modules match "${params.q}". Try adjusting your search.`
              : "No modules have been published yet."}
          </p>
        </div>
      )}
    </div>
  );
}
