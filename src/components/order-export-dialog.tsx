import { useMemo, useState } from "react";
import { Check, Copy, ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export interface OrderExportItem {
  code: string;
  qty: number;
  desc?: string | null;
}

/**
 * Merges duplicate lines and sorts, mirroring the desktop app's order export.
 * Custom panels share one orderable code but differ by real cut size, which
 * lives only in the description -- so the merge key includes it.
 */
function mergeItems(items: OrderExportItem[]) {
  const map = new Map<string, OrderExportItem>();
  for (const it of items) {
    if (!it.code) continue;
    const key = `${it.code}\u241F${it.desc ?? ""}`;
    const prev = map.get(key);
    if (prev) prev.qty += it.qty;
    else map.set(key, { ...it });
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function CodeRow({ item }: { item: OrderExportItem }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(item.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="flex items-center gap-3 border-b py-1.5 last:border-b-0">
      <span className="code-text w-36 shrink-0 text-sm font-semibold text-foreground">
        {item.code}
      </span>
      <span className="code-text w-14 shrink-0 text-sm text-muted-foreground">qty {item.qty}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.desc ?? ""}</span>
      <Button variant="outline" size="sm" className="h-7 shrink-0 px-2" onClick={copy}>
        {copied ? (
          <>
            <Check className="mr-1 h-3.5 w-3.5" /> Copied
          </>
        ) : (
          <>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </>
        )}
      </Button>
    </div>
  );
}

export function OrderExportDialog({
  items,
  triggerLabel = "Copy to Sukkah Systems",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  items: OrderExportItem[];
  triggerLabel?: string;
  triggerVariant?: "outline" | "default" | "secondary" | "ghost";
  triggerSize?: "sm" | "default";
}) {
  const merged = useMemo(() => mergeItems(items), [items]);
  const allText = merged.map((i) => `${i.code}\t${i.qty}`).join("\n");

  const copyAll = async () => {
    await navigator.clipboard.writeText(allText);
    toast.success("All codes and quantities copied");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} disabled={merged.length === 0}>
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Order list</DialogTitle>
          <DialogDescription>
            Click Copy next to a code to copy just that code, or copy everything with quantities
            below.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border px-3">
          <div className="py-1">
            {merged.map((item) => (
              <CodeRow key={item.code} item={item} />
            ))}
          </div>
        </div>

        <div className="shrink-0 space-y-2">
          <p className="text-sm font-medium">Code and quantity, all together</p>
          <Textarea readOnly value={allText} rows={6} className="code-text text-sm" />
          <Button size="sm" onClick={copyAll} disabled={!allText}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy all
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
