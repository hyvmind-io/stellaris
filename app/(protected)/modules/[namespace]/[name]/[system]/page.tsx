import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownToLine,
  Calendar,
  ExternalLink,
  Tag,
  User,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CodeBlock } from "@/components/code-block";
import { ModuleVersionList } from "@/components/modules/module-version-list";
import {
  getModuleLatestVersion,
  getModuleVersionsDetailed,
  resolveModuleTags,
} from "@/lib/data/modules";
import { brandPageIdentity } from "@/lib/branding";
import { getRegistryHost } from "@/lib/registry-host";

interface PageProps {
  params: Promise<{ namespace: string; name: string; system: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { namespace, name } = await params;
  return {
    title: `${namespace}/${name} — ${brandPageIdentity()}`,
    description: `Terraform module ${namespace}/${name}`,
  };
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { namespace, name, system } = await params;

  let latestModule;
  let versions: Awaited<ReturnType<typeof getModuleVersionsDetailed>> = [];

  try {
    [latestModule, versions] = await Promise.all([
      getModuleLatestVersion(namespace, name, system),
      getModuleVersionsDetailed(namespace, name, system),
    ]);
  } catch (error) {
    console.warn("ModuleDetailPage: failed to fetch module data:", error);
  }

  if (!latestModule) {
    notFound();
  }

  const tags = resolveModuleTags(latestModule);

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
          {namespace}/{name}
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
            </h1>
            {latestModule.description && (
              <p className="text-lg text-muted-foreground mb-4">
                {latestModule.description}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge>v{latestModule.version}</Badge>
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {tag}
                </Badge>
              ))}
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
  source  = "${getRegistryHost()}/${namespace}/${name}/${system}"
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
          <ModuleVersionList
            versions={versions}
            latestVersion={latestModule.version}
          />
        </div>
      </div>
    </div>
  );
}
