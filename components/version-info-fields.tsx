import { cn } from "@/lib/utils";

interface MetaRowProps {
  label: string;
  value: string;
  /** Render the value in a monospace font (ids, hashes, urls, filenames). */
  mono?: boolean;
  /** Allow long values to wrap/break instead of staying on one line. */
  wrap?: boolean;
}

/**
 * A label/value row for version-detail modals. Label sits in a fixed-width
 * column; value fills the rest. Used by both provider and module info dialogs.
 */
export function MetaRow({ label, value, mono, wrap }: MetaRowProps) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 text-foreground",
          mono && "font-mono text-xs",
          wrap ? "break-all" : "truncate",
        )}
      >
        {value}
      </span>
    </div>
  );
}
