import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { OrderExportDialog } from "@/components/order-export-dialog";
import { SaveQuoteDialog } from "@/components/save-quote-dialog";
import { ExtensionDiagram, ExtensionDiagramLegend } from "@/components/extension-diagram";
import { DiagramViewer } from "@/components/diagram-viewer";
import { OrderItemsEditor, type CalculatedOrderRow } from "@/components/order-items-editor";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SukkahConfig,
  diffConfigs,
  findBestFramePair,
  type DiffResult,
  type SummaryRow,
} from "@/lib/extension-engine";
import { money, newQuoteId, type Quote } from "@/lib/quotes";
import { manualTotal, type ManualOrderItem } from "@/lib/order-items";
import { DELIVERY_OPTIONS } from "@/lib/pricing";
import {
  closestRegionGuess,
  getRegionPrice,
  regionNames,
  suggestRegionFromZip,
} from "@/lib/delivery-zones";
import {
  pushTargetSize,
  saveExtensionDraft,
  takeExtensionDraft,
  takeSchachItems,
} from "@/lib/schach-handoff";
import { useNavigate } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/extension")({
  head: () => ({
    meta: [
      { title: "Canvas Extension Planner — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Compare an existing canvas sukkah against a larger one and get the exact bars, panels, corners, straps and bamboo to buy.",
      },
      { property: "og:title", content: "Canvas Extension Planner — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Part-by-part buy / keep / extra breakdown for extending a canvas sukkah.",
      },
    ],
  }),
  component: ExtensionPage,
});

interface Side {
  length: string;
  width: string;
}

const NO_REGION = "-- Select Region --";

function buildConfig(side: Side, line: string): SukkahConfig | { error: string } {
  const l = Number(side.length);
  const w = Number(side.width);
  if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) {
    return { error: "Enter a length and width." };
  }
  try {
    // Door always sits on the first number of the size.
    return new SukkahConfig(l, w, "length", null, line);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function SideInputs({
  title,
  side,
  onChange,
}: {
  title: string;
  side: Side;
  onChange: (next: Side) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Door wall (ft)</Label>
          <Input
            inputMode="numeric"
            value={side.length}
            onChange={(e) => onChange({ ...side, length: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Side wall (ft)</Label>
          <Input
            inputMode="numeric"
            value={side.width}
            onChange={(e) => onChange({ ...side, width: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function LineList({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: string[];
  tone: "buy" | "keep" | "extra";
}) {
  const toneClass =
    tone === "buy" ? "text-accent" : tone === "keep" ? "text-success" : "text-warning";
  return (
    <div>
      <h3 className={`font-display text-sm font-semibold ${toneClass}`}>{title}</h3>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {lines.map((l, i) => (
            <li key={i} className="code-text text-sm leading-relaxed text-foreground">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PartsTable({ rows }: { rows: SummaryRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Code</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Unit</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{r.label}</TableCell>
            <TableCell className="code-text text-sm">{r.code ?? "--"}</TableCell>
            <TableCell className="text-right code-text text-sm">{r.qty}</TableCell>
            <TableCell className="text-right code-text text-sm">
              {r.unit_price === null ? "--" : money(r.unit_price)}
            </TableCell>
            <TableCell className="text-right code-text text-sm">
              {r.unit_price === null ? "--" : money(r.unit_price * r.qty)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ConfigPanel({
  title,
  cfg,
  onCopy,
  discount = 0,
}: {
  title: string;
  cfg: SukkahConfig | { error: string };
  onCopy: (text: string) => void;
  discount?: number;
}) {
  if ("error" in cfg) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{cfg.error}</p>
        </CardContent>
      </Card>
    );
  }
  const rows = cfg.summaryRows();
  const total = cfg.totalPrice;
  const discountedTotal = total * (1 - discount / 100);
  const lines = cfg.summaryLines();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          {title}
          <span className="ml-2 code-text text-sm font-semibold text-foreground">
            {money(discountedTotal)}
            {discount > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                {money(total)}
              </span>
            )}
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <OrderExportDialog
            items={rows
              .filter((r) => r.code)
              .map((r) => ({ code: r.code as string, qty: r.qty, desc: r.label }))}
          />
          <Button variant="outline" size="sm" onClick={() => onCopy(lines.join("\n"))}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PartsTable rows={rows} />
        <pre className="code-text overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {lines.join("\n")}
        </pre>
      </CardContent>
    </Card>
  );
}

function ExtensionPage() {
  const [line, setLine] = useState("SY");
  const [oldSide, setOldSide] = useState<Side>({ length: "", width: "" });
  const [newSide, setNewSide] = useState<Side>({ length: "", width: "" });
  const [manual, setManual] = useState<ManualOrderItem[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [currentDiscount, setCurrentDiscount] = useState("0");
  const [fullNewDiscount, setFullNewDiscount] = useState("0");
  const [buyDiscount, setBuyDiscount] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState("Delivery");
  const [zip, setZip] = useState("");
  const [zipHint, setZipHint] = useState("");
  const [region, setRegion] = useState(NO_REGION);
  const [deliveryCost, setDeliveryCost] = useState("0");
  const navigate = useNavigate();

  // Mats picked on the Schach page come back here as manual lines.
  useEffect(() => {
    const draft = takeExtensionDraft();
    if (draft) {
      setLine(draft.line);
      setOldSide(draft.oldSide);
      setNewSide(draft.newSide);
      setCurrentDiscount(draft.currentDiscount);
      setFullNewDiscount(draft.fullNewDiscount);
      setBuyDiscount(draft.buyDiscount);
      setDeliveryMode(draft.deliveryMode);
      setZip(draft.zip);
      setRegion(draft.region);
      setDeliveryCost(draft.deliveryCost);
      setExcluded(draft.excluded);
      setManual(draft.manual);
    }
    const incoming = takeSchachItems();
    if (incoming.length > 0) {
      setManual((prev) => [...prev, ...incoming.filter((item) => !prev.some((old) => old.code === item.code && old.price === item.price && old.qty === item.qty))]);
      toast.success("Schach added to the extension plan");
    }
  }, []);

  // Zip -> region auto-suggest, same logic as Canvas.
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

  const oldCfg = useMemo(() => buildConfig(oldSide, line), [oldSide, line]);
  const newCfg = useMemo(() => buildConfig(newSide, line), [newSide, line]);

  const diff = useMemo<DiffResult | { error: string } | null>(() => {
    if ("error" in oldCfg) return { error: oldCfg.error };
    if ("error" in newCfg) return { error: newCfg.error };
    try {
      return diffConfigs(oldCfg, newCfg);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [oldCfg, newCfg]);

  const oldTotal = "error" in oldCfg ? null : (oldCfg.summaryRows(), oldCfg.totalPrice);

  // Frame pair the extension actually uses (max-reuse candidate search),
  // so the diagram matches the buy list.
  const extFrames = useMemo<[number[], number[]] | null>(() => {
    if ("error" in oldCfg || "error" in newCfg) return null;
    try {
      return (
        findBestFramePair(
          oldCfg,
          newCfg.length,
          newCfg.width,
          { ...oldCfg.barsByLength },
          line,
        ) ?? [newCfg.doorDimFrame, newCfg.otherDimFrame]
      );
    } catch {
      return [newCfg.doorDimFrame, newCfg.otherDimFrame];
    }
  }, [oldCfg, newCfg, line]);
  const newTotal = "error" in newCfg ? null : (newCfg.summaryRows(), newCfg.totalPrice);
  const buyRows: CalculatedOrderRow[] =
    diff && !("error" in diff)
      ? diff.buy_items.map((i, idx) => ({
          key: `${i.code ?? i.label}-${idx}`,
          label: i.label,
          code: i.code ?? null,
          qty: i.qty,
          unitPrice: i.unit_price ?? null,
        }))
      : [];
  const keptBuyRows = buyRows.filter((r) => !excluded.includes(r.key));
  const droppedTotal = buyRows
    .filter((r) => excluded.includes(r.key))
    .reduce((s, r) => s + (r.unitPrice ?? 0) * r.qty, 0);
  const calculatedBuyTotal = diff && !("error" in diff) ? diff.buy_total - droppedTotal : null;
  const discountableManual = manual.filter((item) => !item.noDiscount);
  const fixedManual = manual.filter((item) => item.noDiscount);
  const discountableBuyTotal = calculatedBuyTotal !== null ? calculatedBuyTotal + manualTotal(discountableManual) : null;
  const fixedManualTotal = manualTotal(fixedManual);
  const buyTotal = discountableBuyTotal !== null ? discountableBuyTotal + fixedManualTotal : null;
  const pct = Math.max(0, Math.min(100, Number(buyDiscount) || 0));
  const currentPct = Math.max(0, Math.min(100, Number(currentDiscount) || 0));
  const fullNewPct = Math.max(0, Math.min(100, Number(fullNewDiscount) || 0));
  const discountAmount = discountableBuyTotal !== null ? (discountableBuyTotal * pct) / 100 : 0;
  const delivery = deliveryMode === "Delivery" || deliveryMode === "FedEx" ? Number(deliveryCost) || 0 : 0;
  const finalPrice = buyTotal !== null ? buyTotal - discountAmount + delivery : null;
  const preDiscount = buyTotal !== null ? buyTotal + delivery : null;
  const currentAfterDiscount = oldTotal !== null ? oldTotal * (1 - currentPct / 100) : null;
  const fullNewAfterDiscount = newTotal !== null ? newTotal * (1 - fullNewPct / 100) : null;
  const savings = fullNewAfterDiscount !== null && finalPrice !== null ? fullNewAfterDiscount - finalPrice : null;
  const zipDisabled = deliveryMode !== "Delivery";

  const goToSchach = () => {
    saveExtensionDraft({
      line,
      oldSide,
      newSide,
      currentDiscount,
      fullNewDiscount,
      buyDiscount,
      deliveryMode,
      zip,
      region,
      deliveryCost,
      excluded,
      manual,
    });
    pushTargetSize(`${newSide.length}x${newSide.width}`);
    navigate({ to: "/schach" });
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const clearAll = () => {
    setLine("SY");
    setOldSide({ length: "", width: "" });
    setNewSide({ length: "", width: "" });
    setManual([]);
    setExcluded([]);
    setCurrentDiscount("0");
    setFullNewDiscount("0");
    setBuyDiscount("0");
    setDeliveryMode("Delivery");
    setZip("");
    setZipHint("");
    setRegion(NO_REGION);
    setDeliveryCost("0");
  };

  // Buy-list export items: shown in the page header so the same three actions
  // are available from every tab.
  const exportItems = [
    ...keptBuyRows
      .filter((i) => i.code)
      .map((i) => ({ code: i.code as string, qty: i.qty, desc: i.label })),
    ...manual.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
    ...(delivery > 0
      ? [{ code: "FRTDEL", qty: 1, desc: `Delivery — ${money(delivery)}` }]
      : []),
  ];

  const buildQuote = (customerName: string): Quote | null => {
    if (!diff || "error" in diff || "error" in newCfg) return null;
    const text = [
      `Extension ${oldSide.length}x${oldSide.width} -> ${newCfg.length}x${newCfg.width} (${line})`,
      "",
      "BUY:",
      ...diff.buy,
      ...manual.map((m) => `${m.qty} x ${m.code} ${m.desc} — ${money(m.price * m.qty)}`),
      "",
      "KEEP:",
      ...diff.keep,
      "",
      delivery > 0 ? `Delivery: ${money(delivery)}` : "",
      `Final price: ${money(finalPrice ?? 0)}`,
    ]
      .join("\n")
      .trim();
    return {
      quote_id: newQuoteId(),
      created_at: new Date().toISOString(),
      customer_name: customerName,
      product_line: line,
      sukkah_code: null,
      size: `${newCfg.length}x${newCfg.width}`,
      color: null,
      mat_type: null,
      fedex: false,
      line_items: exportItems.map((i) => ({
        code: i.code,
        description: i.desc ?? "",
        quantity: i.qty,
        unit_price: 0,
      })),
      summary: {
        subtotal: finalPrice ?? 0,
        freight: delivery,
        accessories: manualTotal(manual),
        discount_percent: pct,
        discount_amount: discountAmount,
        notes: "",
      },
      text,
    };
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Canvas Extension"
        subtitle="Plan the parts needed to grow an existing canvas sukkah to a new size."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
            <OrderExportDialog items={exportItems} />
            <SaveQuoteDialog
              buildQuote={buildQuote}
              disabled={!diff || "error" in diff}
            />
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        <div className="max-w-xs space-y-1.5">
          <Label>Product line</Label>
          <Select value={line} onValueChange={setLine}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SY">SY / EZ</SelectItem>
              <SelectItem value="DELUXE">Deluxe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SideInputs title="Current sukkah" side={oldSide} onChange={setOldSide} />
          <SideInputs title="Target sukkah" side={newSide} onChange={setNewSide} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Discount &amp; delivery</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Current sukkah discount %</Label>
              <Input
                value={currentDiscount}
                onChange={(e) => setCurrentDiscount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Full new sukkah discount %</Label>
              <Input value={fullNewDiscount} onChange={(e) => setFullNewDiscount(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Buy list discount %</Label>
              <Input value={buyDiscount} onChange={(e) => setBuyDiscount(e.target.value)} inputMode="decimal" />
              <p className="text-xs text-muted-foreground">Schach keeps its own discount.</p>
            </div>
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
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {!("error" in oldCfg) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Current sukkah — {oldCfg.length} &times; {oldCfg.width}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <DiagramViewer title={`Current sukkah — ${oldCfg.length} x ${oldCfg.width}`}>
                  <ExtensionDiagram
                    target={oldCfg}
                    doorFrame={oldCfg.doorDimFrame}
                    otherFrame={oldCfg.otherDimFrame}
                  />
                </DiagramViewer>
                <ExtensionDiagramLegend comparison={false} />
              </CardContent>
            </Card>
          )}
          {!("error" in newCfg) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Target sukkah — {newCfg.length} &times; {newCfg.width}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <DiagramViewer title={`Target sukkah — ${newCfg.length} x ${newCfg.width}`}>
                  <ExtensionDiagram
                    target={newCfg}
                    doorFrame={newCfg.doorDimFrame}
                    otherFrame={newCfg.otherDimFrame}
                  />
                </DiagramViewer>
                <ExtensionDiagramLegend comparison={false} />
              </CardContent>
            </Card>
          )}
          {!("error" in newCfg) && extFrames && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Extension plan — {newCfg.length} &times; {newCfg.width}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <DiagramViewer
                  title={`Extension — ${oldSide.length}x${oldSide.width} to ${newCfg.length}x${newCfg.width}`}
                >
                  <ExtensionDiagram
                    target={newCfg}
                    doorFrame={extFrames[0]}
                    otherFrame={extFrames[1]}
                    keepPool={"error" in oldCfg ? {} : oldCfg.barsByLength}
                  />
                </DiagramViewer>
                <ExtensionDiagramLegend />
              </CardContent>
            </Card>
          )}
        </div>

        {!("error" in newCfg) && (
          <Button variant="secondary" size="sm" onClick={goToSchach}>
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Add schach for {newSide.length}x{newSide.width} &rarr;
          </Button>
        )}

        {savings !== null && (
          <Card>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Current sukkah value</p>
                <p className="code-text text-lg font-semibold">
                  {money(currentAfterDiscount ?? 0)}
                  {currentPct > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{money(oldTotal ?? 0)}</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Buy new (full build)</p>
                <p className="code-text text-lg font-semibold">
                  {money(fullNewAfterDiscount ?? 0)}
                  {fullNewPct > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{money(newTotal ?? 0)}</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Extend existing</p>
                <p className="code-text text-lg font-semibold text-accent">{money(buyTotal ?? 0)}</p>
              </div>
              {discountAmount > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Discount ({pct}%)</p>
                  <p className="code-text text-lg font-semibold text-success">
                    -{money(discountAmount)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase">Delivery</p>
                <p className="code-text text-lg font-semibold">{money(delivery)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Final price</p>
                <p className="code-text text-lg font-semibold text-accent">
                  {money(finalPrice ?? 0)}
                  {discountAmount > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                      {money(preDiscount ?? 0)}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Savings vs new</p>
                <p
                  className={`code-text text-lg font-semibold ${savings >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {money(savings)}
                  {fullNewAfterDiscount ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({Math.round((savings / fullNewAfterDiscount) * 100)}%)
                    </span>
                  ) : null}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="diff">
          <TabsList>
            <TabsTrigger value="diff">Extension plan</TabsTrigger>
            <TabsTrigger value="current">Current sukkah</TabsTrigger>
            <TabsTrigger value="full">New sukkah (full build)</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="mt-4">
            <ConfigPanel title="Current sukkah — full parts list" cfg={oldCfg} onCopy={copy} discount={currentPct} />
          </TabsContent>

          <TabsContent value="diff" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">
                  Buy list
                  {diff && !("error" in diff) && (
                    <span className="ml-2 code-text text-sm font-semibold text-foreground">
                      {money(buyTotal ?? diff.buy_total)}
                    </span>
                  )}
                </CardTitle>
                {diff && !("error" in diff) && (
                  <div className="flex items-center gap-2">
                  <OrderItemsEditor
                    calculated={buyRows}
                    excluded={excluded}
                    onToggleExclude={(key) =>
                      setExcluded((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                      )
                    }
                    manual={manual}
                    onAddManual={(item) => setManual((prev) => [...prev, item])}
                    onRemoveManual={(i) => setManual((prev) => prev.filter((_, j) => j !== i))}
                  />
                  <OrderExportDialog
                    items={[
                      ...keptBuyRows
                        .filter((i) => i.code)
                        .map((i) => ({ code: i.code as string, qty: i.qty, desc: i.label })),
                      ...manual.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
                      ...(delivery > 0
                        ? [
                            {
                              code: "FRTDEL",
                              qty: 1,
                              desc: `Delivery — ${money(delivery)}`,
                            },
                          ]
                        : []),
                    ]}
                  />
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                {!diff ? null : "error" in diff ? (
                  <p className="text-sm text-destructive">{diff.error}</p>
                ) : (
                  <>
                    <LineList title="Buy" lines={diff.buy} tone="buy" />
                    {excluded.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {excluded.length} calculated line(s) dropped &mdash; {money(droppedTotal)}{" "}
                        removed from the buy total.
                      </p>
                    )}
                    {manual.length > 0 && (
                      <LineList
                        title="Added parts"
                        lines={manual.map(
                          (m) => `${m.qty} x ${m.code} ${m.desc} — ${money(m.price * m.qty)}`,
                        )}
                        tone="buy"
                      />
                    )}
                    <LineList title="Keep / reuse" lines={diff.keep} tone="keep" />
                    <LineList title="Left over" lines={diff.extra} tone="extra" />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="full" className="mt-4">
            <ConfigPanel title="New sukkah — full parts list" cfg={newCfg} onCopy={copy} discount={fullNewPct} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}