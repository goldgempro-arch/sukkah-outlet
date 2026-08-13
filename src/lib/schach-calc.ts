import {
  BPNS,
  calculateAllOptions,
  calculateMatsCheapest,
  calculateMatsFewest,
  calculateMatsWithReuse,
  calculateReuseOptions,
  getBpns,
  type ErrorResult,
  type ExistingMat,
  type MatResult,
} from "@/lib/schach-engine";
import { getFedexMat, getMatAddon } from "@/lib/products-db";

/** Curated list of standard sukkah sizes the business sells (ported from OUR_SIZES). */
export const OUR_SUKKAH_SIZES: string[] = [
  "4x4", "4x6", "4x8",
  "6x4", "6x6", "6x8",
  "8x4", "8x6", "8x8", "8x10", "8x12", "8x16",
  "10x8", "10x10", "10x12", "10x16", "10x20",
  "12x8", "12x10", "12x12", "12x14", "12x16", "12x20", "12x24",
  "14x12",
  "16x8", "16x10", "16x12",
  "20x10", "20x12",
  "24x12",
];

/** Standard sukkah sizes that have a BPNS pole set, as "WxL". */
export function bpnsSizes(): string[] {
  const seen = new Set<string>();
  for (const key of Object.keys(BPNS())) {
    const [w, l] = key.split(",").map(Number);
    if (w === undefined || l === undefined) continue;
    seen.add(`${w}x${l}`);
  }
  return [...seen].sort((a, b) => {
    const av = a.split("x").map(Number);
    const bv = b.split("x").map(Number);
    return (av[0] ?? 0) - (bv[0] ?? 0) || (av[1] ?? 0) - (bv[1] ?? 0);
  });
}

export interface SchachInput {
  matType: string;
  /** Sukkah width (ft). */
  sukkahW: number;
  /** Sukkah length (ft). */
  sukkahL: number;
  /** Which dimension the poles run along; null = derive from BPNS. */
  poleFt: number | null;
  isOurSukkah: boolean;
  fedex: boolean;
  existing: ExistingMat[];
}

export interface SchachResult {
  poleFt: number;
  totalWidth: number;
  cheapOptions: MatResult[];
  fewestOptions: MatResult[];
  bpnsCode: string | null;
  bpnsPoles: number | null;
  bpnsPrice: number | null;
  error?: string;
}

function isErr(r: MatResult | ErrorResult | null | undefined): r is ErrorResult {
  return !!r && "error" in r && !!(r as ErrorResult).error;
}

function matCount(r: MatResult): number {
  return (r.new_mats ?? []).reduce((s, m) => s + (m.qty ?? 1), 0);
}

function optionKey(r: MatResult): string {
  return (r.new_mats ?? [])
    .map((m) => `${m.code}x${m.qty}`)
    .sort()
    .join("|");
}

function packagedResult(
  code: string,
  price: number,
  poleFt: number,
  totalWidth: number,
  breakdown: MatResult | ErrorResult,
  flag: "catalog_code" | "fedex_code",
): MatResult {
  const bd = isErr(breakdown) ? null : breakdown;
  return {
    roll_used: poleFt,
    roll_exact: true,
    roll_short: false,
    rows: bd?.rows ?? 1,
    covered_depth: poleFt,
    new_mats: [
      {
        code,
        width: totalWidth,
        roll: poleFt,
        price,
        qty: 1,
        qty_per_row: 1,
        line_total: price,
      },
    ],
    reused: [],
    not_reused: [],
    total_new: price,
    covered_width: totalWidth,
    total_width_needed: totalWidth,
    gap: 0,
    [flag]: true,
    mat_breakdown: bd,
    supports: bd?.supports ?? undefined,
  } as MatResult;
}

/** Mirrors SchachTab.calculate() from schach_tab.py. */
export function runSchach(input: SchachInput): SchachResult {
  const { matType, sukkahW: w, sukkahL: l, isOurSukkah, fedex, existing } = input;

  const bpns = getBpns(w, l);
  const poleFt = input.poleFt ?? (isOurSukkah && bpns ? bpns.pole_ft : null);

  const base: SchachResult = {
    poleFt: poleFt ?? 0,
    totalWidth: 0,
    cheapOptions: [],
    fewestOptions: [],
    bpnsCode: bpns?.code ?? null,
    bpnsPoles: bpns?.num_poles ?? null,
    bpnsPrice: bpns?.price ?? null,
  };

  if (!w || !l || w <= 0 || l <= 0) return { ...base, error: "Enter valid sukkah dimensions." };
  if (poleFt === null) return { ...base, error: "Select which way the poles run." };

  const totalWidth = poleFt === w ? l : w;
  base.totalWidth = totalWidth;

  let cheapest: MatResult | ErrorResult;
  let fewest: MatResult | ErrorResult;

  if (fedex && isOurSukkah) {
    if (existing.length) {
      cheapest = calculateMatsCheapest(matType, poleFt, totalWidth, existing, true);
      fewest = calculateMatsFewest(matType, poleFt, totalWidth, existing, true);
    } else {
      const size = `${w}x${l}`;
      const rev = `${l}x${w}`;
      const fx =
        getFedexMat("SY", size, matType) ??
        getFedexMat("DL", size, matType) ??
        getFedexMat("SY", rev, matType) ??
        getFedexMat("DL", rev, matType);
      const fxCalc = calculateMatsCheapest(matType, poleFt, totalWidth, [], true);
      if (fx && fx.price != null) {
        const packed = packagedResult(fx.code, fx.price, poleFt, totalWidth, fxCalc, "fedex_code");
        cheapest = packed;
        fewest = packed;
      } else {
        cheapest = fxCalc;
        fewest = calculateMatsFewest(matType, poleFt, totalWidth, [], true);
      }
    }
  } else if (isOurSukkah && !fedex) {
    if (existing.length) {
      cheapest = calculateMatsCheapest(matType, poleFt, totalWidth, existing, false);
      fewest = calculateMatsFewest(matType, poleFt, totalWidth, existing, false);
    } else {
      const size = `${w}x${l}`;
      const rev = `${l}x${w}`;
      const addon =
        getMatAddon("SY", size, matType) ??
        getMatAddon("DL", size, matType) ??
        getMatAddon("SY", rev, matType) ??
        getMatAddon("DL", rev, matType);
      const calc = calculateMatsCheapest(matType, poleFt, totalWidth, [], false);
      cheapest =
        addon && addon.price != null
          ? packagedResult(addon.code, addon.price, poleFt, totalWidth, calc, "catalog_code")
          : calc;
      fewest = calculateMatsFewest(matType, poleFt, totalWidth, [], false);
    }
  } else {
    cheapest = calculateMatsCheapest(matType, poleFt, totalWidth, existing, fedex);
    fewest = calculateMatsFewest(matType, poleFt, totalWidth, existing, fedex);
  }

  if (isErr(cheapest) && isErr(fewest)) {
    return { ...base, error: cheapest.error };
  }

  let cheapOptions: MatResult[];
  let fewestOptions: MatResult[];

  if (!existing.length) {
    const allOpts = calculateAllOptions(matType, poleFt, totalWidth, [], fedex, 8);

    if (isOurSukkah && !fedex && !isErr(cheapest) && cheapest["catalog_code"]) {
      const bd = cheapest["mat_breakdown"] as MatResult | null;
      const catKey = bd && !isErr(bd) ? optionKey(bd) : null;
      const unique = catKey ? allOpts.filter((o) => optionKey(o) !== catKey) : allOpts;
      cheapOptions = [cheapest, ...unique.slice(0, 5)];
    } else if (isOurSukkah && fedex && !isErr(cheapest) && cheapest["fedex_code"]) {
      cheapOptions = [cheapest, ...allOpts.slice(0, 5)];
    } else {
      const sorted = [...allOpts].sort(
        (a, b) => a.total_new - b.total_new || matCount(a) - matCount(b),
      );
      cheapOptions = sorted.length ? sorted : isErr(cheapest) ? [] : [cheapest];
    }

    const sortedFewest = [...allOpts].sort(
      (a, b) =>
        matCount(a) - matCount(b) ||
        (a.covered_depth ?? 0) - (a.pole_ft ?? 0) - ((b.covered_depth ?? 0) - (b.pole_ft ?? 0)) ||
        a.total_new - b.total_new,
    );
    fewestOptions = sortedFewest.length ? sortedFewest : isErr(fewest) ? [] : [fewest];
  } else {
    const cheapFresh = calculateMatsCheapest(matType, poleFt, totalWidth, [], fedex);
    const fewestFresh = calculateMatsFewest(matType, poleFt, totalWidth, [], fedex);

    const reuseCheap = calculateMatsWithReuse(matType, poleFt, totalWidth, existing, fedex, false);
    const reuseFewest = calculateMatsWithReuse(matType, poleFt, totalWidth, existing, fedex, true);

    // Multiple genuinely reuse-based options (same reused mats, different fills).
    const reuseVariants = calculateReuseOptions(matType, poleFt, totalWidth, existing, fedex, 5);

    if (reuseCheap && !isErr(reuseCheap)) {
      const current = isErr(cheapest) ? Infinity : cheapest.total_new;
      if (reuseCheap.total_new < current) cheapest = reuseCheap;
    }
    if (reuseFewest && !isErr(reuseFewest)) {
      const current = isErr(fewest) ? Infinity : matCount(fewest);
      if (matCount(reuseFewest) < current) fewest = reuseFewest;
    }

    // Even when reusing, surface several fresh alternatives so the user has
    // real options to browse (parity with the no-reuse path).
    const freshOpts = calculateAllOptions(matType, poleFt, totalWidth, [], fedex, 8);

    const dedupe = (list: (MatResult | ErrorResult | null)[]): MatResult[] => {
      const seen = new Set<string>();
      const out: MatResult[] = [];
      for (const r of list) {
        if (!r || isErr(r)) continue;
        const key = optionKey(r) + `|${(r.reused ?? []).map((x) => `${x.width}x${x.roll}x${x.qty}`).join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
      return out.slice(0, 6);
    };

    const freshByCost = [...freshOpts].sort(
      (a, b) => a.total_new - b.total_new || matCount(a) - matCount(b),
    );
    const freshByCount = [...freshOpts].sort(
      (a, b) => matCount(a) - matCount(b) || a.total_new - b.total_new,
    );

    const reuseByCost = [...reuseVariants].sort(
      (a, b) => a.total_new - b.total_new || matCount(a) - matCount(b),
    );
    const reuseByCount = [...reuseVariants].sort(
      (a, b) => matCount(a) - matCount(b) || a.total_new - b.total_new,
    );

    cheapOptions = dedupe([cheapest, ...reuseByCost, cheapFresh, ...freshByCost]);
    fewestOptions = dedupe([fewest, ...reuseByCount, fewestFresh, ...freshByCount]);
  }

  return { ...base, cheapOptions, fewestOptions };
}