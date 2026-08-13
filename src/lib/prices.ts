import { getBlob } from "@/lib/data-store";
import type { Catalog } from "@/lib/data-store";

export type CatalogEntry = { desc: string | null; price: number | null };

export function CATALOG(): Catalog {
  return getBlob("parts-catalog");
}

export function getPrice(code: string): number | null {
  return CATALOG()[code]?.price ?? null;
}

export function lookup(code: string): CatalogEntry | undefined {
  return CATALOG()[code];
}

export function ALL_CODES(): string[] {
  const catalog = CATALOG();
  return Object.keys(catalog)
    .filter((c) => catalog[c]?.price != null)
    .sort();
}
