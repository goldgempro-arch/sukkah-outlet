import { CATALOG } from "@/lib/prices";
import { availableSizes, getBaseSukkah, type Product } from "@/lib/products-db";
import { runSchach } from "@/lib/schach-calc";
import type { MatResult } from "@/lib/schach-engine";

export const DELIVERY_OPTIONS = ["-- Select Delivery --", "Delivery", "FedEx", "Pickup"] as const;

export const MAT_TYPES = ["None", "Star-K", "Hadar", "Mehadrin", "Kaynus"] as const;

export const COLOR_OPTIONS: Record<string, { label: string; key: string }[]> = {
  SY: [
    { label: "Beige / Blue", key: "BEIGE-BLUE" },
    { label: "Beige / Green", key: "BEIGE-GREEN" },
  ],
  DELUXE: [
    { label: "Beige / Blue", key: "BEIGE-BLUE" },
    { label: "Beige / Gray", key: "BEIGE-GRAY" },
    { label: "Ultra Breeze (UB)", key: "UB" },
  ],
};

const UB_CODE_RE = /^UB(\d{2})(\d{2})BB(FX)?$/;

export interface UbProduct {
  code: string;
  size: string;
  fedex: boolean;
  price: number;
  desc: string | null;
}

const ubCacheByCatalog = new Map<object, UbProduct[]>();

export function ubProducts(): UbProduct[] {
  const catalog = CATALOG();
  const cached = ubCacheByCatalog.get(catalog);
  if (cached) return cached;
  const products: UbProduct[] = [];
  for (const [code, entry] of Object.entries(catalog)) {
    const m = UB_CODE_RE.exec(code);
    if (!m || entry.price === null || entry.price === undefined) continue;
    products.push({
      code,
      size: `${parseInt(m[1], 10)}x${parseInt(m[2], 10)}`,
      fedex: Boolean(m[3]),
      price: entry.price,
      desc: entry.desc,
    });
  }
  ubCacheByCatalog.set(catalog, products);
  return products;
}

export function ubAvailableSizes(): string[] {
  const sizes = [...new Set(ubProducts().map((p) => p.size))];
  return sizes.sort((a, b) => {
    const av = a.split("x").map(Number);
    const bv = b.split("x").map(Number);
    return av[0] - bv[0] || av[1] - bv[1];
  });
}

export function ubGetBaseSukkah(size: string, fedex = false): UbProduct | null {
  const target = size.toLowerCase().replace(/ /g, "");
  return ubProducts().find((p) => p.size === target && p.fedex === fedex) ?? null;
}

export interface SukkahItem {
  code: string;
  desc: string | null;
  price: number;
}

export function sizesFor(productLine: string, colorKey: string | null): string[] {
  if (colorKey === "UB") return ubAvailableSizes();
  return availableSizes(productLine);
}

export function resolveSukkah(
  productLine: string,
  colorKey: string | null,
  size: string,
  fedex: boolean,
): SukkahItem | null {
  if (colorKey === "UB") {
    const p = ubGetBaseSukkah(size, fedex) ?? (fedex ? ubGetBaseSukkah(size, false) : null);
    return p ? { code: p.code, desc: p.desc, price: p.price } : null;
  }
  const p: Product | null =
    getBaseSukkah(productLine, size, colorKey ?? "", fedex) ??
    (fedex ? getBaseSukkah(productLine, size, colorKey ?? "", false) : null);
  if (!p || p.price === null || p.price === undefined) return null;
  return { code: p.code, desc: p.desc, price: p.price };
}

export interface ManualItem {
  code: string;
  desc: string | null;
  price: number;
  qty: number;
}

function fmt(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface MatQuote {
  result: MatResult;
  total: number;
  lines: string[];
  items: { code: string; qty: number; desc: string | null }[];
}

/** Mirrors PricingSystemTab._sync_schach_engine: cheapest option for this sukkah + mat type. */
export function computeMats(
  size: string,
  matType: string,
  fedex: boolean,
  poleFt?: number | null,
): MatQuote | null {
  if (!size || matType === "None") return null;
  const [w, l] = size.toLowerCase().split("x").map((v) => parseInt(v, 10));
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
  const attempt = (fx: boolean) => {
    try {
      return runSchach({
        matType,
        sukkahW: w as number,
        sukkahL: l as number,
        poleFt: poleFt ?? null,
        isOurSukkah: true,
        fedex: fx,
        existing: [],
      });
    } catch {
      return null;
    }
  };
  let res = attempt(fedex);
  // FedEx has no set for every size — fall back to ground pricing instead of blanking the quote.
  if (fedex && (!res || res.error || !res.cheapOptions[0])) res = attempt(false);
  if (!res) return null;
  const cheapest = res.cheapOptions[0];
  if (res.error || !cheapest) return null;
  return {
    result: cheapest,
    total: cheapest.total_new ?? 0,
    lines: formatMatBuyLines(cheapest, 0),
    items: (cheapest.new_mats ?? []).map((m) => ({
      code: m.code,
      qty: m.qty ?? 1,
      desc: m.width ? `${m.width}' wide × ${m.roll}' long mat` : null,
    })),
  };
}

/** Mirrors _format_mat_buy_lines in pricing_system_v7.py. */
export function formatMatBuyLines(result: MatResult, schachPct: number): string[] {
  const factor = 1 - schachPct / 100;
  const lines = ["BUY:"];
  const packaged = Boolean(result["catalog_code"] || result["fedex_code"]);
  for (const m of result.new_mats ?? []) {
    const qty = m.qty ?? 1;
    const price = m.price ?? 0;
    const total = m.line_total ?? price * qty;
    const label =
      packaged || m.width === undefined || m.width === null
        ? `[${m.code}]`
        : `${qty}× [${m.code}]  ${m.width}'wide × ${m.roll}'long`;
    lines.push(
      schachPct > 0
        ? `  ${label}   ($${fmt(total)})   $${fmt(total * factor)}-after ${schachPct.toFixed(0)}% Schach Discount`
        : `  ${label}   $${fmt(total)}`,
    );
  }
  const bd = result["mat_breakdown"] as MatResult | null | undefined;
  if (bd && bd.new_mats && bd.new_mats.length) {
    lines.push("", "Includes:");
    for (const m of bd.new_mats) {
      lines.push(`  ${m.qty ?? 1}× ${m.code} (${m.width}'×${m.roll}')`);
    }
  }
  return lines;
}

export interface QuoteTextInput {
  sukkah: SukkahItem;
  sukkahPct: number;
  schachPct: number;
  matLines: string[];
  matTotal: number;
  manualItems: ManualItem[];
  delivery: number;
  deliveryMode: string;
}

export interface QuoteTextResult {
  text: string;
  grandBefore: number;
  grandAfter: number;
}

/** Mirrors PricingSystemTab._render_current_option so quote output matches the desktop app. */
export function renderQuoteText(input: QuoteTextInput): QuoteTextResult {
  const { sukkah, sukkahPct, schachPct, matLines, matTotal, manualItems, delivery, deliveryMode } =
    input;

  const price = sukkah.price;
  const sukkahAfter = price * (1 - sukkahPct / 100);

  const lines: string[] = [`${sukkah.code}    ${sukkah.desc ?? ""}`];
  lines.push(
    sukkahPct > 0
      ? `Qty: 1    Price: ($${fmt(price)})   $${fmt(sukkahAfter)}-after ${sukkahPct.toFixed(0)}% Sukkah Discount`
      : `Qty: 1    Price: $${fmt(price)}`,
  );
  lines.push("");

  if (matLines.length) {
    lines.push(...matLines, "");
  }

  let manualTotal = 0;
  if (manualItems.length) {
    for (const m of manualItems) {
      const lineTotal = m.price * m.qty;
      manualTotal += lineTotal;
      lines.push(`${m.code}    ${m.desc ?? ""}`);
      lines.push(`Qty: ${m.qty}    Price: $${fmt(lineTotal)}`);
    }
    lines.push("");
  }

  const matAfter = matTotal * (1 - schachPct / 100);
  const grandBefore = price + matTotal + manualTotal + delivery;
  const grandAfter = sukkahAfter + matAfter + manualTotal + delivery;

  lines.push("FINAL PRICE");
  if (sukkahPct > 0 || schachPct > 0) {
    lines.push(
      `($${fmt(grandBefore)})- $${fmt(grandAfter)} after ${sukkahPct.toFixed(0)}% Sukkah Discount and ${schachPct.toFixed(0)}% Schach Discount`,
    );
  } else {
    lines.push(`$${fmt(grandAfter)}`);
  }
  if (delivery > 0) {
    lines.push(`(includes $${fmt(delivery)} delivery -- ${deliveryMode})`);
  }

  return { text: lines.join("\n"), grandBefore, grandAfter };
}