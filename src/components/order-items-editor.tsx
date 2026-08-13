import { ListPlus, Trash2, Undo2, X } from "lucide-react";

import { CatalogPartPicker } from "@/components/catalog-part-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { ManualOrderItem } from "@/lib/order-items";
import { money } from "@/lib/quotes";

export interface CalculatedOrderRow {
  key: string;
  label: string;
  code: string | null;
  qty: number;
  unitPrice: number | null;
}

/**
 * Edit Order popup: drop calculated lines staff already have on the shelf,
 * and bolt on arbitrary catalog parts. Mirrors the desktop app's editor.
 */
export function OrderItemsEditor({
  calculated = [],
  excluded,
  onToggleExclude,
  manual,
  onAddManual,
  onRemoveManual,
  triggerLabel = "Edit order",
}: {
  calculated?: CalculatedOrderRow[];
  excluded?: string[];
  onToggleExclude?: (key: string) => void;
  manual: ManualOrderItem[];
  onAddManual: (item: ManualOrderItem) => void;
  onRemoveManual: (index: number) => void;
  triggerLabel?: string;
}) {
  const isExcluded = (key: string) => (excluded ?? []).includes(key);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListPlus className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
          {manual.length > 0 && (
            <span className="ml-1.5 rounded bg-accent px-1.5 text-xs text-accent-foreground">
              {manual.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
          <DialogDescription>
            Add extra catalog parts, or drop calculated lines you already have in stock.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 shrink-0">
          <CatalogPartPicker onAdd={onAddManual} />
        </div>

        {manual.length > 0 && (
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium">Added parts</p>
            {manual.map((m, i) => (
              <div
                key={`${m.code}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
              >
                <span className="code-text min-w-0 flex-1 truncate">
                  {m.qty}× {m.code}
                  {m.noDiscount && (
                    <span className="ml-2 text-xs text-muted-foreground">already discounted</span>
                  )}
                </span>
                <span className="code-text shrink-0">{money(m.price * m.qty)}</span>
                <button
                  type="button"
                  onClick={() => onRemoveManual(i)}
                  aria-label={`Remove ${m.code}`}
                  className="shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}

        {calculated.length > 0 && onToggleExclude && (
          <>
            <Separator />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-1.5">
              <p className="shrink-0 text-sm font-medium">Calculated items</p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {calculated.map((row) => {
                  const off = isExcluded(row.key);
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm ${
                        off ? "opacity-50" : ""
                      }`}
                    >
                      <span className="code-text w-28 shrink-0 truncate">{row.code ?? "--"}</span>
                      <span
                        className={`min-w-0 flex-1 truncate text-xs text-muted-foreground ${
                          off ? "line-through" : ""
                        }`}
                      >
                        {row.qty}× {row.label}
                      </span>
                      <span className="code-text shrink-0 text-xs">
                        {row.unitPrice === null ? "--" : money(row.unitPrice * row.qty)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        onClick={() => onToggleExclude(row.key)}
                      >
                        {off ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}