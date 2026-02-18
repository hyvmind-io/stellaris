import { CopyButton } from "./copy-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  title,
  className,
}: CodeBlockProps) {
  const hasHeader = title || language;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted overflow-hidden",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
          <div className="flex items-center gap-2">
            {title && (
              <span className="text-sm font-medium text-foreground">
                {title}
              </span>
            )}
            {language && (
              <Badge variant="secondary" className="text-xs">
                {language}
              </Badge>
            )}
          </div>
          <CopyButton text={code} />
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-sm">
          <code className="font-mono text-foreground">{code}</code>
        </pre>
        {!hasHeader && (
          <div className="absolute right-2 top-2">
            <CopyButton text={code} />
          </div>
        )}
      </div>
    </div>
  );
}
