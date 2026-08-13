import { getBlob } from "@/lib/data-store";

export interface DeliveryRegion {
  name: string;
  sy_price: number | null;
  modular_price: number | null;
}

export interface ZipEntry {
  prefix: string;
  region: string;
}

export function REGIONS(): DeliveryRegion[] {
  return getBlob("delivery-regions") as DeliveryRegion[];
}

export function ZIP_MAP(): ZipEntry[] {
  return getBlob("zip-to-region") as ZipEntry[];
}

export function regionNames(): string[] {
  return REGIONS().map((r) => r.name);
}

export function getRegionPrice(regionName: string, productLine = "SY"): number | null {
  const r = REGIONS().find((x) => x.name === regionName);
  if (!r) return null;
  return String(productLine).toUpperCase() === "MODULAR" ? r.modular_price : r.sy_price;
}

function digitsOf(zip: string | number | null | undefined): string {
  if (zip === null || zip === undefined || zip === "") return "";
  return String(zip).replace(/\D/g, "");
}

export function suggestRegionFromZip(zip: string | number | null | undefined): string | null {
  const digits = digitsOf(zip);
  if (!digits) return null;
  let best: { len: number; region: string } | null = null;
  for (const { prefix, region } of ZIP_MAP()) {
    if (digits.startsWith(prefix) && (best === null || prefix.length > best.len)) {
      best = { len: prefix.length, region };
    }
  }
  return best ? best.region : null;
}

export interface ClosestRegionGuess {
  region: string;
  prefix: string;
  distance: number;
}

export function closestRegionGuess(
  zip: string | number | null | undefined,
): ClosestRegionGuess | null {
  const digits = digitsOf(zip);
  if (!digits || ZIP_MAP().length === 0) return null;
  const zipInt = parseInt(digits.slice(0, 5).padEnd(5, "0"), 10);
  let best: ClosestRegionGuess | null = null;
  for (const { prefix, region } of ZIP_MAP()) {
    if (!/^\d+$/.test(prefix)) continue;
    const distance = Math.abs(zipInt - parseInt(prefix.padEnd(5, "0"), 10));
    if (best === null || distance < best.distance) best = { region, prefix, distance };
  }
  return best;
}