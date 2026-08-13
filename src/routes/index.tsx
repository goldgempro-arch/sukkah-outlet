import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CatalogPartPicker } from "@/components/catalog-part-picker";
import { OrderExportDialog } from "@/components/order-export-dialog";
import { SaveQuoteDialog } from "@/components/save-quote-dialog";
import { ExtensionDiagram, ExtensionDiagramLegend } from "@/components/extension-diagram";
import { SukkahConfig } from "@/lib/extension-engine";
import { DiagramViewer } from "@/components/diagram-viewer";
import { PageHeader } from "@/components/page-header";
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
import { Separator } from "@/components/ui/separator";
import { FedexRateQuote } from "@/components/fedex-rate-quote";
import {
  closestRegionGuess,
  getRegionPrice,
  regionNames,
  suggestRegionFromZip,
} from "@/lib/delivery-zones";
import { CATALOG } from "@/lib/prices";
import {
  COLOR_OPTIONS,
  DELIVERY_OPTIONS,
  MAT_TYPES,
  computeMats,
  formatMatBuyLines,
  renderQuoteText,
  resolveSukkah,
  sizesFor,
  type ManualItem,
} from "@/lib/pricing";
import { money, newQuoteId, type Quote } from "@/lib/quotes";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canvas Sukkah Quoting — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Build a sukkah quote: pick product line, color, size and mats, apply discounts and delivery, and copy the finished quote.",
      },
      { property: "og:title", content: "Canvas Sukkah Quoting — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Internal quoting tool for sukkah configurations, schach mats, and delivery.",
      },
    ],
  }),
  component: PricingPage,
});

const NO_REGION = "-- Select Region --";

function PricingPage() {
  const [line, setLine] = useState("SY");
  const [colorKey, setColorKey] = useState("BEIGE-BLUE");
  const [size, setSize] = useState(() => sizesFor("SY", "BEIGE-BLUE")[0] ?? "");
  const [matType, setMatType] = useState<string>("None");
  const [fedex, setFedex] = useState(false);
  const [sukkahDiscount, setSukkahDiscount] = useState("0");
  const [schachDiscount, setSchachDiscount] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState("Delivery");
  const [zip, setZip] = useState("");
  const [zipHint, setZipHint] = useState("");
  const [region, setRegion] = useState(NO_REGION);
  const [deliveryCost, setDeliveryCost] = useState("0");
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);

  const colors = COLOR_OPTIONS[line] ?? [];
  const sizes = useMemo(() => sizesFor(line, colorKey), [line, colorKey]);

  useEffect(() => {
    if (!colors.some((c) => c.key === colorKey)) setColorKey(colors[0]?.key ?? "");
  }, [line]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sizes.length && !sizes.includes(size)) setSize(sizes[0]);
    if (!sizes.length) setSize("");
  }, [sizes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zip -> region auto-suggest (exact prefix match wins; otherwise nearest known zip).
  useEffect(() => {
    setZipHint("");
    const digits = zip.replace(/\D/g, "");
    if (!digits) {
      setRegion(NO_REGION);
      setDeliveryCost("0");
      return;
    }
    const exact = suggestRegionFromZip(zip);
    if (exact) {
      setRegion(exact);
      return;
    }
    if (digits.length < 5) return;
    const guess = closestRegionGuess(zip);
    if (guess) {
      setRegion(guess.region);
      setZipHint(
        `No exact match for this zip — closest known area is ${guess.region} (near ${guess.prefix}xx). Unconfirmed guess, please verify or pick a different region.`,
      );
    } else {
      setZipHint("No matching or nearby region found — pick one manually above.");
    }
  }, [zip]);

  useEffect(() => {
    if (region === NO_REGION) {
      setDeliveryCost("0");
      return;
    }
    const price = getRegionPrice(region, line);
    if (price !== null && price !== undefined) setDeliveryCost(String(price));
  }, [region, line]);

  useEffect(() => {
    if (deliveryMode === "Pickup") setDeliveryCost("0");
  }, [deliveryMode]);

  const sukkah = useMemo(
    () => (size ? resolveSukkah(line, colorKey, size, fedex) : null),
    [line, colorKey, size, fedex],
  );

  const num = (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const mats = useMemo(() => computeMats(size, matType, fedex), [size, matType, fedex]);

  const quote = useMemo(() => {
    if (!sukkah) return null;
    return renderQuoteText({
      sukkah,
      sukkahPct: num(sukkahDiscount),
      schachPct: num(schachDiscount),
      matLines: mats ? formatMatBuyLines(mats.result, num(schachDiscount)) : [],
      matTotal: mats?.total ?? 0,
      manualItems,
      delivery: num(deliveryCost),
      deliveryMode,
    });
  }, [sukkah, mats, sukkahDiscount, schachDiscount, manualItems, deliveryCost, deliveryMode]);

  const clearAll = () => {
    setLine("SY");
    setColorKey("BEIGE-BLUE");
    setSize("");
    setMatType("None");
    setFedex(false);
    setSukkahDiscount("0");
    setSchachDiscount("0");
    setDeliveryMode("Delivery");
    setDeliveryCost("0");
    setZip("");
    setZipHint("");
    setRegion(NO_REGION);
    setManualItems([]);
  };

  const buildQuote = (customerName: string): Quote | null => {
    if (!quote || !sukkah) return null;
    return {
      quote_id: newQuoteId(),
      created_at: new Date().toISOString(),
      customer_name: customerName,
      product_line: line,
      sukkah_code: sukkah.code,
      size,
      color: colorKey,
      mat_type: matType,
      fedex,
      line_items: [
        { code: sukkah.code, description: sukkah.desc ?? "", quantity: 1, unit_price: sukkah.price },
        ...(mats?.result.new_mats ?? []).map((m) => ({
          code: m.code,
          description: m.width ? `${m.width}' × ${m.roll}' mat` : "Schach mats",
          quantity: m.qty ?? 1,
          unit_price: m.price ?? 0,
        })),
        ...manualItems.map((m) => ({
          code: m.code,
          description: m.desc ?? "",
          quantity: m.qty,
          unit_price: m.price,
        })),
      ],
      summary: {
        subtotal: quote.grandBefore - num(deliveryCost),
        freight: num(deliveryCost),
        accessories: 0,
        discount_percent: num(sukkahDiscount),
        discount_amount: 0,
        notes: "",
      },
      text: quote.text,
    };
  };

  const zipDisabled = deliveryMode !== "Delivery" && deliveryMode !== "FedEx";

  // Static-table estimate used when FedEx live rating is unavailable.
  const fedexFallbackCost =
    getRegionPrice(region === NO_REGION ? (suggestRegionFromZip(zip) ?? "") : region, line) ??
    num(deliveryCost);

  // Size reads door × side, e.g. "8x10" puts the door on the 8' wall.
  const sizeDims = ((): [number, number] | null => {
    const parts = size.split(/[x×]/i).map((p) => Number.parseFloat(p.trim()));
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    return [parts[0], parts[1]];
  })();

  // Same frame-accurate diagram the Extension tool uses.
  const diagramCfg = useMemo(() => {
    if (!sizeDims) return null;
    try {
      return new SukkahConfig(sizeDims[0], sizeDims[1], "length", null, line);
    } catch {
      return null;
    }
  }, [sizeDims?.[0], sizeDims?.[1], line]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Canvas"
        subtitle="Configure a sukkah, apply discounts and delivery, and generate the quote."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
            <OrderExportDialog
              items={[
                ...(sukkah ? [{ code: sukkah.code, qty: 1, desc: sukkah.desc }] : []),
                ...(mats?.items ?? []),
                ...manualItems.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
                ...(num(deliveryCost) > 0
                  ? [
                      {
                        code: "FRTDEL",
                        qty: 1,
                        desc: `Delivery — ${money(num(deliveryCost))}`,
                      },
                    ]
                  : []),
              ]}
            />
            <SaveQuoteDialog buildQuote={buildQuote} disabled={!quote} />
          </>
        }
      />

      {quote && (
        <div className="px-6 pt-6">
          <Card>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Sukkah</p>
                <p className="code-text text-lg font-semibold">{money(sukkah?.price ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Mats &amp; added parts</p>
                <p className="code-text text-lg font-semibold">
                  {money((mats?.total ?? 0) + manualItems.reduce((s, m) => s + m.price * m.qty, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Delivery</p>
                <p className="code-text text-lg font-semibold">{money(num(deliveryCost))}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Final price</p>
                <p className="code-text text-lg font-semibold text-accent">
                  {money(quote.grandAfter)}
                  {quote.grandBefore > quote.grandAfter && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                      {money(quote.grandBefore)}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid flex-1 gap-6 p-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Product line</Label>
                <div className="grid gap-2">
                  {[
                    { value: "SY", label: "Sukkot Yerushalayim (SY)" },
                    { value: "DELUXE", label: "Deluxe" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLine(opt.value)}
                      className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                        line === opt.value
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Color</Label>
                <Select value={colorKey} onValueChange={setColorKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {colors.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sukkah size</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {sizes.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

              <div className="flex items-center gap-2">
                <Checkbox
                  id="fedex"
                  checked={fedex}
                  onCheckedChange={(v) => setFedex(v === true)}
                />
                <Label htmlFor="fedex" className="font-semibold text-accent">
                  FedEx shipping
                </Label>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sukkah disc. %</Label>
                  <Input
                    value={sukkahDiscount}
                    onChange={(e) => setSukkahDiscount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Schach disc. %</Label>
                  <Input
                    value={schachDiscount}
                    onChange={(e) => setSchachDiscount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label>Delivery</Label>
                <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Customer zip code</Label>
                <Input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  disabled={zipDisabled}
                  inputMode="numeric"
                  placeholder="11219"
                />
                {zipHint && <p className="text-xs text-warning-foreground/80 italic">{zipHint}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Delivery region</Label>
                <Select value={region} onValueChange={setRegion} disabled={zipDisabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_REGION}>{NO_REGION}</SelectItem>
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
                  value={deliveryCost}
                  onChange={(e) => setDeliveryCost(e.target.value)}
                  inputMode="decimal"
                />
              </div>

              {deliveryMode === "FedEx" && (
                <FedexRateQuote
                  zip={zip}
                  fallbackCost={fedexFallbackCost}
                  onSelect={(cost) => setDeliveryCost(cost.toFixed(2))}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add parts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CatalogPartPicker
                onAdd={(item) => setManualItems((items) => [...items, item])}
              />
              {manualItems.map((m, i) => (
                <div
                  key={`${m.code}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
                >
                  <span className="code-text truncate">
                    {m.qty}× {m.code}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="code-text">{money(m.price * m.qty)}</span>
                    <button
                      type="button"
                      onClick={() => setManualItems((items) => items.filter((_, j) => j !== i))}
                      aria-label={`Remove ${m.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Quote</CardTitle>
            <div className="flex items-center gap-2">
              <OrderExportDialog
                items={[
                  ...(sukkah ? [{ code: sukkah.code, qty: 1, desc: sukkah.desc }] : []),
                  ...(mats?.items ?? []),
                  ...manualItems.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
                  ...(num(deliveryCost) > 0
                    ? [
                        {
                          code: "FRTDEL",
                          qty: 1,
                          desc: `Delivery — ${money(num(deliveryCost))}`,
                        },
                      ]
                    : []),
                ]}
              />
              <SaveQuoteDialog buildQuote={buildQuote} disabled={!quote} />
            </div>
          </CardHeader>
          <CardContent>
            {quote ? (
              <pre className="code-text max-h-[420px] w-full overflow-auto rounded-md border border-border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {quote.text}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a size to see the quote. This configuration isn&rsquo;t in the catalog yet.
              </p>
            )}
            {matType !== "None" && !mats && (
              <p className="mt-3 text-xs text-muted-foreground">
                No {matType} mat option found for this size — check the Schach page.
              </p>
            )}
          </CardContent>
        </Card>

        {sizeDims && diagramCfg && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Layout — door on the {sizeDims[0]}&apos; wall</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DiagramViewer title={`Layout — door on the ${sizeDims[0]}' wall`}>
                <ExtensionDiagram
                  target={diagramCfg}
                  doorFrame={diagramCfg.doorDimFrame}
                  otherFrame={diagramCfg.otherDimFrame}
                />
              </DiagramViewer>
              <ExtensionDiagramLegend comparison={false} />
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
