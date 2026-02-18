import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownToLine,
  Calendar,
  ExternalLink,
  User,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeBlock } from "@/components/code-block";
import { getModuleLatestVersion, getModuleVersions } from "@/lib/data/modules";

interface PageProps {
  params: Promise<{ namespace: string; name: string; system: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { namespace, name, system } = await params;
  return {
    title: `${namespace}/${name}/${system} — Stellaris`,
    description: `Terraform module ${namespace}/${name} for ${system}`,
  };
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { namespace, name, system } = await params;

  const [latestModule, versions] = await Promise.all([
    getModuleLatestVersion(namespace, name, system),
    getModuleVersions(namespace, name, system),
  ]);

  if (!latestModule) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/modules" className="hover:text-foreground">
          Modules
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">
          {namespace}/{name}/{system}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-muted-foreground">{namespace} / </span>
              {name}
              <span className="text-muted-foreground"> / {system}</span>
            </h1>
            {latestModule.description && (
              <p className="text-lg text-muted-foreground mb-4">
                {latestModule.description}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge>v{latestModule.version}</Badge>
              <Badge variant="secondary">{system}</Badge>
              {latestModule.owner && (
                <Badge variant="outline" className="gap-1">
                  <User className="h-3 w-3" />
                  {latestModule.owner}
                </Badge>
              )}
              {latestModule.source && (
                <a
                  href={latestModule.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Source
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <Separator />

          {/* Usage */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Usage</h2>
            <CodeBlock
              title="Terraform Configuration"
              language="hcl"
              code={`module "${name}" {
  source  = "stellaris.example.com/${namespace}/${name}/${system}"
  version = "${latestModule.version}"
}`}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ArrowDownToLine className="h-4 w-4" />
              {new Intl.NumberFormat().format(latestModule.downloads)} downloads
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Published {latestModule.publishedAt.toLocaleDateString()}
            </span>
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
          <ScrollArea className="h-[400px] rounded-lg border border-border">
            <div className="p-4 space-y-2">
              {versions.map((v) => (
                <div
                  key={v.version}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                    v.version === latestModule.version
                      ? "bg-primary/10 text-foreground font-medium"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <span>v{v.version}</span>
                  {v.version === latestModule.version && (
                    <Badge variant="outline" className="text-xs">
                      latest
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
