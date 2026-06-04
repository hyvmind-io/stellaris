"use client";

import { useState } from "react";
import { Info } from "lucide-react";
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
import type { ProviderVersionDetail } from "@/lib/data/providers";

interface ProviderVersionListProps {
  versions: ProviderVersionDetail[];
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString();
}

export function ProviderVersionList({ versions }: ProviderVersionListProps) {
  const [active, setActive] = useState<ProviderVersionDetail | null>(null);

  return (
    <>
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
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
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

      <Dialog
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {active && (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
                <DialogTitle className="font-mono">
                  {active.namespace}/{active.type}{" "}
                  <span className="text-muted-foreground">v{active.version}</span>
                </DialogTitle>
                <DialogDescription>
                  Provider version release metadata
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
                {/* Release */}
                <section className="space-y-1">
                  <h3 className="text-sm font-semibold">Release</h3>
                  <MetaRow label="Namespace" value={active.namespace} />
                  <MetaRow label="Type" value={active.type} />
                  <MetaRow label="Version" value={active.version} mono />
                  <MetaRow
                    label="Protocols"
                    value={active.protocols.join(", ") || "—"}
                  />
                  <MetaRow label="Revision" value={String(active.revision)} />
                  <MetaRow label="Published" value={formatDate(active.publishedAt)} />
                  <MetaRow label="Last updated" value={formatDate(active.updatedAt)} />
                </section>

                {/* Platforms */}
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Platforms</h3>
                    <Badge variant="secondary" className="text-xs">
                      {active.platforms.length}
                    </Badge>
                  </div>
                  {active.platforms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No platform artifacts.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {active.platforms.map((p) => (
                        <div
                          key={`${p.os}-${p.arch}`}
                          className="rounded-md border border-border p-3 space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {p.os}/{p.arch}
                            </Badge>
                          </div>
                          <MetaRow label="Filename" value={p.filename} mono />
                          <MetaRow label="SHA256" value={p.shasum} mono wrap />
                          {p.location && (
                            <MetaRow label="Location" value={p.location} mono wrap />
                          )}
                          {p.shasumUrl && (
                            <MetaRow
                              label="SHASUMS URL"
                              value={p.shasumUrl}
                              mono
                              wrap
                            />
                          )}
                          {p.shasumSignatureUrl && (
                            <MetaRow
                              label="Signature URL"
                              value={p.shasumSignatureUrl}
                              mono
                              wrap
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Signing keys */}
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Signing keys</h3>
                    <Badge variant="secondary" className="text-xs">
                      {active.gpgKeys.length}
                    </Badge>
                  </div>
                  {active.gpgKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No GPG signing keys.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {active.gpgKeys.map((k) => (
                        <div
                          key={k.keyId}
                          className="rounded-md border border-border p-3 space-y-2"
                        >
                          <MetaRow label="Key ID" value={k.keyId} mono />
                          <MetaRow label="Source" value={k.source || "—"} />
                          {k.sourceUrl && (
                            <MetaRow
                              label="Source URL"
                              value={k.sourceUrl}
                              mono
                              wrap
                            />
                          )}
                          <Separator />
                          <CodeBlock
                            title="ASCII-armored public key"
                            code={k.asciiArmor}
                            className="max-h-64 overflow-y-auto"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
