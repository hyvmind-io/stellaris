"use client";

import { useState } from "react";
import { Info, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CodeBlock } from "@/components/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetaRow } from "@/components/version-info-fields";
import type { Module } from "@/db/schema";

interface ModuleVersionListProps {
  versions: Module[];
  latestVersion: string;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString();
}

/** Minimal client-side tag parse — mirrors lib/data/modules parseTags without
 *  pulling the server data layer into the client bundle. */
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === "string");
    if (typeof parsed === "string") return [parsed];
    return [];
  } catch {
    return [raw];
  }
}

function stringifyDefinition(definition: unknown): string | null {
  if (definition == null) return null;
  try {
    return JSON.stringify(definition, null, 2);
  } catch {
    return String(definition);
  }
}

export function ModuleVersionList({
  versions,
  latestVersion,
}: ModuleVersionListProps) {
  const [active, setActive] = useState<Module | null>(null);
  const definitionJson = active ? stringifyDefinition(active.definition) : null;
  const tags = active ? parseTags(active.tags) : [];

  return (
    <>
      <ScrollArea className="h-[400px] rounded-lg border border-border">
        <div className="p-4 space-y-2">
          {versions.map((v) => {
            const isLatest = v.version === latestVersion;
            return (
              <div
                key={v.version}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  isLatest
                    ? "bg-primary/10 text-foreground font-medium"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>v{v.version}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setActive(v)}
                    aria-label={`View details for v${v.version}`}
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {isLatest && (
                  <Badge variant="outline" className="text-xs">
                    latest
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {active && (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
                <DialogTitle className="font-mono">
                  {active.namespace}/{active.name}/{active.provider}{" "}
                  <span className="text-muted-foreground">v{active.version}</span>
                </DialogTitle>
                <DialogDescription>
                  Module version release metadata
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
                {/* Release */}
                <section className="space-y-1">
                  <h3 className="text-sm font-semibold">Release</h3>
                  <MetaRow label="Namespace" value={active.namespace} />
                  <MetaRow label="Name" value={active.name} />
                  <MetaRow label="System" value={active.provider} />
                  <MetaRow label="Version" value={active.version} mono />
                  <MetaRow label="Owner" value={active.owner || "—"} />
                  <MetaRow label="Revision" value={String(active.revision)} />
                  <MetaRow
                    label="Downloads"
                    value={new Intl.NumberFormat().format(active.downloads)}
                  />
                  <MetaRow label="Published" value={formatDate(active.publishedAt)} />
                  <MetaRow label="Last updated" value={formatDate(active.updatedAt)} />
                </section>

                {/* Details */}
                <section className="space-y-1">
                  <h3 className="text-sm font-semibold">Details</h3>
                  <MetaRow
                    label="Description"
                    value={active.description || "—"}
                    wrap
                  />
                  <MetaRow label="Source" value={active.source || "—"} mono wrap />
                  <MetaRow
                    label="Location"
                    value={active.location || "—"}
                    mono
                    wrap
                  />
                  <div className="flex gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted-foreground">
                      Tags
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {tags.length === 0 ? (
                        <span className="text-foreground">—</span>
                      ) : (
                        tags.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="gap-1 text-xs"
                          >
                            <Tag className="h-3 w-3" />
                            {t}
                          </Badge>
                        ))
                      )}
                    </span>
                  </div>
                </section>

                {/* Definition */}
                {definitionJson && (
                  <section className="space-y-2">
                    <Separator />
                    <h3 className="text-sm font-semibold">Definition</h3>
                    <CodeBlock
                      title="definition"
                      language="json"
                      code={definitionJson}
                      className="max-h-72 overflow-y-auto"
                    />
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
