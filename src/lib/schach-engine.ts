import { getBlob } from "@/lib/data-store";

/**
 * Schach Mat Calculator Engine (ported from schach_engine.py)
 * -----------------------------
 * All mat data, BPNS pole data, and combination-solving logic.
 * Pure math and data only -- no UI.
 *
 * Key concepts:
 * - Mat code = prefix + WWLL where WW=width, LL=roll length
 * - Width  = first number = how wide the mat is laid across the poles
 * - Roll   = second number = how far it rolls down (along the poles)
 * - Poles span one dimension of the sukkah; mats are laid perpendicular
 *   and roll down the pole direction.
 * - Total width needed = the non-pole dimension of the sukkah
 * - Roll needed        = the pole dimension of the sukkah
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatEntry {
  code: string;
  width: number;
  roll: number;
  price: number;
}

export interface BpnsEntry {
  code: string;
  num_poles: number;
  pole_ft: number;
  price: number;
}

export interface SupportsResult {
  supports_per_row: number;
  total_supports: number;
  positions: number[];
  rows: number;
}

export interface SupportMatComboInput {
  width: number;
  roll?: number;
  qty?: number;
  qty_per_row?: number;
}

export interface ExistingMat {
  width: number;
  roll: number;
}

export interface WidthComboEntry {
  code: string;
  width: number;
  roll: number;
  price: number;
  qty: number;
}

export interface NewMatLine {
  code: string;
  width: number;
  roll: number;
  price: number;
  qty: number;
  line_total: number;
  qty_per_row?: number;
  rows?: number;
  fill_mat?: boolean;
  gap_fill?: boolean;
  covers_w?: number;
  covers_gap?: number;
  row1_fill?: boolean;
}

export interface ReusedEntry {
  width: number;
  roll: number;
  qty: number;
}

export interface NotReusedEntry {
  width: number;
  roll: number;
}

export interface ErrorResult {
  error: string;
}

export interface RowLayout {
  roll: number;
  mats: {
    code: string;
    width: number;
    roll: number;
    price: number;
    qty: number;
    qty_per_row: number;
  }[];
}

/** General flexible result-dict shape shared by the various builder functions. */
export interface MatResult {
  roll_used?: number;
  roll_combo?: number[];
  row_layouts?: RowLayout[];
  rows?: number;
  new_rows?: number;
  roll_exact?: boolean;
  roll_short?: boolean;
  depth_exact?: boolean;
  covered_depth?: number;
  new_mats: NewMatLine[];
  reused?: ReusedEntry[];
  reused_as_rows?: boolean;
  reused_in_row?: boolean;
  reused_stacked?: boolean;
  general_reuse?: boolean;
  case_b_reuse?: boolean;
  ex_width?: number;
  ex_rolls?: number[];
  ex_widths?: number[];
  ex_roll?: number;
  fill_roll?: number;
  depth_roll?: number;
  depth_rows?: number;
  subset?: [number, number][];
  fill_mats?: any[];
  gap_mats?: any[];
  not_reused?: NotReusedEntry[];
  total_new: number;
  covered_width?: number;
  total_width_needed?: number;
  pole_ft?: number;
  gap?: number;
  supports?: SupportsResult;
  multi_roll?: boolean;
  _mat_types?: number;
  _total_mats?: number;
  _sort_key?: any[];
  [key: string]: any;
}

export interface CalculateMatsResult {
  roll_used: number;
  roll_exact: boolean;
  new_mats: NewMatLine[];
  reused: ReusedEntry[];
  not_reused: NotReusedEntry[];
  total_new: number;
  covered_width: number;
  total_width_needed: number;
  gap: number;
}

// ---------------------------------------------------------------------------
// MAT CATALOG  (code, width, roll, price)
// ---------------------------------------------------------------------------

function mk(code: string, width: number, roll: number, price: number): MatEntry {
  return { code, width, roll, price };
}

export function MATS(): Record<string, MatEntry[]> {
  return getBlob("schach-mats");
}

// FedEx variants -- same code + FX suffix, same price (some differ)
// Stored separately so the calculator can offer FX option
export function MATS_FEDEX(): Record<string, MatEntry[]> {
  return getBlob("schach-mats-fedex");
}

// ---------------------------------------------------------------------------
// BPNS POLE TABLE
// (sukkah_w, sukkah_l) -> (bpns_code, num_poles, pole_ft, price)
// pole_ft = which dimension the poles span
// The other dimension is what the mats cover (roll direction)
// ---------------------------------------------------------------------------

function bpnsKey(w: number, l: number): string {
  return `${w},${l}`;
}

export function BPNS(): Record<string, BpnsEntry> {
  return getBlob("schach-bpns");
}

/** Return the bpns entry (code, num_poles, pole_ft, price) or null if not in catalog. */
export function getBpns(w: number, l: number): BpnsEntry | null {
  return BPNS()[bpnsKey(w, l)] ?? BPNS()[bpnsKey(l, w)] ?? null;
}

/**
 * Number of support poles/wood pieces needed per mat.
 * Rule: width <= 4' -> 2 supports, width > 4' -> 3 supports.
 */
export function supportsPerMat(matWidth: number): number {
  return matWidth <= 4 ? 2 : 3;
}

/**
 * Calculate total number of support poles needed and their positions.
 *
 * Each mat gets its own poles -- no sharing at boundaries.
 * Rule: width <= 4' -> 2 poles per mat, width > 4' -> 3 poles per mat
 *
 * matCombos: list of objects with width, roll, qty_per_row
 * rows: number of rows of mats
 *
 * Returns:
 *   supports_per_row, total_supports, positions (x-feet from left)
 */
export function calculateSupports(matCombos: SupportMatComboInput[], rows = 1): SupportsResult {
  const positions: number[] = [];
  let x = 0.0;

  for (const m of matCombos) {
    const matW = m.width;
    const qty = m.qty_per_row !== undefined ? m.qty_per_row : Math.floor((m.qty ?? 0) / Math.max(rows, 1));
    const nSup = supportsPerMat(matW);

    for (let _q = 0; _q < qty; _q++) {
      for (let i = 0; i < nSup; i++) {
        let pos: number;
        if (nSup === 1) {
          pos = x + matW / 2;
        } else {
          pos = x + (i * matW) / (nSup - 1);
        }
        positions.push(Math.round(pos * 100) / 100);
      }
      x += matW;
    }
  }

  return {
    supports_per_row: positions.length,
    total_supports: positions.length * rows,
    positions,
    rows,
  };
}

export const FEDEX_MAX_ROLL = 7; // mats longer than 7'10'' cannot ship via FedEx (rounds to 7')

/** All distinct roll lengths available for a mat type, sorted. */
export function availableRolls(matType: string, fedex = false): number[] {
  const rolls = new Set<number>();
  for (const m of MATS()[matType] ?? []) {
    if (!fedex || m.width <= FEDEX_MAX_ROLL) rolls.add(m.roll);
  }
  return Array.from(rolls).sort((a, b) => a - b);
}

/** All mats of a given type with exactly this roll length, sorted widest first. */
export function matsForRoll(matType: string, roll: number, fedex = false): MatEntry[] {
  const allMats = (MATS()[matType] ?? []).filter(
    (m) => m.roll === roll && (!fedex || m.width <= FEDEX_MAX_ROLL)
  );
  return stableSortBy(allMats, (m) => -m.width);
}

/**
 * Find the best roll length for this mat type:
 * exact match first, otherwise the next size up.
 * If nothing is long enough, return the longest available.
 * Returns the roll length or null if no mats exist at all.
 */
export function nextRollUp(matType: string, rollNeeded: number, fedex = false): number | null {
  const rolls = availableRolls(matType, fedex);
  if (rolls.length === 0) return null;
  const exact = rolls.filter((r) => r === rollNeeded);
  if (exact.length) return exact[0] ?? null;
  const longer = rolls.filter((r) => r > rollNeeded);
  if (longer.length) return Math.min(...longer);
  return Math.max(...rolls);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Stable sort by numeric key (mirrors python's stable sorted(..., key=...)). */
function stableSortBy<T>(arr: T[], key: (x: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i, k: key(v) }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map((x) => x.v);
}

function ceilDiv(a: number, b: number): number {
  return -Math.floor(-a / b);
}

/** Generate all combinations (without replacement) of size r from arr, itertools.combinations style. */
function* combinations<T>(arr: T[], r: number): Generator<T[]> {
  const n = arr.length;
  if (r > n || r < 0) return;
  const indices = Array.from({ length: r }, (_, i) => i);
  while (true) {
    yield indices.map((i) => arr[i] as T);
    let i = r - 1;
    while (i >= 0 && indices[i] === i + n - r) i--;
    if (i < 0) return;
    indices[i] = (indices[i] ?? 0) + 1;
    for (let j = i + 1; j < r; j++) indices[j] = (indices[j - 1] ?? 0) + 1;
  }
}

/** itertools.chain.from_iterable(combinations(lst, r) for r in range(1, len(lst)+1)) */
function* powerset<T>(lst: T[]): Generator<T[]> {
  for (let r = 1; r <= lst.length; r++) {
    yield* combinations(lst, r);
  }
}

// ---------------------------------------------------------------------------
// COMBINATION SOLVER
// ---------------------------------------------------------------------------

/**
 * Find the CHEAPEST combination of mats (same roll) that covers total_width.
 * Uses dynamic programming -- fast even for large widths.
 */
export function _solve_width_cheapest(
  matType: string,
  roll: number,
  totalWidth: number,
  existingWidths: number[] | null = null,
  fedex = false
): WidthComboEntry[] | null {
  const avail = matsForRoll(matType, roll, fedex);
  if (!avail.length) return null;

  const covered = existingWidths ? existingWidths.reduce((a, b) => a + b, 0) : 0;
  const remaining = totalWidth - covered;
  if (remaining <= 0) return [];

  const widthToMat: Record<number, { code: string; price: number }> = {};
  for (const m of stableSortBy(avail, (m) => m.price / m.width)) {
    if (!(m.width in widthToMat)) widthToMat[m.width] = { code: m.code, price: m.price };
  }

  const widths = Object.keys(widthToMat).map(Number).sort((a, b) => b - a); // largest first

  const INF = Infinity;
  const dpCost = new Array(remaining + 1).fill(INF);
  dpCost[0] = 0;
  const dpFrom: (number | null)[] = new Array(remaining + 1).fill(null);
  const dpMinPiece = new Array(remaining + 1).fill(INF);
  dpMinPiece[0] = INF;

  for (let n = 1; n <= remaining; n++) {
    for (const w of widths) {
      if (w <= n) {
        const prevMin = dpMinPiece[n - w];
        const thisMin = prevMin < INF ? Math.min(prevMin, w) : w;
        const newCost = dpCost[n - w] + widthToMat[w].price;
        if (newCost < dpCost[n] || (newCost === dpCost[n] && thisMin > dpMinPiece[n])) {
          dpCost[n] = newCost;
          dpFrom[n] = w;
          dpMinPiece[n] = thisMin;
        }
      }
    }
  }

  if (dpCost[remaining] < INF) {
    const combo: Record<number, number> = {};
    let n = remaining;
    while (n > 0) {
      const w = dpFrom[n]!;
      combo[w] = (combo[w] ?? 0) + 1;
      n -= w;
    }
    const result: WidthComboEntry[] = Object.entries(combo).map(([wStr, qty]) => {
      const w = Number(wStr);
      const { code, price } = widthToMat[w];
      return { code, width: w, roll, price, qty };
    });
    return result.sort((a, b) => b.width - a.width);
  }

  // No exact solution -- find cheapest combo that covers remaining
  let bestCost = INF;
  let bestOverhang = INF;
  let bestResult: WidthComboEntry[] | null = null;

  for (const topW of [...widths].sort((a, b) => a - b)) {
    const { code: codeTop, price: priceTop } = widthToMat[topW];
    const exactNeeded = remaining - topW;
    if (exactNeeded < 0) {
      const overhang = topW - remaining;
      const total = priceTop;
      if (total < bestCost || (total === bestCost && overhang < bestOverhang)) {
        bestCost = total;
        bestOverhang = overhang;
        bestResult = [{ code: codeTop, width: topW, roll, price: priceTop, qty: 1 }];
      }
    } else if (dpCost[exactNeeded] < INF) {
      const total = dpCost[exactNeeded] + priceTop;
      const overhang = topW;
      if (total < bestCost || (total === bestCost && overhang < bestOverhang)) {
        bestCost = total;
        bestOverhang = overhang;
        const combo: Record<number, number> = {};
        let n = exactNeeded;
        while (n > 0) {
          const w = dpFrom[n]!;
          combo[w] = (combo[w] ?? 0) + 1;
          n -= w;
        }
        const result: WidthComboEntry[] = Object.entries(combo).map(([wStr, qty]) => {
          const w = Number(wStr);
          return { code: widthToMat[w].code, width: w, roll, price: widthToMat[w].price, qty };
        });
        let found = false;
        for (const r of result) {
          if (r.width === topW) {
            r.qty += 1;
            found = true;
            break;
          }
        }
        if (!found) {
          result.push({ code: codeTop, width: topW, roll, price: priceTop, qty: 1 });
        }
        bestResult = result.sort((a, b) => b.width - a.width);
      }
    }
  }

  if (bestResult) return bestResult;

  // Last resort: extend DP to cover remaining with minimal cost and overhang
  const maxCover = remaining + Math.max(...widths);
  const dpCost2 = new Array(maxCover + 1).fill(INF);
  dpCost2[0] = 0;
  const dpFrom2: (number | null)[] = new Array(maxCover + 1).fill(null);

  for (let n = 1; n <= maxCover; n++) {
    for (const w of widths) {
      if (w <= n && dpCost2[n - w] + widthToMat[w].price < dpCost2[n]) {
        dpCost2[n] = dpCost2[n - w] + widthToMat[w].price;
        dpFrom2[n] = w;
      }
    }
  }

  let bestCost3 = INF;
  let bestResult3: WidthComboEntry[] | null = null;
  for (let cover = remaining; cover <= maxCover; cover++) {
    if (dpCost2[cover] < bestCost3) {
      bestCost3 = dpCost2[cover];
      const combo: Record<number, number> = {};
      let n = cover;
      while (n > 0) {
        const w = dpFrom2[n];
        if (w === null) break;
        combo[w] = (combo[w] ?? 0) + 1;
        n -= w;
      }
      if (Object.keys(combo).length) {
        const result: WidthComboEntry[] = Object.entries(combo).map(([wStr, qty]) => {
          const w = Number(wStr);
          return { code: widthToMat[w].code, width: w, roll, price: widthToMat[w].price, qty };
        });
        bestResult3 = result.sort((a, b) => b.width - a.width);
      }
    }
  }

  if (bestResult3) return bestResult3;
  const w0 = widths[0];
  return [{ code: widthToMat[w0].code, width: w0, roll, price: widthToMat[w0].price, qty: ceilDiv(remaining, w0) }];
}

/**
 * Find the FEWEST mats that cover total_width exactly (or closest over).
 */
export function _solve_width_fewest(
  matType: string,
  roll: number,
  totalWidth: number,
  existingWidths: number[] | null = null,
  fedex = false
): WidthComboEntry[] | null {
  const avail = matsForRoll(matType, roll, fedex);
  if (!avail.length) return null;

  const covered = existingWidths ? existingWidths.reduce((a, b) => a + b, 0) : 0;
  const remaining = totalWidth - covered;
  if (remaining <= 0) return [];

  const widthsAvail = Array.from(new Set(avail.map((m) => m.width))).sort((a, b) => b - a);
  const widthToMat: Record<number, { code: string; price: number }> = {};
  for (const m of stableSortBy(avail, (m) => m.price)) {
    if (!(m.width in widthToMat)) widthToMat[m.width] = { code: m.code, price: m.price };
  }

  // Try exact divisors first (uniform mats, fewest count)
  for (const w of widthsAvail) {
    if (remaining % w === 0) {
      const { code, price } = widthToMat[w];
      const qty = remaining / w;
      return [{ code, width: w, roll, price, qty }];
    }
  }

  // No exact fit -- use largest mat as many times as it fits, then fill remainder
  const result: WidthComboEntry[] = [];
  let rem = remaining;
  for (const w of widthsAvail) {
    if (w <= rem) {
      const { code, price } = widthToMat[w];
      const qty = Math.floor(rem / w);
      result.push({ code, width: w, roll, price, qty });
      rem -= qty * w;
    }
    if (rem <= 0) break;
  }

  if (rem > 0) {
    const candidates = avail
      .filter((m) => m.width >= rem)
      .map((m) => ({ width: m.width, code: m.code, price: m.price }))
      .sort((a, b) => a.width - b.width);
    if (candidates.length) {
      const { width: w, code, price } = candidates[0];
      result.push({ code, width: w, roll, price, qty: 1 });
    } else {
      const biggest = avail[0];
      const qty = ceilDiv(rem, biggest.width);
      result.push({ code: biggest.code, width: biggest.width, roll, price: biggest.price, qty });
    }
  }

  return result;
}

/**
 * NOTE: In the original Python source, calculate_mats() calls an undefined
 * function `_solve_width` (never defined anywhere in schach_engine.py), so
 * calling it there raises a NameError at runtime. This port reproduces that
 * exact behavior by throwing when invoked.
 */
export function calculateMats(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[] | null = null,
  fedex = false
): CalculateMatsResult | ErrorResult | null {
  if (!(matType in MATS)) return null;

  existing = existing ?? [];

  const roll = nextRollUp(matType, poleFt);
  if (roll === null) {
    return { error: `No ${matType} mat has a roll long enough for ${poleFt}' poles.` };
  }

  const rollExact = roll === poleFt;

  const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);

  // NOTE: `_solve_width` is not defined in the source Python file either.
  throw new ReferenceError("name '_solve_width' is not defined");
}

/**
 * How many rows of mats (each 'roll' feet long) to cover 'pole_ft' depth.
 * Never a gap -- always rounds UP.
 */
export function _rows_needed(roll: number, poleFt: number): number {
  return ceilDiv(poleFt, roll);
}

/** Build the standard result dict from a solved width combo + row count. */
export function _build_result(
  matType: string,
  roll: number,
  rows: number,
  widthCombo: WidthComboEntry[],
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex: boolean
): MatResult {
  const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);
  const newMats: NewMatLine[] = [];
  let totalNew = 0;
  for (const c of widthCombo) {
    const totalQty = c.qty * rows;
    const lineTotal = c.price * totalQty;
    totalNew += lineTotal;
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: totalQty, qty_per_row: c.qty, rows, line_total: lineTotal,
    });
  }

  const coveredWidth = widthCombo.reduce((a, c) => a + c.width * c.qty, 0) + existingWidths.reduce((a, b) => a + b, 0);
  const coveredDepth = roll * rows;

  const matCombosForSupports: SupportMatComboInput[] = widthCombo.map((c) => ({
    width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty,
  }));
  const supports = calculateSupports(matCombosForSupports, rows);

  return {
    roll_used: roll,
    rows,
    roll_exact: roll === poleFt,
    roll_short: false,
    depth_exact: coveredDepth === poleFt,
    covered_depth: coveredDepth,
    new_mats: newMats,
    reused: existing.filter((e) => e.roll >= poleFt).map((e) => ({ width: e.width, roll: e.roll, qty: 1 })),
    not_reused: existing.filter((e) => e.roll < poleFt).map((e) => ({ width: e.width, roll: e.roll })),
    total_new: totalNew,
    covered_width: coveredWidth,
    total_width_needed: totalWidth,
    pole_ft: poleFt,
    gap: 0,
    supports,
  };
}

/**
 * Build result when existing mats are used as partial rows.
 * reusedAsRows: list of (width, roll) mats that cover part of the depth.
 * newRows: how many additional rows to buy.
 */
export function _build_result_with_partial_reuse(
  matType: string,
  roll: number,
  newRows: number,
  widthCombo: WidthComboEntry[],
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  reusedAsRows: ExistingMat[],
  fedex: boolean
): MatResult {
  const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);
  const reusedDepth = reusedAsRows.reduce((a, e) => a + e.roll, 0);
  const totalRows = newRows + reusedAsRows.length;

  const newMats: NewMatLine[] = [];
  let totalNew = 0;
  for (const c of widthCombo) {
    const totalQty = c.qty * newRows;
    const lineTotal = c.price * totalQty;
    totalNew += lineTotal;
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: totalQty, qty_per_row: c.qty, rows: newRows, line_total: lineTotal,
    });
  }

  const coveredWidth = widthCombo.reduce((a, c) => a + c.width * c.qty, 0) + existingWidths.reduce((a, b) => a + b, 0);
  const coveredDepth = reusedDepth + roll * newRows;

  const matCombosForSupports: SupportMatComboInput[] = widthCombo.map((c) => ({
    width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty,
  }));
  const supports = calculateSupports(matCombosForSupports, totalRows);

  return {
    roll_used: roll,
    rows: totalRows,
    new_rows: newRows,
    roll_exact: roll === poleFt,
    roll_short: false,
    depth_exact: coveredDepth >= poleFt,
    covered_depth: coveredDepth,
    new_mats: newMats,
    reused: reusedAsRows.map((e) => ({ width: e.width, roll: e.roll, qty: 1 })),
    reused_as_rows: true,
    not_reused: [],
    total_new: totalNew,
    covered_width: coveredWidth,
    total_width_needed: totalWidth,
    pole_ft: poleFt,
    gap: 0,
    supports,
  };
}

/** How many feet the mats overhang past the sukkah depth. */
export function _overhang(roll: number, poleFt: number): number {
  const rows = _rows_needed(roll, poleFt);
  return rows * roll - poleFt;
}

type SolverFn = (
  matType: string,
  roll: number,
  totalWidth: number,
  existingWidths: number[] | null,
  fedex: boolean
) => WidthComboEntry[] | null;

/**
 * Try using existing mats (even short ones) as partial rows,
 * then calculate only what's needed for remaining depth.
 * Returns best result or null.
 */
export function _try_partial_reuse(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex: boolean,
  solverFn: SolverFn
): MatResult | null {
  if (!existing.length) return null;

  const shortMats = existing.filter((e) => e.roll < poleFt).map((e) => [e.width, e.roll] as [number, number]);
  if (!shortMats.length) return null;

  const totalExWidth = shortMats.reduce((a, [w]) => a + w, 0);
  if (totalExWidth < totalWidth) return null;

  const byRoll = new Map<number, number[]>();
  for (const [w, r] of shortMats) {
    if (!byRoll.has(r)) byRoll.set(r, []);
    byRoll.get(r)!.push(w);
  }

  let best: MatResult | null = null;

  for (const [exRoll, exWidths] of byRoll) {
    const rowWidth = exWidths.reduce((a, b) => a + b, 0);
    if (rowWidth < totalWidth) continue;

    const rowsToReuse: [number, number][] = exWidths.map((w) => [w, exRoll]);
    const reusedDepth = exRoll;
    const remainingDepth = poleFt - reusedDepth;

    if (remainingDepth <= 0) {
      const existingWidths = rowsToReuse.map(([w]) => w);
      if (existingWidths.reduce((a, b) => a + b, 0) >= totalWidth) {
        const result: MatResult = {
          roll_used: Math.max(...rowsToReuse.map(([, r]) => r)),
          rows: rowsToReuse.length,
          new_rows: 0,
          roll_exact: true,
          roll_short: false,
          depth_exact: true,
          covered_depth: reusedDepth,
          new_mats: [],
          reused: rowsToReuse.map(([w, r]) => ({ width: w, roll: r, qty: 1 })),
          reused_as_rows: true,
          not_reused: [],
          total_new: 0,
          covered_width: existingWidths.reduce((a, b) => a + b, 0),
          total_width_needed: totalWidth,
          pole_ft: poleFt,
          gap: 0,
          supports: calculateSupports([], rowsToReuse.length),
        };
        if (best === null || result.total_new < best.total_new) best = result;
      }
      continue;
    }

    const rolls = availableRolls(matType, fedex);
    const exactRolls = rolls.filter((r) => _overhang(r, remainingDepth) === 0);
    const goodRolls = rolls.filter((r) => _overhang(r, remainingDepth) > 0 && _overhang(r, remainingDepth) <= 1);
    const anyRolls = rolls;
    const rollsToTry = exactRolls.length ? exactRolls : goodRolls.length ? goodRolls : anyRolls;

    for (const roll of rollsToTry) {
      const newRows = _rows_needed(roll, remainingDepth);
      const widthCombo = solverFn(matType, roll, totalWidth, null, fedex);
      if (!widthCombo || !widthCombo.length) continue;

      const total = widthCombo.reduce((a, c) => a + c.price * c.qty, 0) * newRows;
      const result = _build_result_with_partial_reuse(
        matType, roll, newRows, widthCombo, poleFt, totalWidth, existing, rowsToReuse.map(([w, r]) => ({ width: w, roll: r })), fedex
      );

      if (best === null || total < best.total_new) best = result;
    }
  }

  // Case 2: stack same-width mats end-to-end (depth direction)
  const byWidth = new Map<number, number[]>();
  for (const [w, r] of shortMats) {
    if (!byWidth.has(w)) byWidth.set(w, []);
    byWidth.get(w)!.push(r);
  }

  for (const [exWidth, exRolls] of byWidth) {
    if (exRolls.length < 2) continue;
    const stackedDepth = exRolls.reduce((a, b) => a + b, 0);
    if (stackedDepth < poleFt) continue;
    if (stackedDepth > poleFt + 2) continue;

    const remainingW = totalWidth - exWidth;
    if (remainingW <= 0) continue;

    const rolls = availableRolls(matType, fedex);
    const exactR = rolls.filter((r) => _overhang(r, poleFt) === 0);
    const goodR = rolls.filter((r) => _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
    const fillRolls = exactR.length ? exactR : goodR.length ? goodR : rolls;

    for (const fillRoll of fillRolls) {
      const fillRows = _rows_needed(fillRoll, poleFt);
      const fillCombo = _solve_width_cheapest(matType, fillRoll, remainingW, [], fedex);
      if (!fillCombo || !fillCombo.length) continue;
      const fillCost = fillCombo.reduce((a, c) => a + c.price * c.qty, 0) * fillRows;

      if (best === null || fillCost < best.total_new) {
        const newMats: NewMatLine[] = fillCombo.map((c) => {
          const totalQty = c.qty * fillRows;
          return {
            code: c.code, width: c.width, roll: c.roll, price: c.price,
            qty: totalQty, qty_per_row: c.qty, rows: fillRows,
            line_total: c.price * totalQty, fill_mat: true,
          };
        });
        const reused: ReusedEntry[] = exRolls.map((r) => ({ width: exWidth, roll: r, qty: 1 }));
        const sup = calculateSupports(
          [
            ...exRolls.map((r) => ({ width: exWidth, roll: r, qty: 1, qty_per_row: 1 })),
            ...fillCombo.map((c) => ({ width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty })),
          ],
          1
        );

        best = {
          roll_used: fillRoll,
          rows: 1,
          roll_exact: true,
          roll_short: false,
          depth_exact: true,
          covered_depth: poleFt,
          new_mats: newMats,
          reused,
          reused_as_rows: false,
          reused_stacked: true,
          ex_width: exWidth,
          ex_rolls: exRolls,
          not_reused: [],
          total_new: fillCost,
          covered_width: totalWidth,
          total_width_needed: totalWidth,
          pole_ft: poleFt,
          gap: 0,
          supports: sup,
          general_reuse: true,
          subset: exRolls.map((r) => [exWidth, r] as [number, number]),
          fill_mats: fillCombo.map((c) => [c.code, c.width, c.roll, c.price, c.qty, fillRoll, fillRows]),
          gap_mats: [],
        };
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Higher-level "calculate_mats_*" solvers
// ---------------------------------------------------------------------------

/** Option 1: Cheapest. Also tries partial reuse of existing short mats. */
export function calculateMatsCheapest(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[] | null = null,
  fedex = false
): MatResult | ErrorResult {
  existing = existing ?? [];

  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) {
    return { error: `No ${matType} mats available` + (fedex ? " for FedEx shipping." : ".") };
  }

  const exactRolls = rolls.filter((r) => _overhang(r, poleFt) === 0);
  const goodRolls = rolls.filter((r) => _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
  const anyRolls = rolls;
  const rollsToTry = exactRolls.length ? exactRolls : goodRolls.length ? goodRolls : anyRolls;

  let best: MatResult | null = null;

  for (const roll of rollsToTry) {
    const rows = _rows_needed(roll, poleFt);
    const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);
    let widthCombo = _solve_width_cheapest(matType, roll, totalWidth, existingWidths, fedex);
    if (!widthCombo && totalWidth > existingWidths.reduce((a, b) => a + b, 0)) continue;
    widthCombo = widthCombo ?? [];

    const costPerRow = widthCombo.reduce((a, c) => a + c.price * c.qty, 0);
    const total = costPerRow * rows;
    const oh = _overhang(roll, poleFt);
    const matTypes = new Set(widthCombo.map((c) => c.code)).size;

    const bestOh = best ? _overhang(best.roll_used!, poleFt) : Infinity;
    const bestMatTypes = best ? (best._mat_types ?? 99) : 99;

    const better =
      best === null ||
      total < best.total_new ||
      (total === best.total_new && rows < (best.rows as number)) ||
      (total === best.total_new && rows === best.rows && matTypes < bestMatTypes) ||
      (total === best.total_new && oh < bestOh);

    if (better) {
      best = _build_result(matType, roll, rows, widthCombo, poleFt, totalWidth, existing, fedex);
      best._mat_types = matTypes;
    }
  }

  // Try partial reuse of existing short mats (legacy path)
  const partial = _try_partial_reuse(matType, poleFt, totalWidth, existing, fedex, _solve_width_cheapest);
  if (partial && (best === null || partial.total_new < best.total_new)) {
    best = partial;
  }

  // Try general reuse (build around existing mats) -- runs last, wins on equal cost
  if (existing.length) {
    const reuse = calculateMatsWithReuse(matType, poleFt, totalWidth, existing, fedex, false);
    if (reuse && (best === null || reuse.total_new < best.total_new || reuse.total_new === best.total_new)) {
      best = reuse;
    }
  }

  // Try multi-roll combinations (different roll per row)
  // NOTE: multi-roll never carries reuse data (it always sets reused: []),
  // so it must never replace a general_reuse result once one has been
  // found -- doing so silently drops the customer's existing mat from the
  // result and breaks the diagram (the mat gets rendered as if purchased).
  if (!best?.general_reuse) {
    const multi = calculateMatsMultiRoll(matType, poleFt, totalWidth, existing, fedex, false);
    if (
      multi &&
      (best === null ||
        multi.total_new < best.total_new ||
        (multi.total_new === best.total_new &&
          !best.general_reuse &&
          multi.new_mats.reduce((a, m) => a + m.qty, 0) < best.new_mats.reduce((a, m) => a + m.qty, 0)))
    ) {
      best = multi;
    }
  }


  // When costs are equal, prefer more uniform solution (fewer mat types)
  // But don't overwrite general_reuse result, and prefer fewer rows
  if (best && !best.general_reuse) {
    for (const roll of rollsToTry) {
      const rows = _rows_needed(roll, poleFt);
      const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);
      const widthComboF = _solve_width_fewest(matType, roll, totalWidth, existingWidths, fedex);
      if (!widthComboF) continue;
      const costF = widthComboF.reduce((a, c) => a + c.price * c.qty, 0) * rows;
      const typesF = new Set(widthComboF.map((c) => c.code)).size;
      const bestTypes = best._mat_types ?? 99;
      const bestRows = best.rows ?? 99;
      if (costF === best.total_new && (rows < bestRows || (rows === bestRows && typesF < bestTypes))) {
        const candidate = _build_result(matType, roll, rows, widthComboF, poleFt, totalWidth, existing, fedex);
        candidate._mat_types = typesF;
        best = candidate;
      }
    }
  }

  return best ?? { error: "Could not find a valid combination." };
}

/** Option 2: Fewest mats. Also tries partial reuse of existing short mats. */
export function calculateMatsFewest(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[] | null = null,
  fedex = false
): MatResult | ErrorResult {
  existing = existing ?? [];

  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) {
    return { error: `No ${matType} mats available` + (fedex ? " for FedEx shipping." : ".") };
  }

  const exactRolls = rolls.filter((r) => _overhang(r, poleFt) === 0);
  const goodRolls = rolls.filter((r) => _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
  const anyRollsFiltered = rolls.filter((r) => _overhang(r, poleFt) <= 1);
  const anyRolls = anyRollsFiltered.length ? anyRollsFiltered : rolls;
  const rollsToTry = exactRolls.length ? exactRolls : goodRolls.length ? goodRolls : anyRolls;

  let best: MatResult | null = null;

  for (const roll of rollsToTry) {
    const rows = _rows_needed(roll, poleFt);
    const existingWidths = existing.filter((e) => e.roll >= poleFt).map((e) => e.width);
    let widthCombo = _solve_width_fewest(matType, roll, totalWidth, existingWidths, fedex);
    if (!widthCombo && totalWidth > existingWidths.reduce((a, b) => a + b, 0)) continue;
    widthCombo = widthCombo ?? [];

    const matsPerRow = widthCombo.reduce((a, c) => a + c.qty, 0);
    const totalMats = matsPerRow * rows;
    const oh = _overhang(roll, poleFt);

    let better: boolean;
    if (best === null) {
      better = true;
    } else {
      const bestOh = _overhang(best.roll_used!, poleFt);
      const bestTotalMats = best._total_mats ?? Infinity;
      better =
        totalMats < bestTotalMats ||
        (totalMats === bestTotalMats && rows < (best.rows as number)) ||
        (totalMats === bestTotalMats && oh < bestOh);
    }

    if (better) {
      const result = _build_result(matType, roll, rows, widthCombo, poleFt, totalWidth, existing, fedex);
      result._total_mats = totalMats;
      best = result;
    }
  }

  // Try general reuse (build around existing mats)
  if (existing.length) {
    const reuseF = calculateMatsWithReuse(matType, poleFt, totalWidth, existing, fedex, true);
    if (reuseF) {
      const reuseCount = reuseF.new_mats.reduce((a, m) => a + m.qty, 0);
      const bestCount = best ? (best._total_mats ?? Infinity) : Infinity;
      if (
        best === null ||
        reuseF.total_new < best.total_new ||
        (reuseF.total_new === best.total_new && (reuseCount < bestCount || reuseF.general_reuse))
      ) {
        reuseF._total_mats = reuseCount;
        best = reuseF;
      }
    }
  }

  // Try partial reuse of existing short mats (legacy path)
  const partial = _try_partial_reuse(matType, poleFt, totalWidth, existing, fedex, _solve_width_fewest);
  if (partial && (best === null || partial.total_new < best.total_new)) {
    partial._total_mats = partial.new_mats.reduce((a, m) => a + m.qty, 0);
    best = partial;
  }

  // Try multi-roll combinations (different roll per row)
  // NOTE: same protection as calculateMatsCheapest -- multi-roll has no
  // reuse data, so it must never overwrite a general_reuse best result.
  if (!best?.general_reuse) {
    const multi = calculateMatsMultiRoll(matType, poleFt, totalWidth, existing, fedex, true);
    if (multi) {
      const multiCount = multi.new_mats.reduce((a, m) => a + m.qty, 0);
      const multiOh = (multi.covered_depth ?? 0) - poleFt;
      const bestCount = best ? (best._total_mats ?? Infinity) : Infinity;
      const bestOh = best ? (best.covered_depth ?? 0) - poleFt : Infinity;
      if (
        best === null ||
        (bestOh > 1 && multiOh <= 1) ||
        (multiOh <= 1 && multiCount < bestCount) ||
        (multiOh <= 1 && multiCount === bestCount && multi.total_new < best.total_new)
      ) {
        multi._total_mats = multiCount;
        best = multi;
      }
    }
  }


  return best ?? { error: "Could not find a valid combination." };
}

/**
 * Find cheapest mats to cover a gap of gap_width x gap_depth.
 * Must cover the full gap_width (overlap allowed but no gap in coverage).
 */
export function _cheapest_gap_fill(
  matType: string,
  gapDepth: number,
  gapWidth: number,
  fedex = false
): [WidthComboEntry[], number] {
  if (gapDepth <= 0) return [[], 0];

  const rolls = availableRolls(matType, fedex);
  let bestCost = Infinity;
  let bestCombo: WidthComboEntry[] = [];

  for (const roll of rolls) {
    if (roll < gapDepth * 0.4) continue;
    const rowsNeeded = _rows_needed(roll, gapDepth);

    const combo = _solve_width_cheapest(matType, roll, gapWidth, [], fedex);
    if (!combo || !combo.length) continue;

    const totalW = combo.reduce((a, c) => a + c.width * c.qty, 0);
    if (totalW < gapWidth) continue;

    const cost = combo.reduce((a, c) => a + c.price * c.qty, 0) * rowsNeeded;
    if (cost < bestCost) {
      bestCost = cost;
      bestCombo = combo.map((c) => ({ ...c, qty: c.qty * rowsNeeded }));
    }
  }

  return [bestCombo, bestCost];
}

/**
 * General reuse solver: try all subsets of existing mats, find cheapest total.
 *
 * For each subset of existing mats:
 * 1. Place them side by side on left side
 * 2. Buy full-depth mats to cover remaining width on right
 * 3. For each existing mat shorter than pole_ft, buy gap-fill mats below it
 * 4. Total = fill_cost + gap_costs
 * 5. Return cheapest that beats fresh price
 */
export function calculateMatsWithReuse(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex = false,
  fewest = false
): MatResult | null {
  if (!existing.length) return null;

  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) return null;

  let best: MatResult | null = null;
  let bestCost = Infinity;

  const existingTuples: [number, number][] = existing.map((e) => [e.width, e.roll]);

  for (const subset of powerset(existingTuples)) {
    const exTotalW = subset.reduce((a, [w]) => a + w, 0);

    if (exTotalW > totalWidth) continue;

    const remainingW = totalWidth - exTotalW;

    // Step 1: Buy full-depth mats for remaining width (right side)
    let fillCost = 0;
    let fillMats: [string, number, number, number, number, number, number][] = [];
    if (remainingW > 0) {
      const singleExact = rolls.filter((r) => r >= poleFt && _overhang(r, poleFt) === 0);
      const singleGood = rolls.filter((r) => r >= poleFt && _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
      const multiExact = rolls.filter((r) => r < poleFt && _overhang(r, poleFt) === 0);
      const multiGood = rolls.filter((r) => r < poleFt && _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
      const fillRolls = singleExact.length
        ? singleExact
        : singleGood.length
        ? singleGood
        : multiExact.length
        ? multiExact
        : multiGood.length
        ? multiGood
        : rolls;

      let fillFound = false;
      for (const fillRoll of fillRolls) {
        const fillRows = _rows_needed(fillRoll, poleFt);
        const combo = _solve_width_cheapest(matType, fillRoll, remainingW, [], fedex);
        if (!combo) continue;
        const fc = combo.reduce((a, c) => a + c.price * c.qty, 0) * fillRows;
        if (!fillFound || fc < fillCost) {
          fillCost = fc;
          fillMats = combo.map((c) => [c.code, c.width, c.roll, c.price, c.qty, fillRoll, fillRows]);
          fillFound = true;
        }
      }
      if (!fillFound) continue;
    }

    // Step 2: For each existing mat shorter than pole_ft, buy gap-fill mats
    const gapMatsAll: [string, number, number, number, number, number, number][] = [];
    let gapCostTotal = 0;
    let valid = true;

    for (const [exW, exRoll] of subset) {
      const gapDepth = poleFt - exRoll;
      if (gapDepth <= 0) continue;
      const [gapCombo, gapCost] = _cheapest_gap_fill(matType, gapDepth, exW, fedex);
      if ((!gapCombo || !gapCombo.length) && gapDepth > 0) {
        valid = false;
        break;
      }
      gapCostTotal += gapCost;
      for (const c of gapCombo) {
        gapMatsAll.push([c.code, c.width, c.roll, c.price, c.qty, exW, gapDepth]);
      }
    }

    if (!valid) continue;

    const totalCost = fillCost + gapCostTotal;
    if (totalCost < bestCost) {
      bestCost = totalCost;
      best = _build_general_reuse_result(matType, subset, fillMats, gapMatsAll, poleFt, totalWidth, existing, fedex, totalCost);
    }
  }

  return best;
}

/**
 * Generate MULTIPLE fresh (no-reuse) options sorted by cost.
 * Returns up to 10 distinct combinations of all-new mats.
 */
export function calculateFreshOptions(
  matType: string,
  poleFt: number,
  totalWidth: number,
  fedex = false
): MatResult[] {
  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) return [];

  const results: Array<{ cost: number; result: MatResult }> = [];
  const seen = new Set<string>();

  const exactRolls = rolls.filter((r) => _overhang(r, poleFt) === 0);
  const goodRolls = rolls.filter((r) => _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
  const rollsToTry = exactRolls.length ? exactRolls : goodRolls.length ? goodRolls : rolls;

  for (const roll of rollsToTry) {
    const rows = _rows_needed(roll, poleFt);
    const widthCombo = _solve_width_cheapest(matType, roll, totalWidth, null, fedex);
    if (!widthCombo) continue;

    const costPerRow = widthCombo.reduce((a, c) => a + c.price * c.qty, 0);
    const totalCost = costPerRow * rows;

    const result = _build_result(matType, roll, rows, widthCombo, poleFt, totalWidth, [], fedex);

    // Dedup
    const sig = (result.new_mats ?? [])
      .map((m) => `${m.code}x${m.qty}`)
      .sort()
      .join("|");

    if (!seen.has(sig)) {
      seen.add(sig);
      results.push({ cost: totalCost, result });
    }
  }

  // Sort by cost, return top 10
  return results
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 10)
    .map((r) => r.result);
}

/** Build result dict for general reuse scenario. */
export function _build_general_reuse_result(
  matType: string,
  subset: [number, number][],
  fillMats: [string, number, number, number, number, number, number][],
  gapMatsAll: [string, number, number, number, number, number, number][],
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex: boolean,
  totalCost: number
): MatResult {
  const newMats: NewMatLine[] = [];

  // Fill mats (right side, full depth)
  const seen: Record<string, NewMatLine> = {};
  for (const [c, w, r, p, qty, fillRoll, fillRows] of fillMats) {
    const totalQty = qty * fillRows;
    if (seen[c]) {
      seen[c].qty += totalQty;
      seen[c].line_total += p * totalQty;
    } else {
      seen[c] = {
        code: c, width: w, roll: r, price: p,
        qty: totalQty, qty_per_row: Math.floor(qty / Math.max(fillRows, 1)),
        rows: fillRows, line_total: p * totalQty, fill_mat: true,
      };
    }
  }
  for (const m of Object.values(seen)) newMats.push(m);

  // Gap fill mats (under existing mats)
  const gapSeen: Record<string, NewMatLine> = {};
  for (const [c, w, r, p, qty, exW, gapDepth] of gapMatsAll) {
    if (gapSeen[c]) {
      gapSeen[c].qty += qty;
      gapSeen[c].line_total += p * qty;
    } else {
      gapSeen[c] = {
        code: c, width: w, roll: r, price: p,
        qty, qty_per_row: qty, rows: 1,
        line_total: p * qty, gap_fill: true,
        covers_w: exW, covers_gap: gapDepth,
      };
    }
  }
  for (const m of Object.values(gapSeen)) newMats.push(m);

  const reused: ReusedEntry[] = subset.map(([w, r]) => ({ width: w, roll: r, qty: 1 }));
  const subsetSet = new Set(subset.map(([w, r]) => `${w},${r}`));
  const notReused: NotReusedEntry[] = existing
    .filter((e) => !subsetSet.has(`${e.width},${e.roll}`))
    .map((e) => ({ width: e.width, roll: e.roll }));

  // Support calc (approximate)
  const allSupMats: SupportMatComboInput[] = [];
  for (const [w, r] of subset) {
    allSupMats.push({ width: w, roll: r, qty: 1, qty_per_row: 1 });
  }
  for (const m of newMats) {
    if (m.fill_mat) {
      allSupMats.push({ width: m.width, roll: m.roll, qty: m.qty_per_row ?? 1, qty_per_row: m.qty_per_row ?? 1 });
    }
  }
  const sup = calculateSupports(allSupMats, 1);

  const fillRoll = fillMats.length ? Math.max(...fillMats.map((f) => f[5])) : poleFt;
  const exWidths = subset.map(([w]) => w);

  return {
    roll_used: fillRoll,
    rows: 1,
    roll_exact: true,
    roll_short: false,
    depth_exact: true,
    covered_depth: poleFt,
    new_mats: newMats,
    reused,
    reused_as_rows: false,
    reused_in_row: true,
    general_reuse: true,
    subset: subset,
    ex_widths: exWidths,
    fill_mats: fillMats,
    gap_mats: gapMatsAll,
    not_reused: notReused,
    total_new: totalCost,
    covered_width: totalWidth,
    total_width_needed: totalWidth,
    pole_ft: poleFt,
    gap: 0,
    supports: sup,
  };
}

/**
 * Build result for Case B reuse (dead code in the original Python -- kept
 * for parity but never invoked by any caller):
 * - Existing mats (ex_roll deep) in left portion of Row 1
 * - Fill mats (fill_roll deep, covers full pole_ft) in right portion
 * - Depth mats (depth_roll) cover remaining depth under existing mat area only
 */
export function _build_reuse_result_b(
  matType: string,
  exRoll: number,
  fillRoll: number,
  depthRoll: number,
  exWidths: number[],
  row1Fill: WidthComboEntry[],
  depthCombo: WidthComboEntry[],
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex: boolean,
  totalCost: number,
  depthRows = 0
): MatResult {
  const newMats: NewMatLine[] = [];

  for (const c of row1Fill) {
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: c.qty, qty_per_row: c.qty, rows: 1,
      line_total: c.price * c.qty, row1_fill: true,
    });
  }

  for (const c of depthCombo) {
    const totalQty = c.qty * depthRows;
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: totalQty, qty_per_row: c.qty, rows: depthRows,
      line_total: c.price * totalQty,
    });
  }

  const reused: ReusedEntry[] = exWidths.map((w) => ({ width: w, roll: exRoll, qty: 1 }));
  const coveredDepth = Math.max(fillRoll, exRoll + depthRoll * depthRows);

  const allMatsForSup: SupportMatComboInput[] = exWidths.map((w) => ({
    width: w, roll: exRoll, qty: 1, qty_per_row: 1,
  }));
  for (const c of row1Fill) {
    allMatsForSup.push({ width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty });
  }
  const sup = calculateSupports(allMatsForSup, 1);

  return {
    roll_used: fillRoll,
    rows: 1 + depthRows,
    new_rows: depthRows,
    roll_exact: coveredDepth >= poleFt,
    roll_short: false,
    depth_exact: coveredDepth >= poleFt,
    covered_depth: coveredDepth,
    new_mats: newMats,
    reused,
    reused_as_rows: false,
    reused_in_row: true,
    case_b_reuse: true,
    ex_roll: exRoll,
    ex_widths: exWidths,
    fill_roll: fillRoll,
    depth_roll: depthRoll,
    depth_rows: depthRows,
    not_reused: [],
    total_new: totalCost,
    covered_width: totalWidth,
    total_width_needed: totalWidth,
    pole_ft: poleFt,
    gap: 0,
    supports: sup,
  };
}

/**
 * Build result dict for reuse scenario (dead code in the original Python --
 * kept for parity but never invoked by any caller).
 */
export function _build_reuse_result(
  matType: string,
  exRoll: number,
  newRoll: number | null,
  exWidths: number[],
  row1Fill: WidthComboEntry[],
  depthCombo: WidthComboEntry[],
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex: boolean,
  totalCost: number,
  depthRows = 0
): MatResult {
  const newMats: NewMatLine[] = [];

  for (const c of row1Fill) {
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: c.qty, qty_per_row: c.qty, rows: 1,
      line_total: c.price * c.qty, row1_fill: true,
    });
  }

  for (const c of depthCombo) {
    const totalQty = c.qty * depthRows;
    newMats.push({
      code: c.code, width: c.width, roll: c.roll, price: c.price,
      qty: totalQty, qty_per_row: c.qty, rows: depthRows,
      line_total: c.price * totalQty,
    });
  }

  const reused: ReusedEntry[] = exWidths.map((w) => ({ width: w, roll: exRoll, qty: 1 }));
  const coveredDepth = exRoll + (depthRows ? newRoll! * depthRows : 0);

  const row1MatsForSup: SupportMatComboInput[] = exWidths.map((w) => ({
    width: w, roll: exRoll, qty: 1, qty_per_row: 1,
  }));
  for (const c of row1Fill) {
    row1MatsForSup.push({ width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty });
  }
  const supRow1 = calculateSupports(row1MatsForSup, 1);

  const depthMatsForSup: SupportMatComboInput[] = depthCombo.map((c) => ({
    width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty,
  }));
  const supDepth = depthRows
    ? calculateSupports(depthMatsForSup, depthRows)
    : { supports_per_row: 0, total_supports: 0, positions: [], rows: 0 };

  const totalRows = 1 + depthRows;
  const totalSupports = supRow1.supports_per_row + supDepth.total_supports;

  return {
    roll_used: newRoll ?? exRoll,
    rows: totalRows,
    new_rows: depthRows,
    roll_exact: coveredDepth === poleFt,
    roll_short: false,
    depth_exact: coveredDepth >= poleFt,
    covered_depth: coveredDepth,
    new_mats: newMats,
    reused,
    reused_as_rows: false,
    reused_in_row: true,
    not_reused: [],
    total_new: totalCost,
    covered_width: totalWidth,
    total_width_needed: totalWidth,
    pole_ft: poleFt,
    gap: 0,
    supports: {
      supports_per_row: supRow1.supports_per_row,
      total_supports: totalSupports,
      positions: supRow1.positions,
      rows: totalRows,
    },
  };
}

/**
 * Find all combinations of rolls that sum to exactly target_depth
 * or within 1' overhang. Returns list of tuples (largest roll first).
 */
export function _find_roll_combinations(rolls: number[], targetDepth: number, maxRows = 4): number[][] {
  const results: number[][] = [];
  const rollSet = Array.from(new Set(rolls)).sort((a, b) => b - a);

  function search(remaining: number, combo: number[]) {
    const oh = -remaining;
    if (oh >= 0 && oh <= 1) {
      results.push([...combo].sort((a, b) => b - a));
    }
    if (remaining <= 0 || combo.length >= maxRows) return;
    for (const r of rollSet) {
      if (r <= remaining + 1) {
        search(remaining - r, [...combo, r]);
      }
    }
  }

  search(targetDepth, []);
  const seen = new Set<string>();
  const unique: number[][] = [];
  for (const c of results) {
    const key = c.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique;
}

/**
 * Try ALL combinations of roll lengths that cover pole_ft depth.
 * For each combo, solve width independently per roll.
 * Returns cheapest (fewest=False) or fewest-mats (fewest=True) result.
 */
export function calculateMatsMultiRoll(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[] | null = null,
  fedex = false,
  fewest = false
): MatResult | null {
  existing = existing ?? [];
  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) return null;

  const combos = _find_roll_combinations(rolls, poleFt);
  if (!combos.length) return null;

  let best: MatResult | null = null;
  let bestCost = Infinity;
  let bestCount = Infinity;

  for (const rollCombo of combos) {
    let totalCost = 0;
    const allNewMats: NewMatLine[] = [];
    let valid = true;
    const coveredDepth = rollCombo.reduce((a, b) => a + b, 0);

    const matCombosForSup: SupportMatComboInput[] = [];

    for (const roll of rollCombo) {
      const wc = fewest
        ? _solve_width_fewest(matType, roll, totalWidth, [], fedex)
        : _solve_width_cheapest(matType, roll, totalWidth, [], fedex);
      if (!wc) {
        valid = false;
        break;
      }

      const rowCost = wc.reduce((a, c) => a + c.price * c.qty, 0);
      totalCost += rowCost;

      for (const c of wc) {
        let merged = false;
        for (const m of allNewMats) {
          if (m.code === c.code) {
            m.qty += c.qty;
            m.line_total += c.price * c.qty;
            merged = true;
            break;
          }
        }
        if (!merged) {
          allNewMats.push({
            code: c.code, width: c.width, roll: c.roll, price: c.price,
            qty: c.qty, qty_per_row: c.qty, rows: 1, line_total: c.price * c.qty,
          });
        }
        matCombosForSup.push({ width: c.width, roll: c.roll, qty: c.qty, qty_per_row: c.qty });
      }
    }

    if (!valid) continue;

    const totalCount = allNewMats.reduce((a, m) => a + m.qty, 0);
    const oh = coveredDepth - poleFt;

    if (oh > 1) continue;

    let better: boolean;
    if (fewest) {
      better =
        totalCount < bestCount ||
        (totalCount === bestCount && totalCost < bestCost) ||
        (totalCount === bestCount && oh < (best ? (best.covered_depth ?? 0) - poleFt : 0));
    } else {
      better =
        totalCost < bestCost ||
        (totalCost === bestCost && totalCount < bestCount) ||
        (totalCost === bestCost && oh < (best ? (best.covered_depth ?? 0) - poleFt : 0));
    }

    if (better) {
      bestCost = totalCost;
      bestCount = totalCount;
      const sup = calculateSupports(matCombosForSup, rollCombo.length);

      const rowLayouts: RowLayout[] = [];
      for (const roll of rollCombo) {
        const rowMats: RowLayout["mats"] = [];
        const wc = fewest
          ? _solve_width_fewest(matType, roll, totalWidth, [], fedex)
          : _solve_width_cheapest(matType, roll, totalWidth, [], fedex);
        if (wc) {
          for (const c of wc) {
            rowMats.push({ code: c.code, width: c.width, roll: c.roll, price: c.price, qty: c.qty, qty_per_row: c.qty });
          }
        }
        rowLayouts.push({ roll, mats: rowMats });
      }

      best = {
        roll_used: Math.max(...rollCombo),
        roll_combo: [...rollCombo],
        row_layouts: rowLayouts,
        rows: rollCombo.length,
        roll_exact: coveredDepth === poleFt,
        roll_short: false,
        depth_exact: coveredDepth === poleFt,
        covered_depth: coveredDepth,
        new_mats: allNewMats,
        reused: [],
        reused_as_rows: false,
        not_reused: existing.filter((e) => e.roll < poleFt).map((e) => ({ width: e.width, roll: e.roll })),
        total_new: totalCost,
        covered_width: totalWidth,
        total_width_needed: totalWidth,
        pole_ft: poleFt,
        gap: 0,
        supports: sup,
        multi_roll: true,
      };
    }
  }

  return best;
}

/**
 * Find ALL unique mat combinations that cover total_width with <=max_oh overhang.
 * Returns list of (combo_tuple, cost, covered_width) sorted by cost then mat count.
 */
export function findAllWidthCombos(
  matType: string,
  roll: number,
  totalWidth: number,
  fedex = false,
  maxOh = 1
): [MatEntry[], number, number][] {
  const mats = matsForRoll(matType, roll, fedex);
  if (!mats.length) return [];

  const results: [string, MatEntry[], number, number][] = [];

  function search(remaining: number, combo: MatEntry[], cost: number) {
    if (remaining >= -maxOh && remaining <= maxOh && remaining <= 0) {
      const key = combo.map((c) => c.code).sort().join(",");
      results.push([key, [...combo], cost, totalWidth - remaining]);
      return;
    }
    if (remaining <= -maxOh) return;
    if (combo.length >= 12) return;
    for (const m of mats) {
      if (m.width <= remaining + maxOh) {
        search(remaining - m.width, [...combo, m], cost + m.price);
      }
    }
  }

  search(totalWidth, [], 0);

  const seen = new Set<string>();
  const unique: [MatEntry[], number, number][] = [];
  const sorted = [...results].sort((a, b) => (a[2] - b[2]) || (a[1].length - b[1].length));
  for (const [key, combo, cost, cov] of sorted) {
    if (!seen.has(key)) {
      seen.add(key);
      unique.push([combo, cost, cov]);
    }
  }
  return unique;
}

/**
 * Find up to max_options unique mat combinations, sorted cheapest+fewest first.
 * Includes both single-roll and multi-roll combinations.
 */
export function calculateAllOptions(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[] | null = null,
  fedex = false,
  maxOptions = 4
): MatResult[] {
  existing = existing ?? [];
  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) return [];

  let allResults: MatResult[] = [];
  const seenKeys = new Set<string>();

  // Single-roll options
  for (const roll of rolls) {
    const oh0 = _overhang(roll, poleFt);
    if (oh0 > 1) continue;
    const rows = _rows_needed(roll, poleFt);

    const combos = findAllWidthCombos(matType, roll, totalWidth, fedex);
    for (const [combo] of combos) {
      const matCounts = new Map<string, WidthComboEntry>();
      for (const m of combo) {
        const key = `${m.code}|${m.width}|${m.roll}|${m.price}`;
        if (matCounts.has(key)) {
          matCounts.get(key)!.qty += 1;
        } else {
          matCounts.set(key, { code: m.code, width: m.width, roll: m.roll, price: m.price, qty: 1 });
        }
      }
      const widthCombo = Array.from(matCounts.values());
      const perRowCost = widthCombo.reduce((a, c) => a + c.price * c.qty, 0);
      const totalCost = perRowCost * rows;

      const coveredDepth = rows * roll;
      const oh = coveredDepth - poleFt;
      const result = _build_result(matType, roll, rows, widthCombo, poleFt, totalWidth, existing, fedex);
      const nMats = result.new_mats.reduce((a, m) => a + m.qty, 0);
      result._sort_key = [totalCost, oh, rows, nMats, 1];
      allResults.push(result);
    }
  }

  // Multi-roll options
  const rollCombos = _find_roll_combinations(rolls, poleFt);
  for (const rollCombo of rollCombos) {
    if (new Set(rollCombo).size === 1) continue; // already covered by single-roll above
    const coveredDepth = rollCombo.reduce((a, b) => a + b, 0);
    if (coveredDepth - poleFt > 1) continue;

    let valid = true;
    const rowCombos: [number, WidthComboEntry[]][] = [];
    let totalCost = 0;
    for (const roll of rollCombo) {
      const wc = _solve_width_cheapest(matType, roll, totalWidth, [], fedex);
      if (!wc) {
        valid = false;
        break;
      }
      const rowCost = wc.reduce((a, c) => a + c.price * c.qty, 0);
      totalCost += rowCost;
      rowCombos.push([roll, wc]);
    }

    if (!valid) continue;

    const allMats = new Map<string, { code: string; width: number; roll: number; price: number; qty: number }>();
    const rowLayouts: RowLayout[] = [];
    for (const [roll, wc] of rowCombos) {
      const rowMats: RowLayout["mats"] = [];
      for (const c of wc) {
        const key = `${c.code}|${c.width}|${c.roll}|${c.price}`;
        if (allMats.has(key)) {
          allMats.get(key)!.qty += c.qty;
        } else {
          allMats.set(key, { code: c.code, width: c.width, roll: c.roll, price: c.price, qty: c.qty });
        }
        rowMats.push({ code: c.code, width: c.width, roll: c.roll, price: c.price, qty: c.qty, qty_per_row: c.qty });
      }
      rowLayouts.push({ roll, mats: rowMats });
    }

    const key = "multi:" + Array.from(allMats.values()).map((m) => `${m.code}x${m.qty}`).sort().join(",");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const newMats: NewMatLine[] = Array.from(allMats.values()).map((m) => ({
      code: m.code, width: m.width, roll: m.roll, price: m.price,
      qty: m.qty, qty_per_row: Math.floor(m.qty / rollCombo.length),
      rows: rollCombo.length, line_total: m.price * m.qty,
    }));

    const nMats = newMats.reduce((a, m) => a + m.qty, 0);
    const result: MatResult = {
      roll_used: Math.max(...rollCombo),
      roll_combo: [...rollCombo],
      row_layouts: rowLayouts,
      rows: rollCombo.length,
      roll_exact: coveredDepth === poleFt,
      roll_short: false,
      depth_exact: coveredDepth <= poleFt + 1,
      covered_depth: coveredDepth,
      new_mats: newMats,
      reused: [],
      reused_as_rows: false,
      not_reused: [],
      total_new: totalCost,
      covered_width: totalWidth,
      total_width_needed: totalWidth,
      pole_ft: poleFt,
      gap: 0,
      supports: calculateSupports(
        Array.from(allMats.values()).map((m) => ({ width: m.width, roll: m.roll, qty: m.qty, qty_per_row: m.qty })),
        rollCombo.length
      ),
      multi_roll: true,
      _sort_key: [totalCost, coveredDepth - poleFt, rollCombo.length, nMats, 1],
    };
    allResults.push(result);
  }

  // Also add "n×W + 1×filler" options for clean real-world selling
  const uniformExtras: MatResult[] = [];
  for (const roll of rolls) {
    const oh0 = _overhang(roll, poleFt);
    if (oh0 > 1) continue;
    const rows = _rows_needed(roll, poleFt);
    const avail = matsForRoll(matType, roll, fedex);
    const availSorted = [...avail].sort((a, b) => b.width - a.width);
    const availCheapest = [...avail].sort((a, b) => a.price - b.price);
    for (const mainMat of availSorted) {
      const nMain = Math.floor(totalWidth / mainMat.width);
      const remainder = totalWidth - nMain * mainMat.width;
      if (remainder === 0 || nMain === 0) continue;
      for (const fillMat of availCheapest) {
        if (fillMat.width >= remainder) {
          const totalPerRow = mainMat.price * nMain + fillMat.price;
          const tc = totalPerRow * rows;
          const cd = rows * roll;
          const oh2 = cd - poleFt;
          let wcU: WidthComboEntry[];
          if (mainMat.code === fillMat.code) {
            wcU = [{ code: mainMat.code, width: mainMat.width, roll, price: mainMat.price, qty: nMain + 1 }];
          } else {
            wcU = [
              { code: mainMat.code, width: mainMat.width, roll, price: mainMat.price, qty: nMain },
              { code: fillMat.code, width: fillMat.width, roll, price: fillMat.price, qty: 1 },
            ];
          }
          const resultU = _build_result(matType, roll, rows, wcU, poleFt, totalWidth, existing, fedex);
          const nU = resultU.new_mats.reduce((a, m) => a + m.qty, 0);
          resultU._sort_key = [tc, oh2, rows, nU, 0]; // 0=priority
          uniformExtras.push(resultU);
          break;
        }
      }
    }
  }

  // Prepend uniform extras with priority marker, then sort keeping priority first
  for (const r of allResults) {
    if (r._sort_key && Array.isArray(r._sort_key) && r._sort_key.length === 4) {
      r._sort_key = [...r._sort_key, 1]; // 1=normal
    }
  }
  allResults = [...uniformExtras, ...allResults];

  const sortKeyCmp = (a: any[], b: any[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  };
  allResults.sort((a, b) => sortKeyCmp(a._sort_key ?? [], b._sort_key ?? []));

  // Also add fewest-mats per roll (different approach than cheapest)
  for (const roll of rolls) {
    const oh0 = _overhang(roll, poleFt);
    if (oh0 > 1) continue;
    const rows = _rows_needed(roll, poleFt);
    const wcF = _solve_width_fewest(matType, roll, totalWidth, [], fedex);
    if (!wcF) continue;
    const keyF = `${roll}:` + wcF.map((c) => `${c.code}x${c.qty}`).sort().join(",");
    if (seenKeys.has(keyF)) continue;
    seenKeys.add(keyF);
    const tcF = wcF.reduce((a, c) => a + c.price * c.qty, 0) * rows;
    const cdF = rows * roll;
    const ohF = cdF - poleFt;
    const resultF = _build_result(matType, roll, rows, wcF, poleFt, totalWidth, existing, fedex);
    const nF = resultF.new_mats.reduce((a, m) => a + m.qty, 0);
    resultF._sort_key = [tcF, ohF, rows, nF, 1];
    allResults.push(resultF);
  }

  allResults.sort((a, b) => sortKeyCmp(a._sort_key ?? [], b._sort_key ?? []));

  // Select diverse options with deduplication by mat combo
  const seenCombos = new Set<string>();
  const selected: MatResult[] = [];
  const seenMatCounts = new Map<number, number>();
  const seenWidthPatterns = new Set<string>();
  const MAX_PER_COUNT = 4;

  for (const r of allResults) {
    const comboKey = new Set(r.new_mats.map((m) => `${m.code}x${m.qty}`));
    const comboKeyStr = Array.from(comboKey).sort().join("|");
    if (seenCombos.has(comboKeyStr)) continue;
    seenCombos.add(comboKeyStr);

    const n = r.new_mats.reduce((a, m) => a + m.qty, 0);
    const widths = Array.from(new Set(r.new_mats.map((m) => m.width))).sort((a, b) => b - a);
    const widthsKey = widths.join(",");

    const countOk = (seenMatCounts.get(n) ?? 0) < MAX_PER_COUNT;
    const widthNew = !seenWidthPatterns.has(widthsKey);

    if (countOk || widthNew) {
      selected.push(r);
      seenMatCounts.set(n, (seenMatCounts.get(n) ?? 0) + 1);
      seenWidthPatterns.add(widthsKey);
    }
    if (selected.length >= maxOptions) break;
  }

  // Fill remaining slots
  if (selected.length < maxOptions) {
    const existingCombos = new Set(
      selected.map((r) => Array.from(new Set(r.new_mats.map((m) => `${m.code}x${m.qty}`))).sort().join("|"))
    );
    for (const r of allResults) {
      const ck = Array.from(new Set(r.new_mats.map((m) => `${m.code}x${m.qty}`))).sort().join("|");
      if (!existingCombos.has(ck)) {
        selected.push(r);
        existingCombos.add(ck);
      }
      if (selected.length >= maxOptions) break;
    }
  }

  let top = selected;

  // Always include fewest-mats option even if more expensive
  const fewestResult = calculateMatsFewest(matType, poleFt, totalWidth, existing, fedex);
  if (fewestResult && !("error" in fewestResult)) {
    const fewestKey = Array.from(new Set(fewestResult.new_mats.map((m) => `${m.code}x${m.qty}`))).sort().join("|");
    const topKeys = new Set(top.map((r) => Array.from(new Set(r.new_mats.map((m) => `${m.code}x${m.qty}`))).sort().join("|")));
    if (!topKeys.has(fewestKey)) {
      fewestResult._sort_key = [
        fewestResult.total_new,
        fewestResult.rows ?? 1,
        fewestResult.new_mats.reduce((a, m) => a + m.qty, 0),
      ];
      if (top.length >= maxOptions) {
        top = [...top.slice(0, maxOptions - 1), fewestResult];
      } else {
        top = [...top, fewestResult];
      }
    }
  }

  return top;
}

/**
 * Enumerate multiple reuse-based options: keeps the best-scoring subset of
 * existing mats (same scoring as calculateMatsWithReuse) but enumerates several
 * distinct ways to fill the remaining width around it. Gap-fill logic unchanged.
 */
export function calculateReuseOptions(
  matType: string,
  poleFt: number,
  totalWidth: number,
  existing: ExistingMat[],
  fedex = false,
  maxOptions = 5
): MatResult[] {
  if (!existing.length) return [];
  const rolls = availableRolls(matType, fedex);
  if (!rolls.length) return [];

  const existingTuples: [number, number][] = existing.map((e) => [e.width, e.roll]);

  const gapFor = (
    subset: [number, number][]
  ): { gapMats: [string, number, number, number, number, number, number][]; cost: number } | null => {
    const gapMatsAll: [string, number, number, number, number, number, number][] = [];
    let gapCostTotal = 0;
    for (const [exW, exRoll] of subset) {
      const gapDepth = poleFt - exRoll;
      if (gapDepth <= 0) continue;
      const [gapCombo, gapCost] = _cheapest_gap_fill(matType, gapDepth, exW, fedex);
      if (!gapCombo || !gapCombo.length) return null;
      gapCostTotal += gapCost;
      for (const c of gapCombo) gapMatsAll.push([c.code, c.width, c.roll, c.price, c.qty, exW, gapDepth]);
    }
    return { gapMats: gapMatsAll, cost: gapCostTotal };
  };

  const fillRollsFor = (): number[] => {
    const singleExact = rolls.filter((r) => r >= poleFt && _overhang(r, poleFt) === 0);
    const singleGood = rolls.filter((r) => r >= poleFt && _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
    const multiExact = rolls.filter((r) => r < poleFt && _overhang(r, poleFt) === 0);
    const multiGood = rolls.filter((r) => r < poleFt && _overhang(r, poleFt) > 0 && _overhang(r, poleFt) <= 1);
    return singleExact.length
      ? singleExact
      : singleGood.length
      ? singleGood
      : multiExact.length
      ? multiExact
      : multiGood.length
      ? multiGood
      : rolls;
  };

  // 1) Score subsets exactly like calculateMatsWithReuse to pick the best one.
  let bestSubset: [number, number][] | null = null;
  let bestScore = Infinity;
  for (const subset of powerset(existingTuples)) {
    if (!subset.length) continue;
    const exTotalW = subset.reduce((a, [w]) => a + w, 0);
    if (exTotalW > totalWidth) continue;
    const remainingW = totalWidth - exTotalW;
    const gap = gapFor(subset);
    if (!gap) continue;

    let fillCost = 0;
    if (remainingW > 0) {
      let found = false;
      for (const fillRoll of fillRollsFor()) {
        const fillRows = _rows_needed(fillRoll, poleFt);
        const combo = _solve_width_cheapest(matType, fillRoll, remainingW, [], fedex);
        if (!combo) continue;
        const fc = combo.reduce((a, c) => a + c.price * c.qty, 0) * fillRows;
        if (!found || fc < fillCost) {
          fillCost = fc;
          found = true;
        }
      }
      if (!found) continue;
    }
    const total = fillCost + gap.cost;
    if (total < bestScore) {
      bestScore = total;
      bestSubset = subset;
    }
  }

  if (!bestSubset) return [];

  const subset = bestSubset;
  const exTotalW = subset.reduce((a, [w]) => a + w, 0);
  const remainingW = totalWidth - exTotalW;
  const gap = gapFor(subset);
  if (!gap) return [];

  const variants: { cost: number; result: MatResult; key: string }[] = [];

  const pushVariant = (
    fillMats: [string, number, number, number, number, number, number][],
    fillCost: number
  ) => {
    const key = fillMats
      .map(([c, , , , qty, , rows]) => `${c}x${qty * rows}`)
      .sort()
      .join("|");
    if (variants.some((v) => v.key === key)) return;
    const totalCost = fillCost + gap.cost;
    variants.push({
      cost: totalCost,
      key,
      result: _build_general_reuse_result(
        matType,
        subset,
        fillMats,
        gap.gapMats,
        poleFt,
        totalWidth,
        existing,
        fedex,
        totalCost
      ),
    });
  };

  if (remainingW <= 0) {
    pushVariant([], 0);
  } else {
    for (const fillRoll of fillRollsFor()) {
      const fillRows = _rows_needed(fillRoll, poleFt);
      const combos = findAllWidthCombos(matType, fillRoll, remainingW, fedex);
      for (const [combo, cost] of combos.slice(0, maxOptions)) {
        // group duplicate codes into qty
        const grouped: Record<string, { m: MatEntry; qty: number }> = {};
        for (const m of combo) {
          if (grouped[m.code]) grouped[m.code].qty += 1;
          else grouped[m.code] = { m, qty: 1 };
        }
        const fillMats = Object.values(grouped).map(
          ({ m, qty }) =>
            [m.code, m.width, m.roll, m.price, qty, fillRoll, fillRows] as [
              string,
              number,
              number,
              number,
              number,
              number,
              number
            ]
        );
        pushVariant(fillMats, cost * fillRows);
      }
    }
  }

  variants.sort((a, b) => a.cost - b.cost);
  return variants.slice(0, maxOptions).map((v) => v.result);
}
