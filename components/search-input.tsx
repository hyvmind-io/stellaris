"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  paramName?: string;
  className?: string;
}

export function SearchInput({
  placeholder = "Search...",
  paramName = "q",
  className,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramName) ?? "");
  const [, startTransition] = useTransition();

  // Track whether the change came from user input vs URL sync
  const isUserInput = useRef(false);

  // Debounce: only push to URL when user types (not on URL sync)
  useEffect(() => {
    if (!isUserInput.current) return;

    const currentParam = searchParams.get(paramName) ?? "";
    // Don't push if the value hasn't changed from what's in the URL
    if (value === currentParam) {
      isUserInput.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(paramName, value);
      } else {
        params.delete(paramName);
      }
      // Reset pagination when search changes
      params.delete("offset");

      const queryString = params.toString();
      startTransition(() => {
        router.push(queryString ? `${pathname}?${queryString}` : pathname);
      });
      isUserInput.current = false;
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // Only depend on value — NOT searchParams or router

  // Sync local state from URL changes (e.g., back/forward navigation)
  useEffect(() => {
    const paramValue = searchParams.get(paramName) ?? "";
    if (paramValue !== value) {
      setValue(paramValue);
      // Don't mark as user input — this is a URL sync
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, paramName]);

  const handleChange = (newValue: string) => {
    isUserInput.current = true;
    setValue(newValue);
  };

  const handleClear = () => {
    isUserInput.current = true;
    setValue("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={handleClear}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Clear search</span>
        </Button>
      )}
    </div>
  );
}
