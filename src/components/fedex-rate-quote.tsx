import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFedexRates } from "@/lib/fedex.functions";
import type { FedexQuote } from "@/lib/fedex.server";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

interface Props {
  zip: string;
  /** Static-table estimate used when FedEx can't be reached. */
  fallbackCost: number;
  onSelect: (cost: number) => void;
}

/**
 * Live FedEx rating (sandbox). Falls back to the static delivery estimate
 * whenever the API errors, times out or returns nothing.
 */
export function FedexRateQuote({ zip, fallbackCost, onSelect }: Props) {
  const fetchRates = useServerFn(getFedexRates);
  const [weight, setWeight] = useState("50");
  const [dims, setDims] = useState({ l: "48", w: "12", h: "12" });
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<FedexQuote[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const num = (v: string, d: number) => (Number(v) > 0 ? Number(v) : d);

  const run = async () => {
    if (!/\d{5}/.test(zip)) {
      setStatus("Enter a 5-digit customer zip code first.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetchRates({
        data: {
          destPostalCode: zip.replace(/\D/g, "").slice(0, 5),
          destResidential: true,
          packages: [
            {
              weightLb: num(weight, 50),
              lengthIn: num(dims.l, 48),
              widthIn: num(dims.w, 12),
              heightIn: num(dims.h, 12),
              qty: Math.round(num(qty, 1)),
            },
          ],
        },
      });
      if (res.quotes.length) {
        setQuotes(res.quotes);
        setStatus(
          res.source === "cache"
            ? `Cached rates${res.error ? " (FedEx unavailable, showing last known)" : ""}`
            : "Live FedEx sandbox rates",
        );
      } else {
        setQuotes(null);
        setStatus(
          `FedEx unavailable (${res.error ?? "no rates"}) — using estimate ${money(fallbackCost)}`,
        );
        onSelect(fallbackCost);
      }
    } catch {
      setQuotes(null);
      setStatus(`FedEx unavailable — using estimate ${money(fallbackCost)}`);
      onSelect(fallbackCost);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4 text-accent" /> FedEx live rates
        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning-foreground">
          sandbox
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">Weight (lb)</Label>
          <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">L (in)</Label>
          <Input
            inputMode="decimal"
            value={dims.l}
            onChange={(e) => setDims({ ...dims, l: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">W (in)</Label>
          <Input
            inputMode="decimal"
            value={dims.w}
            onChange={(e) => setDims({ ...dims, w: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">H (in)</Label>
          <Input
            inputMode="decimal"
            value={dims.h}
            onChange={(e) => setDims({ ...dims, h: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Boxes</Label>
          <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Get FedEx rates
      </Button>

      {status && <p className="text-xs text-muted-foreground">{status}</p>}

      {quotes && (
        <div className="space-y-1">
          {quotes.map((q) => (
            <button
              key={q.serviceType}
              type="button"
              onClick={() => {
                setSelected(q.serviceType);
                onSelect(q.amount);
              }}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selected === q.serviceType
                  ? "border-accent bg-accent/10"
                  : "border-border/60 hover:bg-muted"
              }`}
            >
              <span>
                {q.serviceName}
                {q.transitTime ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {q.transitTime.replace(/_/g, " ").toLowerCase()}
                  </span>
                ) : null}
              </span>
              <span className="code-text font-semibold">{money(q.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}