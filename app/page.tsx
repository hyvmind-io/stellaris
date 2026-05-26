import { Suspense } from "react";
import Link from "next/link";
import {
  Package,
  Plug,
  ArrowDownToLine,
  Terminal,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/stat-card";
import { SearchInput } from "@/components/search-input";
import { CodeBlock } from "@/components/code-block";
import { ModuleCard } from "@/components/module-card";
import { ProviderCard } from "@/components/provider-card";
import { browseModules } from "@/lib/data/modules";
import { browseProviders } from "@/lib/data/providers";
import { getRegistryStats } from "@/lib/data/stats";
import { getBranding } from "@/lib/branding";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [stats, params] = await Promise.all([getRegistryStats(), searchParams]);
  const branding = getBranding();
  const heroTitle = branding.whitelabelEnabled
    ? (branding.brandName ?? branding.titleSuffix)
    : "Stellaris";
  const q = params.q?.trim() ?? "";
  const hasQuery = q.length > 0;

  const [moduleResults, providerResults] = hasQuery
    ? await Promise.all([
        browseModules({ q, offset: 0, limit: 6 }),
        browseProviders({ q, offset: 0, limit: 6 }),
      ])
    : [null, null];

  const modulesHref = hasQuery
    ? `/modules?q=${encodeURIComponent(q)}`
    : "/modules";
  const providersHref = hasQuery
    ? `/providers?q=${encodeURIComponent(q)}`
    : "/providers";

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-brand opacity-5" />
        <div className="container mx-auto px-4 py-20 text-center relative">
          <div className="mx-auto mb-6 w-fit rounded-2xl bg-card border border-border p-4 shadow-glow">
            <Terminal className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            {heroTitle}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-balance">
            {branding.tagline}
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/modules">
                <Package className="mr-2 h-4 w-4" />
                Browse Modules
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/providers">
                <Plug className="mr-2 h-4 w-4" />
                Browse Providers
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Modules"
            value={stats.totalModules}
            icon={Package}
            description="Unique modules registered"
          />
          <StatCard
            title="Providers"
            value={stats.totalProviders}
            icon={Plug}
            description="Unique providers available"
          />
          <StatCard
            title="Downloads"
            value={stats.totalDownloads}
            icon={ArrowDownToLine}
            description="Total module downloads"
          />
        </div>
      </section>

      {/* Search Section */}
      <section className="container mx-auto px-4 pb-12">
        <div className="mx-auto max-w-xl">
          <h2 className="text-lg font-semibold text-center mb-4">
            Find what you need
          </h2>
          <Suspense
            fallback={
              <div className="mb-3 h-10 w-full rounded-md border border-border" />
            }
          >
            <SearchInput
              placeholder="Search modules and providers..."
              className="mb-3"
            />
          </Suspense>
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>or browse</span>
            <Link
              href={modulesHref}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Modules <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href={providersHref}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Providers <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {hasQuery && moduleResults && providerResults && (
        <section className="container mx-auto px-4 pb-12">
          <div className="rounded-xl border border-border bg-card/30 p-6">
            <h2 className="text-2xl font-bold">
              Search results for &quot;{q}&quot;
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Found {moduleResults.meta.total + providerResults.meta.total}{" "}
              total matches across modules and providers.
            </p>

            {moduleResults.meta.total === 0 &&
            providerResults.meta.total === 0 ? (
              <div className="mt-6 text-center py-8">
                <h3 className="text-lg font-semibold mb-2">No matches found</h3>
                <p className="text-muted-foreground mb-4">
                  We couldn&apos;t find modules or providers matching &quot;{q}
                  &quot;.
                </p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <Link
                    href={modulesHref}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Search modules <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href={providersHref}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Search providers <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-8 space-y-8">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      Modules ({moduleResults.meta.total})
                    </h3>
                    <Link
                      href={modulesHref}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View all modules <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {moduleResults.modules.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {moduleResults.modules.map((mod) => (
                        <ModuleCard
                          key={`${mod.namespace}/${mod.name}/${mod.provider}`}
                          module={mod}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No modules match &quot;{q}&quot;.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                      <Plug className="h-5 w-5 text-primary" />
                      Providers ({providerResults.meta.total})
                    </h3>
                    <Link
                      href={providersHref}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View all providers <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {providerResults.providers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {providerResults.providers.map((prov) => (
                        <ProviderCard
                          key={`${prov.namespace}/${prov.type}`}
                          provider={prov}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No providers match &quot;{q}&quot;.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <Separator />

      {/* Usage Section */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8">How to Use</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Use a Module
            </h3>
            <CodeBlock
              language="hcl"
              code={`module "example" {
  source  = "stellaris.example.com/namespace/name/provider"
  version = "1.0.0"
}`}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              Use a Provider
            </h3>
            <CodeBlock
              language="hcl"
              code={`terraform {
  required_providers {
    example = {
      source  = "stellaris.example.com/namespace/type"
      version = "~> 1.0"
    }
  }
}`}
            />
          </div>
        </div>
      </section>

      {/* Tech Footer */}
      {branding.showTechBranding && (
        <section className="container mx-auto px-4 pb-12">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Badge variant="outline">Next.js 16</Badge>
            <Badge variant="outline">React 19</Badge>
            <Badge variant="outline">Cloudflare Workers</Badge>
            <Badge variant="outline">D1</Badge>
            <Badge variant="outline">R2</Badge>
            <Badge variant="outline">Drizzle ORM</Badge>
          </div>
        </section>
      )}
    </div>
  );
}
