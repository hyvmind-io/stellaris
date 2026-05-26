import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { ProviderCard } from "@/components/provider-card";
import { browseProviders } from "@/lib/data/providers";
import type { Metadata } from "next";
import { getBranding, brandPageIdentity } from "@/lib/branding";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  return {
    title: `Providers — ${brandPageIdentity()}`,
    description: branding.whitelabelEnabled
      ? "Browse providers in the registry"
      : "Browse Terraform providers in the Stellaris registry",
  };
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    namespace?: string;
    offset?: string;
    limit?: string;
  }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 15));

  let providers: Awaited<ReturnType<typeof browseProviders>>["providers"] = [];
  let meta = { offset, limit, total: 0 };

  try {
    const result = await browseProviders({
      q: params.q,
      namespace: params.namespace,
      offset,
      limit,
    });
    providers = result.providers;
    meta = result.meta;
  } catch (error) {
    console.warn(
      "ProvidersPage: failed to browse providers (tables may not exist yet):",
      error,
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Plug className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Providers</h1>
        <Badge variant="secondary">{meta.total}</Badge>
      </div>

      {/* Search */}
      <div className="max-w-md mb-6">
        <SearchInput placeholder="Search providers..." />
      </div>

      <Separator className="mb-6" />

      {/* Results */}
      {providers.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {providers.map((prov) => (
              <ProviderCard
                key={`${prov.namespace}/${prov.type}`}
                provider={prov}
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
          <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No providers found</h2>
          <p className="text-muted-foreground">
            {params.q
              ? `No providers match "${params.q}". Try adjusting your search.`
              : "No providers have been published yet."}
          </p>
        </div>
      )}
    </div>
  );
}
