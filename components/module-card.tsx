import Link from "next/link";
import { ArrowDownToLine, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Module } from "@/db/schema";

interface ModuleCardProps {
  module: Module;
}

export function ModuleCard({ module: mod }: ModuleCardProps) {
  return (
    <Link href={`/modules/${mod.namespace}/${mod.name}/${mod.provider}`}>
      <Card className="h-full transition-all hover:shadow-card-hover hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">
              <span className="text-muted-foreground">{mod.namespace} / </span>
              {mod.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{mod.provider}</Badge>
            <Badge variant="outline">v{mod.version}</Badge>
          </div>
        </CardHeader>
        {mod.description && (
          <CardContent className="pb-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {mod.description}
            </p>
          </CardContent>
        )}
        <CardFooter className="text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" />
              {new Intl.NumberFormat().format(mod.downloads)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {mod.publishedAt.toLocaleDateString()}
            </span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
