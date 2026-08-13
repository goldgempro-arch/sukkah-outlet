import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OrderExportDialog } from "@/components/order-export-dialog";
import { OrderItemsEditor } from "@/components/order-items-editor";
import { SaveQuoteDialog } from "@/components/save-quote-dialog";
import { PageHeader } from "@/components/page-header";
import { SchachDiagram } from "@/components/schach-diagram";
import { DiagramViewer } from "@/components/diagram-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAT_TYPES } from "@/lib/products-db";
import { getRegionPrice, regionNames } from "@/lib/delivery-zones";
import { FedexRateQuote } from "@/components/fedex-rate-quote";
import { resolveZipRegion } from "@/lib/zip-region";
import { OUR_SUKKAH_SIZES, runSchach } from "@/lib/schach-calc";
import { getBpns, type ExistingMat, type MatResult } from "@/lib/schach-engine";
import { formatMatBuyLines } from "@/lib/schach-quote";
import { money, newQuoteId, type Quote } from "@/lib/quotes";
import { manualTotal, type ManualOrderItem } from "@/lib/order-items";
import { pushSchachItems, takeTargetSize } from "@/lib/schach-handoff";

export const Route = createFileRoute("/schach")({
  head: () => ({
    meta: [
      { title: "Schach Mat Calculator — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Work out the cheapest or fewest bamboo schach mats for any sukkah size, including reuse of a customer's existing mats.",
      },
      { property: "og:title", content: "Schach Mat Calculator — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Bamboo mat layouts, support counts and pricing for any sukkah footprint.",
      },
    ],
  }),
  component: SchachPage,
});

function OptionCard({
  title,
  options,
  discount,
  sukkahW,
  sukkahL,
  poleFt,
  bpnsCode,
  bpnsPrice,
  bpnsPoles,
  includePoles,
  deliveryCost,
  matType,
  idx: externalIdx,
  onIdxChange,
  manual: externalManual,
  onManualChange,
}: {
  title: string;
  options: MatResult[];
  discount: number;
  sukkahW: number;
  sukkahL: number;
  poleFt: number;
  bpnsCode?: string | null;
  bpnsPrice?: number | null;
  bpnsPoles?: number | null;
  includePoles: boolean;
  deliveryCost: number;
  matType: string;
  idx?: number;
  onIdxChange?: (idx: number) => void;
  manual?: ManualOrderItem[];
  onManualChange?: (manual: ManualOrderItem[]) => void;
}) {
  const [internalIdx, setInternalIdx] = useState(0);
  const [internalManual, setInternalManual] = useState<ManualOrderItem[]>([]);
  const idx = externalIdx ?? internalIdx;
  const manual = externalManual ?? internalManual;
  const navigate = useNavigate();
  const safeIdx = Math.min(idx, Math.max(0, options.length - 1));
  const result = options[safeIdx];

  const setIdx = (next: number) => {
    if (onIdxChange) onIdxChange(next);
    else setInternalIdx(next);
  };

  const updateManual = (fn: (prev: ManualOrderItem[]) => ManualOrderItem[]) => {
    if (onManualChange) onManualChange(fn(manual));
    else setInternalManual(fn);
  };

  const lines = useMemo(() => formatMatBuyLines(result ?? null, discount), [result, discount]);

  const factor = 1 - discount / 100;

  const sendToExtension = () => {
    if (!result) return;
    const items: ManualOrderItem[] = (result.new_mats ?? []).map((m) => ({
      code: m.code,
      desc: m.width === undefined ? "Schach mat" : `${m.width}' wide × ${m.roll}' long`,
      price: (m.price ?? 0) * factor,
      qty: m.qty ?? 1,
      noDiscount: true,
    }));
    // The extension frame already has poles — never duplicate them.
    pushSchachItems(items);
    navigate({ to: "/extension" });
  };

  const matTotal = result ? result.total_new : 0;
  const polesTotal = includePoles && bpnsCode ? (bpnsPrice ?? 0) : 0;
  const optionTotal = matTotal + polesTotal;

  const exportItems = [
    ...(result?.new_mats ?? []).map((m) => ({
      code: m.code,
      qty: m.qty ?? 1,
      desc: `${m.width}' wide × ${m.roll}' long`,
    })),
    ...(includePoles && bpnsCode ? [{ code: bpnsCode, qty: 1, desc: "Support set" }] : []),
    ...manual.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
    ...(deliveryCost > 0
      ? [{ code: "FRTDEL", qty: 1, desc: `Delivery — ${money(deliveryCost)}` }]
      : []),
  ];

  const buildQuote = (customerName: string): Quote | null => {
    if (!result) return null;
    const addedTotal = manualTotal(manual);
    const finalPrice =
      matTotal * (1 - discount / 100) + polesTotal + addedTotal + deliveryCost;
    const text = [
      `Schach — ${title} (${sukkahW}' × ${sukkahL}')`,
      "",
      ...lines,
      polesTotal > 0 ? `Supports: ${money(polesTotal)}` : "",
      addedTotal > 0 ? `Added parts: ${money(addedTotal)}` : "",
      deliveryCost > 0 ? `Delivery: ${money(deliveryCost)}` : "",
      `Final price: ${money(finalPrice)}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      quote_id: newQuoteId(),
      created_at: new Date().toISOString(),
      customer_name: customerName,
      product_line: "SCHACH",
      sukkah_code: null,
      size: `${sukkahW}x${sukkahL}`,
      color: null,
      mat_type: matType,
      fedex: false,
      line_items: exportItems.map((i) => ({
        code: i.code,
        description: i.desc ?? "",
        quantity: i.qty,
        unit_price: 0,
      })),
      summary: {
        subtotal: finalPrice,
        freight: deliveryCost,
        accessories: addedTotal,
        discount_percent: discount,
        discount_amount: matTotal - matTotal * (1 - discount / 100),
        notes: "",
      },
      text,
    };
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          <OrderItemsEditor
            manual={manual}
            onAddManual={(item) => updateManual((prev) => [...prev, item])}
            onRemoveManual={(i) => updateManual((prev) => prev.filter((_, j) => j !== i))}
            triggerLabel="Add parts"
          />
          <Button variant="secondary" size="sm" disabled={!result} onClick={sendToExtension}>
            Add to extension
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          <OrderExportDialog items={exportItems} />
          <SaveQuoteDialog buildQuote={buildQuote} disabled={!result} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <p className="text-sm text-muted-foreground">No option available.</p>
        ) : (
          <>
            {/* Fixed-height detail block: option details vary in line count, so
                reserving space here keeps the diagram box (and its Prev/Next
                buttons) from moving under the cursor when cycling options. */}
            <div className="h-44 space-y-3 overflow-y-auto">
            <pre className="code-text overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {lines.join("\n")}
            </pre>
            <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <span>
                Mat length: {result.roll_used ?? "--"}&apos; long, laid in {result.rows ?? 1} row
                {(result.rows ?? 1) > 1 ? "s" : ""}
              </span>
              <span>
                Mats cover {result.covered_width ?? "--"}&apos; of the {result.total_width_needed ?? "--"}
                &apos; span
                {result.gap ? ` · ${result.gap}' still uncovered` : " · fully covered"}
              </span>
              {includePoles && result.supports && (
                <span>
                  {result.supports.total_supports} supports
                  {(result.supports.rows ?? 1) > 1
                    ? ` (${result.supports.supports_per_row} per row × ${result.supports.rows} rows)`
                    : ""}
                </span>
              )}
              {result.reused && result.reused.length > 0 && (
                <span>
                  Reusing:{" "}
                  {result.reused.map((r) => `${r.qty}× ${r.width}'×${r.roll}'`).join(", ")}
                </span>
              )}
            </div>
            </div>
            <p className="code-text text-sm font-semibold text-foreground">
              Total: {money(optionTotal)}
              {discount > 0 && (
                <span className="ml-2 text-success">
                  {money(result.total_new * (1 - discount / 100) + polesTotal)} after {discount}%
                </span>
              )}
              {manual.length > 0 && (
                <span className="ml-2 text-muted-foreground">
                  + {money(manualTotal(manual))} added parts
                </span>
              )}
            </p>
            <DiagramViewer
              title="Schach mat layout"
              headerRight={
                <>
                  Mats {money(result.total_new)}
                  {discount > 0 && (
                    <span className="ml-2 text-success">
                      {money(result.total_new * (1 - discount / 100))} after {discount}%
                    </span>
                  )}
                  {polesTotal > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      + {money(polesTotal)} supports
                    </span>
                  )}
                </>
              }
              nav={{
                index: safeIdx,
                count: options.length,
                label: `Option ${safeIdx + 1} of ${options.length}`,
                onPrev: () => setIdx(safeIdx === 0 ? options.length - 1 : safeIdx - 1),
                onNext: () => setIdx((safeIdx + 1) % options.length),
              }}
            >
              <SchachDiagram
                result={result}
                sukkahW={sukkahW}
                sukkahL={sukkahL}
                poleFt={poleFt}
              />
            </DiagramViewer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SchachPage() {
  const [standard, setStandard] = useState(true);
  const [size, setSize] = useState("");
  const [customW, setCustomW] = useState("");
  const [customL, setCustomL] = useState("");
  const [poleChoice, setPoleChoice] = useState("");
  const [matType, setMatType] = useState(MAT_TYPES[0] as string);
  const [fedex, setFedex] = useState(false);
  const [includePoles, setIncludePoles] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [existing, setExisting] = useState<ExistingMat[]>([]);
  const [deliveryMode, setDeliveryMode] = useState("Delivery");
  const [zip, setZip] = useState("");
  const [zipHint, setZipHint] = useState("");
  const [region, setRegion] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("0");
  const [cheapIdx, setCheapIdx] = useState(0);
  const [cheapManual, setCheapManual] = useState<ManualOrderItem[]>([]);
  const [fewestIdx, setFewestIdx] = useState(0);
  const [fewestManual, setFewestManual] = useState<ManualOrderItem[]>([]);

  const clearAll = () => {
    setStandard(true);
    setSize("");
    setCustomW("");
    setCustomL("");
    setPoleChoice("");
    setMatType(MAT_TYPES[0] as string);
    setFedex(false);
    setIncludePoles(false);
    setDiscount("0");
    setExisting([]);
    setDeliveryMode("Delivery");
    setZip("");
    setZipHint("");
    setRegion("");
    setDeliveryCost("0");
    setCheapIdx(0);
    setCheapManual([]);
  };

  // Zip -> region auto-fill
  useEffect(() => {
    if (deliveryMode !== "Delivery") return;
    const resolved = resolveZipRegion(zip);
    setZipHint(resolved.hint);
    if (resolved.empty) {
      setRegion("");
      setDeliveryCost("0");
      return;
    }
    if (resolved.region) setRegion(resolved.region);
  }, [zip, deliveryMode]);

  // Region -> price
  useEffect(() => {
    if (!region) {
      setDeliveryCost("0");
      return;
    }
    const price = getRegionPrice(region, "SY");
    if (price !== null && price !== undefined) setDeliveryCost(String(price));
  }, [region]);

  useEffect(() => {
    if (deliveryMode === "Pickup") setDeliveryCost("0");
  }, [deliveryMode]);

  const sizes = OUR_SUKKAH_SIZES;

  // Size handed over from the Extension planner.
  useEffect(() => {
    const target = takeTargetSize();
    if (!target) return;
    const [a, b] = target.split("x");
    if (sizes.includes(`${a}x${b}`)) setSize(`${a}x${b}`);
    else if (sizes.includes(`${b}x${a}`)) setSize(`${b}x${a}`);
    else {
      setStandard(false);
      setCustomW(a);
      setCustomL(b);
    }
  }, [sizes]);

  const [w, l] = standard
    ? size
      ? (size.split("x").map(Number) as [number, number])
      : [0, 0]
    : [Number(customW) || 0, Number(customL) || 0];

  const bpns = standard ? getBpns(w, l) : null;
  const poleOptions = w === l ? [w] : [w, l];
  // Default: poles run the shorter way (shorter span = fewer/cheaper poles).
  const shorterFt = Math.min(...poleOptions.filter((n) => n > 0));
  const poleSelection =
    poleChoice && poleOptions.includes(Number(poleChoice))
      ? poleChoice
      : Number.isFinite(shorterFt) && shorterFt > 0
        ? String(shorterFt)
        : "";
  const poleFt = bpns ? bpns.pole_ft : poleSelection ? Number(poleSelection) : null;

  const result = useMemo(
    () =>
      runSchach({
        matType,
        sukkahW: w,
        sukkahL: l,
        poleFt,
        isOurSukkah: standard,
        fedex,
        existing,
      }),
    [matType, w, l, poleFt, standard, fedex, existing],
  );

  const discountPct = Number(discount) || 0;

  // Any input that changes the option lists must send both cards back to
  // their first option, otherwise a stale index points at a different combo.
  useEffect(() => {
    setCheapIdx(0);
    setFewestIdx(0);
  }, [matType, w, l, poleFt, standard, fedex, existing]);

  // Shared pricing bar uses the Cheapest option.
  const safeCheapIdx = Math.min(cheapIdx, Math.max(0, result.cheapOptions.length - 1));
  const cheapResult = result.cheapOptions[safeCheapIdx];
  const cheapMatTotal = cheapResult ? cheapResult.total_new : 0;
  // Poles price lives on the SchachResult, not on an individual MatResult option.
  const cheapPolesTotal =
    includePoles && standard && result.bpnsCode ? (result.bpnsPrice ?? 0) : 0;
  const cheapManualTotal = manualTotal(cheapManual);
  const deliveryVal = Number(deliveryCost) || 0;
  // Static-table estimate that stands in when FedEx live rating is unavailable.
  const fedexFallbackCost =
    getRegionPrice(region || resolveZipRegion(zip).region, "SY") ?? deliveryVal;
  const factor = 1 - discountPct / 100;
  // The Schach discount applies to mats only -- poles/hardware, added parts
  // and delivery are never discounted (matches OptionCard's own math).
  const matsDiscounted = cheapMatTotal * factor;
  const preDiscount = cheapMatTotal + cheapPolesTotal + cheapManualTotal + deliveryVal;
  const finalPrice = matsDiscounted + cheapPolesTotal + cheapManualTotal + deliveryVal;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Schach Calculator"
        subtitle="Find the best bamboo mat layout for a sukkah, with or without reusing existing mats."
        actions={
          <Button variant="outline" size="sm" onClick={clearAll}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sukkah</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Sukkah type</Label>
              <Select value={standard ? "standard" : "custom"} onValueChange={(v) => setStandard(v === "standard")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard sukkah</SelectItem>
                  <SelectItem value="custom">Custom sukkah</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {standard ? (
              <div className="space-y-1.5">
                <Label>Size</Label>
                <Select
                  value={size}
                  onValueChange={(v) => {
                    setSize(v);
                    setExisting([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("x", " × ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Width (ft)</Label>
                  <Input
                    inputMode="numeric"
                    value={customW}
                     onChange={(e) => {
                      setCustomW(e.target.value);
                      setExisting([]);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Length (ft)</Label>
                  <Input
                    inputMode="numeric"
                    value={customL}
                     onChange={(e) => {
                      setCustomL(e.target.value);
                      setExisting([]);
                    }}
                  />
                </div>
              </>
            )}

            {!bpns && (
              <div className="space-y-1.5">
                <Label>Supports run</Label>
                <Select value={poleSelection} onValueChange={setPoleChoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(poleOptions)]
                      .filter((n) => n > 0)
                      .map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}&apos; supports
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Mat type</Label>
              <Select value={matType} onValueChange={setMatType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAT_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Schach discount %</Label>
              <Input
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="fedex"
                checked={fedex}
                onCheckedChange={(v) => setFedex(v === true)}
              />
              <Label htmlFor="fedex">Ships FedEx</Label>
            </div>

            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="include-poles"
                checked={includePoles}
                onCheckedChange={(v) => setIncludePoles(v === true)}
              />
              <Label htmlFor="include-poles">Include supports</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Customer&apos;s existing mats</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExisting([...existing, { width: 0, roll: 0 }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add mat
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {existing.length === 0 && (
              <p className="text-sm text-muted-foreground">None — pricing a fresh set.</p>
            )}
            {existing.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="w-28"
                  inputMode="numeric"
                  placeholder="Width"
                  value={m.width ? String(m.width) : ""}
                  aria-label="Mat width"
                  onChange={(e) =>
                    setExisting(
                      existing.map((x, j) =>
                        j === i ? { ...x, width: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">&apos; wide ×</span>
                <Input
                  className="w-28"
                  inputMode="numeric"
                  placeholder="Length"
                  value={m.roll ? String(m.roll) : ""}
                  aria-label="Mat roll length"
                  onChange={(e) =>
                    setExisting(
                      existing.map((x, j) =>
                        j === i ? { ...x, roll: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">&apos; long</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  aria-label="Remove mat"
                  onClick={() => setExisting(existing.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Delivery</Label>
              <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-- Select Delivery --">-- Select Delivery --</SelectItem>
                  <SelectItem value="Delivery">Delivery</SelectItem>
                  <SelectItem value="FedEx">FedEx</SelectItem>
                  <SelectItem value="Pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer zip code</Label>
              <Input
                inputMode="numeric"
                value={zip}
                disabled={deliveryMode !== "Delivery" && deliveryMode !== "FedEx"}
                onChange={(e) => setZip(e.target.value)}
              />
              {zipHint && <p className="text-xs italic text-warning-foreground/80">{zipHint}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Delivery region</Label>
              <Select
                value={region || "none"}
                onValueChange={(v) => setRegion(v === "none" ? "" : v)}
              >
                <SelectTrigger disabled={deliveryMode !== "Delivery"}>
                  <SelectValue placeholder="Select Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select Region</SelectItem>
                  {regionNames().map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Delivery cost</Label>
              <Input
                inputMode="decimal"
                value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)}
              />
            </div>
            {deliveryMode === "FedEx" && (
              <div className="sm:col-span-2 lg:col-span-4">
                <FedexRateQuote
                  zip={zip}
                  fallbackCost={fedexFallbackCost}
                  onSelect={(cost) => setDeliveryCost(cost.toFixed(2))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {result.error ? (
          <p className="text-sm text-destructive">{result.error}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Supports {result.poleFt}&apos; · mats cover {result.totalWidth}&apos; wide
              {includePoles &&
                result.bpnsCode &&
                ` · ${result.bpnsCode}: ${result.bpnsPoles} supports (${money(result.bpnsPrice)})`}
            </p>

            <Card className="border-2 border-accent/20 bg-accent/5">
              <CardContent className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Mats</p>
                  <p className="code-text text-lg font-semibold">{money(matsDiscounted)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Added parts</p>
                  <p className="code-text text-lg font-semibold">{money(cheapManualTotal)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Support</p>
                  <p className="code-text text-lg font-semibold">{money(cheapPolesTotal)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Delivery</p>
                  <p className="code-text text-lg font-semibold">{money(deliveryVal)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Final</p>
                  <p className="code-text text-lg font-semibold text-accent">
                    {money(finalPrice)}
                    {discountPct > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                        {money(preDiscount)}
                      </span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            {existing.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <OptionCard
                  key={`reuse-${result.reuseOptions?.length}-${result.totalWidth}-${matType}`}
                  title="Reuse Options"
                  options={result.reuseOptions ?? []}
                  discount={discountPct}
                  idx={cheapIdx}
                  onIdxChange={setCheapIdx}
                  manual={cheapManual}
                  onManualChange={setCheapManual}
                  sukkahW={w}
                  sukkahL={l}
                  poleFt={result.poleFt}
                  bpnsCode={standard ? result.bpnsCode : null}
                  bpnsPrice={result.bpnsPrice}
                  bpnsPoles={result.bpnsPoles}
                  includePoles={includePoles}
                  deliveryCost={Number(deliveryCost) || 0}
                  matType={matType}
                />
                <OptionCard
                  key={`fresh-${result.freshOptions.length}-${result.totalWidth}-${matType}`}
                  title="Fresh Options"
                  options={result.freshOptions}
                  discount={discountPct}
                  idx={fewestIdx}
                  onIdxChange={setFewestIdx}
                  manual={fewestManual}
                  onManualChange={setFewestManual}
                  sukkahW={w}
                  sukkahL={l}
                  poleFt={result.poleFt}
                  bpnsCode={standard ? result.bpnsCode : null}
                  bpnsPrice={result.bpnsPrice}
                  bpnsPoles={result.bpnsPoles}
                  includePoles={includePoles}
                  deliveryCost={Number(deliveryCost) || 0}
                  matType={matType}
                />
              </div>
            ) : (
              <OptionCard
                key={`fresh-only-${result.freshOptions.length}-${result.totalWidth}-${matType}`}
                title="Fresh Options"
                options={result.freshOptions}
                discount={discountPct}
                idx={cheapIdx}
                onIdxChange={setCheapIdx}
                manual={cheapManual}
                onManualChange={setCheapManual}
                sukkahW={w}
                sukkahL={l}
                poleFt={result.poleFt}
                bpnsCode={standard ? result.bpnsCode : null}
                bpnsPrice={result.bpnsPrice}
                bpnsPoles={result.bpnsPoles}
                includePoles={includePoles}
                deliveryCost={Number(deliveryCost) || 0}
                matType={matType}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}