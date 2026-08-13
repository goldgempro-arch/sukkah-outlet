import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchCatalog, entryFor } from "@/lib/catalog-search";
import { money } from "@/lib/quotes";

export const Route = createFileRoute("/lookup")({
  head: () => ({
    meta: [
      { title: "Item Lookup — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Search the full Sukkah Outlet parts catalog by code, description, or price and copy codes straight into a quote.",
      },
      { property: "og:title", content: "Item Lookup — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Live search across every part code, description, and price in the catalog.",
      },
    ],
  }),
  component: LookupPage,
});

const PAGE_SIZE = 60;

function LookupPage() {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState<string | null>(null);

  const { codes, suggestion } = useMemo(() => searchCatalog(query), [query]);
  const visible = codes.slice(0, shown);

  const onQuery = (value: string) => {
    setQuery(value);
    setShown(PAGE_SIZE);
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    toast.success(`Copied ${code}`);
    window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Item Lookup"
        subtitle="Search any part code, description, or price in the live catalog."
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="relative">
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="e.g. SY1216, schach mat, 249.00"
            className="h-12 rounded-full pl-11 text-base shadow-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {query && (
            <span>
              {codes.length === 0
                ? "No matches."
                : `Showing ${visible.length} of ${codes.length} result${codes.length === 1 ? "" : "s"}`}
            </span>
          )}
          {suggestion && (
            <button
              type="button"
              onClick={() => onQuery(suggestion)}
              className="text-accent underline underline-offset-2"
            >
              Showing results for &ldquo;{suggestion}&rdquo;
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((code) => {
            const entry = entryFor(code);
            return (
              <div
                key={code}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="code-text text-sm font-semibold text-accent">{code}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copy(code)}
                    aria-label={`Copy ${code}`}
                  >
                    {copied === code ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-sm leading-snug text-foreground">{entry?.desc ?? "--"}</p>
                <p className="code-text text-sm font-semibold text-foreground">
                  {money(entry?.price ?? null)}
                </p>
              </div>
            );
          })}
        </div>

        {shown < codes.length && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => setShown((s) => s + PAGE_SIZE)}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}