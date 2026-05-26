import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeBlock } from "@/components/code-block";
import { getProviderVersions } from "@/lib/data/providers";
import { brandPageIdentity } from "@/lib/branding";

interface PageProps {
  params: Promise<{ namespace: string; type: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { namespace, type } = await params;
  return {
    title: `${namespace}/${type} — ${brandPageIdentity()}`,
    description: `Terraform provider ${namespace}/${type}`,
  };
}

export default async function ProviderDetailPage({ params }: PageProps) {
  const { namespace, type } = await params;

  let versions: Awaited<ReturnType<typeof getProviderVersions>> = [];

  try {
    versions = await getProviderVersions(namespace, type);
  } catch (error) {
    console.warn("ProviderDetailPage: failed to fetch provider data:", error);
  }

  if (versions.length === 0) {
    notFound();
  }

  // Safe: length > 0 guard above ensures versions[0] exists
  const latest = versions[0]!;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/providers" className="hover:text-foreground">
          Providers
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">
          {namespace}/{type}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-3">
              <span className="text-muted-foreground">{namespace} / </span>
              {type}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge>v{latest.version}</Badge>
              {latest.protocols.map((p) => (
                <Badge key={p} variant="secondary">
                  Protocol {p}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Usage */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Usage</h2>
            <CodeBlock
              title="Terraform Configuration"
              language="hcl"
              code={`terraform {
  required_providers {
    ${type} = {
      source  = "stellaris.example.com/${namespace}/${type}"
      version = "~> ${latest.version.split(".")[0]}.0"
    }
  }
}`}
            />
          </div>

          {/* Platforms for Latest Version */}
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              Platforms
              <Badge variant="secondary">{latest.platforms.length}</Badge>
            </h2>
            <div className="flex flex-wrap gap-2">
              {latest.platforms.map((p) => (
                <Badge
                  key={`${p.os}/${p.arch}`}
                  variant="outline"
                  className="font-mono text-xs"
                >
                  {p.os}/{p.arch}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar — Version List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Versions
            <Badge variant="secondary" className="ml-2">
              {versions.length}
            </Badge>
          </h2>
          <ScrollArea className="h-[500px] rounded-lg border border-border">
            <div className="p-4 space-y-3">
              {versions.map((v, idx) => (
                <div
                  key={v.version}
                  className={`rounded-md border px-4 py-3 ${
                    idx === 0
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">v{v.version}</span>
                    {idx === 0 && (
                      <Badge variant="outline" className="text-xs">
                        latest
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {v.platforms.map((p) => (
                      <Badge
                        key={`${v.version}-${p.os}-${p.arch}`}
                        variant="secondary"
                        className="text-xs font-mono"
                      >
                        {p.os}/{p.arch}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
