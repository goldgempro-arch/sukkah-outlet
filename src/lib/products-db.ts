import { getBlob } from "@/lib/data-store";

export interface Product {
  code: string;
  size: string | null;
  color: string | null;
  mat: string | null;
  fedex: boolean;
  price: number | null;
  desc: string | null;
}

export interface StandaloneMat {
  code: string;
  size: string;
  mat_type: string;
  price: number | null;
  desc: string | null;
}

export interface FedexMat {
  code: string;
  line: string;
  size: string;
  mat_type: string;
  price: number | null;
  desc: string | null;
}

export const SY_PRODUCTS = () => getBlob("sy-products") as Product[];
export const DL_PRODUCTS = () => getBlob("dl-products") as Product[];
export const STANDALONE_MATS = () => getBlob("standalone-mats") as StandaloneMat[];
export const FEDEX_MATS = () => getBlob("fedex-mat-sets") as FedexMat[];

export const MAT_TYPES = ["Star-K", "Hadar", "Mehadrin", "Kaynus"];

export function normSize(size: string | null | undefined): string | null {
  if (!size) return null;
  return String(size).toLowerCase().replace(/ /g, "").replace(/\u00d7/g, "x");
}

function lineProducts(productLine: string): Product[] {
  return ["SY", "EZ"].includes(productLine.toUpperCase()) ? SY_PRODUCTS() : DL_PRODUCTS();
}

export function getBaseSukkah(
  productLine: string,
  size: string,
  color: string,
  fedex = false,
): Product | null {
  const target = normSize(size);
  return (
    lineProducts(productLine).find(
      (p) => p.mat === null && normSize(p.size) === target && p.color === color && p.fedex === fedex,
    ) ?? null
  );
}

export function getMatAddon(
  productLine: string,
  size: string,
  matType: string,
  fedex = false,
): Product | null {
  const target = normSize(size);
  return (
    lineProducts(productLine).find(
      (p) => p.mat === matType && normSize(p.size) === target && p.fedex === fedex,
    ) ?? null
  );
}

export function availableSizes(productLine: string): string[] {
  const sizes = new Set<string>();
  for (const p of lineProducts(productLine)) {
    if (p.mat === null) {
      const s = normSize(p.size);
      if (s) sizes.add(s);
    }
  }
  return [...sizes].sort((a, b) => {
    const av = a.split("x").map(Number);
    const bv = b.split("x").map(Number);
    return (av[0] ?? 0) - (bv[0] ?? 0) || (av[1] ?? 0) - (bv[1] ?? 0);
  });
}

export function availableColors(productLine: string): string[] {
  const colors = new Set<string>();
  for (const p of lineProducts(productLine)) if (p.color) colors.add(p.color);
  return [...colors].sort();
}

export function getStandaloneMat(size: string, matType: string): StandaloneMat | null {
  const target = normSize(size);
  let targetRev: string | null = null;
  if (target && target.includes("x")) {
    const [a, b] = target.split("x");
    targetRev = `${b}x${a}`;
  }
  return (
    STANDALONE_MATS().find((p) => {
      if (p.mat_type !== matType) return false;
      const psize = normSize(p.size);
      return psize === target || psize === targetRev;
    }) ?? null
  );
}

export interface RealMatPrice {
  code: string | null;
  price: number | null;
  source: string | null;
}

export function getRealMatPrice(
  productLine: string,
  doorLen: number | string,
  otherLen: number | string,
  matType: string,
): RealMatPrice {
  const sizeStr = `${doorLen}x${otherLen}`;
  let addon = getMatAddon(productLine, sizeStr, matType);
  if (addon === null) addon = getMatAddon(productLine, `${otherLen}x${doorLen}`, matType);
  if (addon !== null) {
    return {
      code: addon.code,
      price: addon.price,
      source: "catalog add-on code (exact size + mat match)",
    };
  }
  const standalone = getStandaloneMat(sizeStr, matType);
  if (standalone !== null) {
    return {
      code: standalone.code,
      price: standalone.price,
      source: "standalone mat SKU (exact size match)",
    };
  }
  return { code: null, price: null, source: null };
}

export function getFedexMat(
  productLine: string,
  size: string,
  matType: string,
): FedexMat | null {
  const norm = normSize(size);
  if (!norm) return null;
  const [a, b] = norm.split("x");
  const rev = `${b}x${a}`;
  return (
    FEDEX_MATS().find(
      (m) => m.line === productLine && normSize(m.size) === norm && m.mat_type === matType,
    ) ??
    FEDEX_MATS().find(
      (m) => m.line === productLine && normSize(m.size) === rev && m.mat_type === matType,
    ) ??
    null
  );
}