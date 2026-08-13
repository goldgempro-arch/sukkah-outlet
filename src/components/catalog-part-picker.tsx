import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchCatalog } from "@/lib/catalog-search";
import type { ManualOrderItem } from "@/lib/order-items";
import { CATALOG } from "@/lib/prices";
import { money } from "@/lib/quotes";

/** Type-ahead catalog search that adds a priced part line, mirroring the desktop Edit Order popup. */
export function CatalogPartPicker({ onAdd }: { onAdd: (item: ManualOrderItem) => void }) {
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");

  const { matches, suggestion } = useMemo(() => {
    const q = code.trim();
    if (q.length < 2) return { matches: [] as string[], suggestion: null as string | null };
    const res = searchCatalog(q);
    return { matches: res.codes.slice(0, 100), suggestion: res.suggestion ?? null };
  }, [code]);

  const add = (raw?: string) => {
    const c = (raw ?? code).trim().toUpperCase();
    const entry = CATALOG()[c];
    if (!entry || entry.price === null || entry.price === undefined) {
      toast.error(`No catalog price found for "${c}".`);
      return;
    }
    const n = Math.max(1, Math.round(Number.parseFloat(qty) || 1));
    onAdd({ code: c, desc: entry.desc ?? "", price: entry.price, qty: n });
    setCode("");
    setQty("1");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Search by code, description or price"
          className="code-text"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            add(matches[0] ?? code);
          }}
        />
        <Input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-16"
          inputMode="numeric"
          aria-label="Quantity"
        />
        <Button size="icon" variant="secondary" onClick={() => add()} aria-label="Add part">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {suggestion && (
        <p className="text-xs text-muted-foreground">
          Showing results for &ldquo;{suggestion}&rdquo;
        </p>
      )}
      {code.trim().length >= 2 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">No matching parts.</p>
      )}
      {matches.length > 0 && (
        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {matches.map((c) => {
            const entry = CATALOG()[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => add(c)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="code-text shrink-0 font-semibold">{c}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {entry?.desc ?? ""}
                </span>
                <span className="code-text shrink-0">
                  {entry?.price != null ? money(entry.price) : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}