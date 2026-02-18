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
import { getRegistryStats } from "@/lib/data/stats";

export default async function HomePage() {
  const stats = await getRegistryStats();

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-brand opacity-5" />
        <div className="container mx-auto px-4 py-20 text-center relative">
          <div className="mx-auto mb-6 w-fit rounded-2xl bg-card border border-border p-4 shadow-glow">
            <Terminal className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">Stellaris</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-balance">
            Private Terraform/OpenTofu module and provider registry powered by
            Cloudflare Workers
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
          <SearchInput placeholder="Search modules..." className="mb-3" />
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>or browse</span>
            <Link
              href="/modules"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Modules <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href="/providers"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Providers <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

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
    </div>
  );
}
