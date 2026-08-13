import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OrderExportDialog } from "@/components/order-export-dialog";
import { OrderItemsEditor } from "@/components/order-items-editor";
import { SaveQuoteDialog } from "@/components/save-quote-dialog";
import { PageHeader } from "@/components/page-header";
import { ModularDiagram } from "@/components/modular-diagram";
import { DiagramViewer } from "@/components/diagram-viewer";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COLOR_NAMES,
  DOOR_TYPES,
  HEIGHT_LABELS,
  PREMIUM_COLORS,
  REAL_HEIGHTS,
  TYPE_NAMES,
  WINDOW_TYPES,
  colorsForHeight,
  renderModular,
  wallLabels,
  type WallCount,
  type WindowDoorEntry,
} from "@/lib/modular-engine";
import { money, newQuoteId, type Quote } from "@/lib/quotes";
import { MAT_TYPES, computeMats } from "@/lib/pricing";
import { getRegionPrice, regionNames } from "@/lib/delivery-zones";
import { resolveZipRegion } from "@/lib/zip-region";
import type { ManualOrderItem } from "@/lib/order-items";

export const Route = createFileRoute("/modular")({
  head: () => ({
    meta: [
      { title: "Modular Builder — Sukkah Outlet Staff Tools" },
      {
        name: "description",
        content:
          "Lay out a modular panel sukkah wall by wall, place windows and doors, and get the exact panel codes and price.",
      },
      { property: "og:title", content: "Modular Builder — Sukkah Outlet Staff Tools" },
      {
        property: "og:description",
        content: "Wall-by-wall modular panel layout with live panel codes and pricing.",
      },
    ],
  }),
  component: ModularPage,
});

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function OpeningRows({
  title,
  types,
  entries,
  labels,
  onChange,
  defaultWall = 1,
  unplacedIndices,
}: {
  title: string;
  types: string[];
  entries: WindowDoorEntry[];
  labels: string[];
  onChange: (next: WindowDoorEntry[]) => void;
  defaultWall?: number;
  unplacedIndices?: Set<number>;
}) {
  const add = () =>
    onChange([
      ...entries,
      {
        typeCode: types[0] as string,
        wallNumber: Math.max(1, Math.min(labels.length, defaultWall)),
      },
    ]);


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-muted-foreground">None added.</p>}
        {entries.map((entry, i) => (
          <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
            <Select
              value={entry.typeCode}
              onValueChange={(v) =>
                onChange(entries.map((e, j) => (j === i ? { ...e, typeCode: v } : e)))
              }
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_NAMES[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(entry.wallNumber)}
              onValueChange={(v) =>
                onChange(entries.map((e, j) => (j === i ? { ...e, wallNumber: Number(v) } : e)))
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {labels.map((l, idx) => (
                  <SelectItem key={l} value={String(idx + 1)}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-destructive"
              aria-label="Remove"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {unplacedIndices?.has(i) && (
            <p className="text-xs font-medium text-destructive">
              Doesn&apos;t fit anywhere in this layout
            </p>
          )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ModularPage() {
  const [wallCount, setWallCount] = useState<WallCount>(4);
  const [length1, setLength1] = useState("");
  const [length2, setLength2] = useState("");
  const [width1, setWidth1] = useState("");
  const [width2, setWidth2] = useState("");
  const [height, setHeight] = useState<string>("");
  const colors = useMemo(() => colorsForHeight(height), [height]);
  const [color, setColor] = useState<string>("");
  const [matType, setMatType] = useState<string>("None");
  const [discount, setDiscount] = useState("0");
  const [matDiscount, setMatDiscount] = useState("0");
  const [windows, setWindows] = useState<WindowDoorEntry[]>([]);
  const [manual, setManual] = useState<ManualOrderItem[]>([]);
  const [doors, setDoors] = useState<WindowDoorEntry[]>([]);
  const [deliveryMode, setDeliveryMode] = useState("Delivery");
  const [zip, setZip] = useState("");
  const [zipHint, setZipHint] = useState("");
  const [region, setRegion] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("0");

  // Zip -> region (modular rates), same resolution as Canvas/Schach.
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

  useEffect(() => {
    if (!region) {
      setDeliveryCost("0");
      return;
    }
    const price = getRegionPrice(region, "MODULAR");
    if (price !== null && price !== undefined) setDeliveryCost(String(price));
  }, [region]);

  useEffect(() => {
    if (deliveryMode === "Pickup") setDeliveryCost("0");
  }, [deliveryMode]);

  useEffect(() => {
    if (color && !colors.includes(color)) setColor("");
  }, [colors, color]);

  const labels = useMemo(() => wallLabels(wallCount), [wallCount]);

  const result = useMemo(() => {
    if (!color || !height) return null;
    try {
      return renderModular({
        wallCount,
        length1: Number(length1) || 0,
        length2: Number(length2) || 0,
        width1: Number(width1) || 0,
        width2: Number(width2) || 0,
        height,
        color,
        windows,
        doors,
        discountPct: Number(discount) || 0,
      });
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      } as ReturnType<typeof renderModular>;
    }
  }, [
    wallCount,
    length1,
    length2,
    width1,
    width2,
    height,
    color,
    windows,
    doors,
    discount,
  ]);

  const unplacedWindowIndices = useMemo(
    () =>
      new Set(
        (result?.unplaced ?? []).filter((u) => u.kind === "window").map((u) => u.entryIndex)
      ),
    [result]
  );
  const unplacedDoorIndices = useMemo(
    () =>
      new Set((result?.unplaced ?? []).filter((u) => u.kind === "door").map((u) => u.entryIndex)),
    [result]
  );

  const copy = async () => {

    if (!result?.lines) return;
    await navigator.clipboard.writeText(result.lines.join("\n"));
    toast.success("Parts list copied");
  };

  const manualSum = manual.reduce((s, m) => s + m.price * m.qty, 0);
  const mats = useMemo(() => {
    const l = Number(length1) || 0;
    const w = Number(width1) || 0;
    if (!l || !w) return null;
    // Poles run across the shorter side; passing it explicitly avoids depending
    // on the BPNS size table, which does not cover every modular size.
    return computeMats(`${l}x${w}`, matType, false, Math.min(l, w));
  }, [length1, width1, matType]);
  const matDiscountPct = Number(matDiscount) || 0;
  const matTotalRaw = mats?.total ?? 0;
  const matTotal = matTotalRaw * (1 - matDiscountPct / 100);
  const delivery = deliveryMode === "Delivery" ? Number(deliveryCost) || 0 : 0;
  const finalPrice = (result?.ok ? result.grandTotal : 0) + manualSum + matTotal + delivery;
  const preDiscount =
    finalPrice + (result?.ok ? result.discountAmount : 0) + (matTotalRaw - matTotal);

  const clearAll = () => {
    setWallCount(4);
    setLength1("");
    setLength2("");
    setWidth1("");
    setWidth2("");
    setHeight("");
    setColor("");
    setMatType("None");
    setDiscount("0");
    setMatDiscount("0");
    setWindows([]);
    setDoors([]);
    setManual([]);
    setDeliveryMode("Delivery");
    setZip("");
    setZipHint("");
    setRegion("");
    setDeliveryCost("0");
  };

  const exportItems = [
    ...(result?.ok ? result.items.map((i) => ({ code: i.code, qty: i.qty, desc: i.desc })) : []),
    ...(mats?.items ?? []),
    ...manual.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
    ...(delivery > 0 ? [{ code: "FRTDEL", qty: 1, desc: `Delivery — ${money(delivery)}` }] : []),
  ];

  const buildQuote = (customerName: string): Quote | null => {
    if (!result?.ok) return null;
    const text = [
      ...result.lines,
      matTotal > 0 ? `${matType} mats: ${money(matTotal)}` : null,
      manualSum > 0 ? `Added parts: ${money(manualSum)}` : null,
      delivery > 0 ? `Delivery: ${money(delivery)}` : null,
      `Final price: ${money(finalPrice)}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      quote_id: newQuoteId(),
      created_at: new Date().toISOString(),
      customer_name: customerName,
      product_line: "MODULAR",
      sukkah_code: null,
      size: `${Number(length1) || 0}x${Number(width1) || 0}`,
      color,
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
        freight: delivery,
        accessories: manualSum,
        discount_percent: result.discountPct,
        discount_amount: result.discountAmount,
        notes: "",
      },
      text,
    };
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Modular Builder"
        subtitle="Lay out modular panel walls and get the exact panel codes and pricing."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
            <OrderExportDialog items={exportItems} />
            <SaveQuoteDialog buildQuote={buildQuote} disabled={!result?.ok} />
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        {result?.ok && (
          <Card>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Panels</p>
                <p className="code-text text-lg font-semibold">{money(result.subtotal)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Mats</p>
                <p className="code-text text-lg font-semibold">
                  {money(matTotal)}
                  {matDiscountPct > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                      {money(matTotalRaw)}
                    </span>
                  )}
                </p>
              </div>
              {manualSum > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Added parts</p>
                  <p className="code-text text-lg font-semibold">{money(manualSum)}</p>
                </div>
              )}
              {result.discountAmount > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Discount ({result.discountPct}%)
                  </p>
                  <p className="code-text text-lg font-semibold text-success">
                    -{money(result.discountAmount)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-muted-foreground">Delivery</p>
                <p className="code-text text-lg font-semibold">{money(delivery)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Final price</p>
                <p className="code-text text-lg font-semibold text-accent">
                  {money(finalPrice)}
                  {result.discountAmount > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                      {money(preDiscount)}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Setup</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Walls</Label>
              <Select
                value={String(wallCount)}
                onValueChange={(v) => setWallCount(Number(v) as WallCount)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "1 wall" : `${n} walls`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Height</Label>
              <Select value={height} onValueChange={setHeight}>
                <SelectTrigger>
                  <SelectValue placeholder="Select height" />
                </SelectTrigger>
                <SelectContent>
                  {REAL_HEIGHTS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {HEIGHT_LABELS[h] ?? h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select color" />
                </SelectTrigger>
                <SelectContent>
                  {colors.map((c) => (
                    <SelectItem key={c} value={c}>
                      {(COLOR_NAMES[c] ?? c) + (PREMIUM_COLORS.includes(c) ? " ♦ Premium" : "")}
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
              <div className="pt-1">
                <Label className="text-xs text-muted-foreground">Mat discount %</Label>
                <Input
                  inputMode="numeric"
                  className="mt-1 h-9"
                  value={matDiscount}
                  onChange={(e) => setMatDiscount(e.target.value)}
                />
              </div>
            </div>
            <NumField label="Sukkah discount %" value={discount} onChange={setDiscount} />
            <NumField label="Length 1 (ft)" value={length1} onChange={setLength1} />
            {wallCount >= 4 && (
              <NumField label="Length 2 (ft)" value={length2} onChange={setLength2} />
            )}
            {wallCount >= 2 && (
              <NumField label="Width 1 (ft)" value={width1} onChange={setWidth1} />
            )}
            {wallCount >= 3 && (
              <NumField label="Width 2 (ft)" value={width2} onChange={setWidth2} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <OpeningRows
            title="Windows"
            types={WINDOW_TYPES}
            entries={windows}
            labels={labels}
            onChange={setWindows}
            defaultWall={1}
            unplacedIndices={unplacedWindowIndices}
          />
          <OpeningRows
            title="Doors"
            types={DOOR_TYPES}
            entries={doors}
            labels={labels}
            onChange={setDoors}
            defaultWall={Math.min(2, labels.length)}
            unplacedIndices={unplacedDoorIndices}
          />
        </div>

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
                  <SelectItem value="Delivery">Delivery</SelectItem>
                  <SelectItem value="Pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer zip code</Label>
              <Input
                inputMode="numeric"
                value={zip}
                disabled={deliveryMode !== "Delivery"}
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
              <Label>Delivery cost (modular rate)</Label>
              <Input
                inputMode="decimal"
                value={deliveryCost}
                disabled={deliveryMode !== "Delivery"}
                onChange={(e) => setDeliveryCost(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Parts list</CardTitle>
              <div className="flex items-center gap-2">
              <OrderItemsEditor
                manual={manual}
                onAddManual={(item) => setManual((prev) => [...prev, item])}
                onRemoveManual={(i) => setManual((prev) => prev.filter((_, j) => j !== i))}
                triggerLabel="Add parts"
              />
              <OrderExportDialog
                items={[
                  ...result.items.map((i) => ({ code: i.code, qty: i.qty, desc: i.desc })),
                  ...(mats?.items ?? []),
                  ...manual.map((m) => ({ code: m.code, qty: m.qty, desc: m.desc })),
                  ...(delivery > 0
                    ? [{ code: "FRTDEL", qty: 1, desc: `Delivery — ${money(delivery)}` }]
                    : []),
                ]}
              />
              <Button variant="outline" size="sm" onClick={copy} disabled={!result.ok}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.message && (
                <p className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
                  {result.message}
                </p>
              )}

              {result.ok && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {result.walls.map((w) => (
                      <div key={w.label} className="rounded-md border border-border p-3">
                        <p className="font-display text-sm font-semibold text-foreground">
                          {w.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {w.nominalFt}&apos; target · {w.items.length} panels
                          {w.leftoverNominal > 0 && ` · ${w.leftoverNominal}" short`}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.items.map((item, idx) => (
                          <TableRow key={`${item.code}-${idx}`}>
                            <TableCell className="code-text font-medium text-accent">
                              {item.code}
                            </TableCell>
                            <TableCell>{item.desc}</TableCell>
                            <TableCell className="text-right">{item.qty}</TableCell>
                            <TableCell className="code-text text-right">
                              {money(item.price)}
                            </TableCell>
                            <TableCell className="code-text text-right">
                              {money(item.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="code-text">{money(result.subtotal)}</span>
                    </div>
                    {matTotal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{matType} mats</span>
                        <span className="code-text">{money(matTotal)}</span>
                      </div>
                    )}
                    {result.discountAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Discount ({result.discountPct}%)
                        </span>
                        <span className="code-text text-success">
                          -{money(result.discountAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1 font-semibold">
                      <span>Total</span>
                      <span className="code-text">{money(result.grandTotal + matTotal)}</span>
                    </div>
                  </div>
                  {matType !== "None" && !mats && (
                    <p className="text-sm text-warning">
                      No {matType} mat option found for this size — check the Schach page.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Layout diagram</CardTitle>
            </CardHeader>
            <CardContent>
              <DiagramViewer title="Layout diagram">
                <ModularDiagram
                  wallCount={wallCount}
                  length1={Number(length1) || 0}
                  length2={Number(length2) || 0}
                  width1={Number(width1) || 0}
                  width2={Number(width2) || 0}
                  height={height}
                  color={color}
                  windows={windows}
                  doors={doors}
                />
              </DiagramViewer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}