import Link from "next/link";
import { Cpu, Calendar } from "lucide-react";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Provider } from "@/db/schema";

interface ProviderCardProps {
  provider: Provider & { platformCount: number };
}

export function ProviderCard({ provider: prov }: ProviderCardProps) {
  return (
    <Link href={`/providers/${prov.namespace}/${prov.type}`}>
      <Card className="h-full transition-all hover:shadow-card-hover hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">
              <span className="text-muted-foreground">{prov.namespace} / </span>
              {prov.type}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">v{prov.version}</Badge>
            {prov.protocols.map((protocol) => (
              <Badge key={protocol} variant="secondary" className="text-xs">
                {protocol}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardFooter className="text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              {prov.platformCount} platform{prov.platformCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {prov.publishedAt.toLocaleDateString()}
            </span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
