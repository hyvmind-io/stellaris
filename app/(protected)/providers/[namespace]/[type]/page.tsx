import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CodeBlock } from "@/components/code-block";
import { brandPageIdentity } from "@/lib/branding";
import { getRegistryHost } from "@/lib/registry-host";
import { ProviderVersionList } from "@/components/providers/provider-version-list";
import { getProviderVersionsDetailed } from "@/lib/data/providers";

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

  let versions: Awaited<ReturnType<typeof getProviderVersionsDetailed>> = [];

  try {
    versions = await getProviderVersionsDetailed(namespace, type);
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
      source  = "${getRegistryHost()}/${namespace}/${type}"
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
          <ProviderVersionList versions={versions} />
        </div>
      </div>
    </div>
  );
}
