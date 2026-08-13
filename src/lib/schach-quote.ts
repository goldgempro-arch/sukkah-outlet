import type { MatResult } from "@/lib/schach-engine";

function fmt(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Mirrors pricing_system_v7._format_mat_buy_lines -- builds the BUY: block
 * straight from the schach result data so per-line discounts read cleanly.
 */
export function formatMatBuyLines(result: MatResult | null, schachPct: number): string[] {
  if (!result || result["error"]) return [];
  const factor = 1 - schachPct / 100;
  const lines: string[] = ["BUY:"];

  for (const m of result.new_mats ?? []) {
    const qty = m.qty ?? 1;
    const price = m.price ?? 0;
    const discounted = price * factor;
    const packaged = result["catalog_code"] || result["fedex_code"];
    const label =
      packaged || m.width === undefined
        ? `[${m.code}]`
        : `${qty}\u00d7 [${m.code}]  ${m.width}'wide \u00d7 ${m.roll}'long`;
    lines.push(
      schachPct > 0
        ? `  ${label}   ($${fmt(price)} each)   $${fmt(discounted)} each after ${schachPct.toFixed(0)}% Schach Discount`
        : `  ${label}   $${fmt(price)} each`,
    );
  }

  const breakdown = result["mat_breakdown"] as MatResult | undefined;
  if (breakdown && !breakdown["error"] && breakdown.new_mats?.length) {
    lines.push("", "Includes:");
    for (const bm of breakdown.new_mats) {
      const bPrice = bm.price ?? 0;
      lines.push(
        `  ${bm.qty ?? 1}\u00d7 ${bm.code} (${bm.width}'\u00d7${bm.roll}') \u2014 $${fmt(bPrice)} each`,
      );
    }
  }

  return lines;
}