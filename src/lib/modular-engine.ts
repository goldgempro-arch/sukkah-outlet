/**
 * Pure-logic TypeScript port of the "Sukkah Builder" calculation portion
 * of modular_tab.py (Modular Tab, Canvas Sukkahs ERP V2).
 *
 * No UI/tkinter code is ported -- only the domain logic: the GM code
 * index built from the live parts catalog, wall-length/panel-fill math,
 * and the parts-list / totals computation equivalent to `_render()`.
 */

import { CATALOG } from "@/lib/prices";

// ---------------------------------------------------------------------
// Constants (ported verbatim from modular_tab.py)
// ---------------------------------------------------------------------

const GM_PATTERN = /^GM(\d{2})(\d{2})([A-Z]{2})([A-Z]{2})$/;

export const COLOR_NAMES: Record<string, string> = {
  AL: "Almond", AN: "Standard", BE: "Beige", BL: "Blue",
  CA: "Cashew", CH: "Chestnut", CO: "Coconut", DG: "Dark Gray",
  HA: "Hazelnut", HI: "Hickory", LU: "Lucite", MA: "Macadamia",
  NI: "Nickernut", PE: "Pecan", WA: "Walnut", WH: "White",
};

export const TYPE_NAMES: Record<string, string> = {
  PA: "Panel", CP: "Custom Panel",
  HL: "Half Lucite", LT: "Half Lucite to Top",
  LI: "Left Door (In)", LO: "Left Door (Out)",
  RI: "Right Door (In)", RO: "Right Door (Out)",
  LD: "Left Door", RD: "Right Door",
  SL: "Sliding Lucite", SW: "Sliding Window",
  EF: "Empty Frame",
};

/** Colors that carry a higher panel price — label indicator only, no pricing logic. */
export const PREMIUM_COLORS = ["CO", "LU", "MA", "NI"];

// Which type codes count as a "window" choice vs. a "door" choice, in the
// order they should be offered.
export const WINDOW_TYPES = ["HL", "SL", "LT", "SW"];
export const DOOR_TYPES = ["RD", "LD", "LI", "LO", "RI", "RO"];

// Real wall heights. "84"/"90"/"96" are literally inches (7ft/7.5ft/8ft);
// "10" is shorthand for 10 FEET (120in).
export const HEIGHT_INCHES: Record<string, number> = { "84": 84, "90": 90, "96": 96, "10": 120 };
export const HEIGHT_LABELS: Record<string, string> = { "84": "7 ft", "90": "7.5 ft", "96": "8 ft", "10": "10 ft" };
// 7 ft is rarely used, so it sits at the bottom of the list.
export const REAL_HEIGHTS: string[] = ["90", "96", "10", "84"];

// "Feet" in this catalog are product-name sizes, not real measurements --
// the real nominal 1/2/3/4 line is 11"/23"/35"/46" real inches.
export const NOMINAL_SIZES: Record<number, number> = { 1: 11, 2: 23, 3: 35, 4: 46 };
export const REAL_TO_NOMINAL: Record<number, number> = Object.fromEntries(
  Object.entries(NOMINAL_SIZES).map(([nominal, real]) => [real, Number(nominal)])
);

// ---------------------------------------------------------------------
// GM code index -- width -> height -> color -> type -> [code, desc, price]
// ---------------------------------------------------------------------

export type GmEntry = [code: string, desc: string, price: number];
export type GmIndex = Record<string, Record<string, Record<string, Record<string, GmEntry>>>>;

function buildGmIndex(): GmIndex {
  const index: GmIndex = {};
  for (const [code, entry] of Object.entries(CATALOG())) {
    const m = GM_PATTERN.exec(code);
    if (!m || entry?.price == null) continue;
    const [, w, h, color, typ] = m;
    index[w] ??= {};
    index[w][h] ??= {};
    index[w][h][color] ??= {};
    index[w][h][color][typ] = [code, entry.desc ?? "", entry.price];
  }
  return index;
}

export const GM_INDEX: GmIndex = buildGmIndex();
export const WIDTH_OPTIONS: string[] = Object.keys(GM_INDEX).sort((a, b) => Number(a) - Number(b));

// ---------------------------------------------------------------------
// _fill_wall
// ---------------------------------------------------------------------

/**
 * Fill target_nominal (nominal feet) using the biggest available nominal
 * sizes first, only reaching for a smaller one once the bigger ones no
 * longer fit. Returns [panels_used, leftover_nominal].
 */
export function fillWall(targetNominal: number, availableNominal: number[]): [number[], number] {
  const target = Math.round(targetNominal);
  const sizesSorted = Array.from(new Set(availableNominal.filter((n) => n > 0))).sort((a, b) => b - a);
  if (target <= 0 || sizesSorted.length === 0) return [[], target];
  let remaining = target;
  const panels: number[] = [];
  for (const n of sizesSorted) {
    while (remaining >= n) {
      panels.push(n);
      remaining -= n;
    }
  }
  return [panels, remaining];
}

// ---------------------------------------------------------------------
// Option-list helpers (for a UI to drive dropdowns)
// ---------------------------------------------------------------------

/** Every color available at a given height. */
export function colorsForHeight(height: string): string[] {
  const colors = new Set<string>();
  for (const w of WIDTH_OPTIONS) {
    const cs = GM_INDEX[w]?.[height];
    if (cs) for (const c of Object.keys(cs)) colors.add(c);
  }
  return Array.from(colors).sort((a, b) =>
    (COLOR_NAMES[a] ?? a).localeCompare(COLOR_NAMES[b] ?? b)
  );
}

/** Every panel width (real, as string) that has a plain Panel ("PA") for this height+color. */
export function widthsForColor(height: string, color: string): string[] {
  return WIDTH_OPTIONS.filter((w) => "PA" in (GM_INDEX[w]?.[height]?.[color] ?? {}));
}

/** Window/door type codes actually available for a given height+color. */
export function windowAndDoorCodesForColor(
  height: string,
  color: string
): { windowCodes: string[]; doorCodes: string[] } {
  const widths = widthsForColor(height, color);
  const availableTypes = new Set<string>();
  for (const w of widths) {
    const types = GM_INDEX[w]?.[height]?.[color];
    if (types) for (const t of Object.keys(types)) availableTypes.add(t);
  }
  return {
    windowCodes: WINDOW_TYPES.filter((t) => availableTypes.has(t)),
    doorCodes: DOOR_TYPES.filter((t) => availableTypes.has(t)),
  };
}

/** Direct catalog lookup: real width (inches, as number or string), height code, color code, type code -> entry. */
export function codeFor(
  width: number | string,
  height: string,
  color: string,
  typ: string
): GmEntry | undefined {
  return GM_INDEX[String(width)]?.[height]?.[color]?.[typ];
}

// ---------------------------------------------------------------------
// Wall labels / wall-length layout
// ---------------------------------------------------------------------

export type WallCount = 1 | 2 | 3 | 4;

/** Short labels for a wall count -- used for size-field layout and the
 * door/window "On wall" choices. */
export function wallLabels(wallCount: WallCount): string[] {
  if (wallCount === 1) {
    return ["Wall 1"];
  }
  if (wallCount === 4) {
    return ["Wall 1 (Length 1)", "Wall 2 (Width 1)", "Wall 3 (Length 2)", "Wall 4 (Width 2)"];
  }
  if (wallCount === 3) {
    return ["Wall 1 (Back, Length 1)", "Wall 2 (Side, Width 1)", "Wall 3 (Side, Width 2)"];
  }
  return ["Wall 1 (Length 1)", "Wall 2 (Width 1)"];
}

export interface WallLengthsInput {
  wallCount: WallCount;
  length1: number;
  length2: number;
  width1: number;
  width2: number;
}

/** Wall count + the relevant length/width fields -> [label, nominal_ft][] list of walls. */
export function wallLengths(input: WallLengthsInput): [string, number][] {
  const { wallCount, length1, length2, width1, width2 } = input;
  if (wallCount === 1) {
    return [["Wall 1", length1]];
  }
  if (wallCount === 4) {
    return [
      ["Wall 1 (Length 1)", length1],
      ["Wall 2 (Width 1)", width1],
      ["Wall 3 (Length 2)", length2],
      ["Wall 4 (Width 2)", width2],
    ];
  }
  if (wallCount === 3) {
    return [
      ["Wall 1 (Back, Length 1)", length1],
      ["Wall 2 (Side, Width 1)", width1],
      ["Wall 3 (Side, Width 2)", width2],
    ];
  }
  return [["Wall 1 (Length 1)", length1], ["Wall 2 (Width 1)", width1]];
}

// ---------------------------------------------------------------------
// _render equivalent
// ---------------------------------------------------------------------

export interface WindowDoorEntry {
  /** Type code, e.g. "SW", "LI" -- one of WINDOW_TYPES / DOOR_TYPES. */
  typeCode: string;
  /** 1-based wall number, matching the order from wallLengths()/wallLabels(). */
  wallNumber: number;
}

export interface ManualItem {
  code: string;
  desc: string;
  qty: number;
  price: number;
}

export interface RenderModularConfig {
  wallCount: WallCount;
  length1: number;
  length2: number;
  width1: number;
  width2: number;
  height: string; // one of REAL_HEIGHTS
  color: string; // color code, e.g. "AL"
  windows?: WindowDoorEntry[];
  doors?: WindowDoorEntry[];
  discountPct?: number;
  /** Extra line items outside of the wall calc (from "Edit Order" in the original). */
  manualItems?: ManualItem[];
}

export interface WallResult {
  label: string;
  nominalFt: number;
  realUsedInches: number;
  items: GmEntry[];
  leftoverNominal: number;
}

export interface UnplacedEntry {
  kind: "window" | "door";
  typeLabel: string;
  wallLabel: string;
  /** Index of the entry within the windows[]/doors[] array it came from. */
  entryIndex: number;
}

export interface PartsLineItem {
  code: string;
  qty: number;
  desc: string;
  price: number;
  total: number;
}

export interface RenderModularResult {
  ok: boolean;
  message?: string;
  walls: WallResult[];
  unplaced: UnplacedEntry[];
  items: PartsLineItem[];
  customTotalNominal: number;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  grandTotal: number;
  lines: string[];
}

function emptyResult(message: string): RenderModularResult {
  return {
    ok: false,
    message,
    walls: [],
    unplaced: [],
    items: [],
    customTotalNominal: 0,
    subtotal: 0,
    discountPct: 0,
    discountAmount: 0,
    grandTotal: 0,
    lines: [message],
  };
}

/**
 * Pure equivalent of SukkahBuilderFrame._render(): given a builder
 * configuration, computes the wall-by-wall panel breakdown, the
 * consolidated parts list with quantities/prices, and totals.
 */
export function renderModular(config: RenderModularConfig): RenderModularResult {
  const { wallCount, length1, length2, width1, width2, height, color } = config;
  const windows = config.windows ?? [];
  const doors = config.doors ?? [];
  const manualItems = config.manualItems ?? [];
  const discountPctInput = config.discountPct ?? 0;

  if (!height || !color) {
    return emptyResult("Select a height and color to see the parts list.");
  }

  const widthsIn = widthsForColor(height, color).map((w) => Number(w));
  if (widthsIn.length === 0) {
    return emptyResult("No panels exist for this height/color combination.");
  }

  // Which nominal sizes (1/2/3/4 ft) are actually available for this
  // color+height -- not every color offers every size.
  const availableNominal = widthsIn
    .filter((w) => w in REAL_TO_NOMINAL)
    .map((w) => REAL_TO_NOMINAL[w])
    .sort((a, b) => a - b);

  const walls = wallLengths({ wallCount, length1, length2, width1, width2 });
  if (walls.length === 0 || walls.every(([, ft]) => ft <= 0)) {
    return emptyResult("Enter your wall lengths (in nominal feet) to see the parts list.");
  }

  const { windowCodes, doorCodes } = windowAndDoorCodesForColor(height, color);
  const labels = wallLabels(wallCount);

  const wallRemainingNominal = walls.map(([, ft]) => ft);
  const wallExtra: (GmEntry & [string, string, number])[][] = walls.map(() => []);
  const wallExtraReal: number[][] = walls.map(() => []);
  const unplaced: UnplacedEntry[] = [];

  function placeEntries(entries: WindowDoorEntry[], kind: "window" | "door", codesList: string[]) {
    entries.forEach((entry, entryIndex) => {
      const typ = entry.typeCode;
      const typeLabel = TYPE_NAMES[typ] ?? typ;
      if (!codesList.includes(typ)) return;
      const wallIdx = entry.wallNumber - 1;
      const wallLabel = labels[wallIdx] ?? `Wall ${entry.wallNumber}`;
      if (wallIdx < 0 || wallIdx >= walls.length) {
        unplaced.push({ kind, typeLabel, wallLabel: `Wall ${entry.wallNumber}`, entryIndex });
        return;
      }
      // Real widths this type comes in, converted to nominal cost, biggest first.
      const options = WIDTH_OPTIONS
        .map((w) => Number(w))
        .filter((w) => w in REAL_TO_NOMINAL && GM_INDEX[String(w)]?.[height]?.[color]?.[typ])
        .map((w) => [REAL_TO_NOMINAL[w], w] as [number, number])
        .sort((a, b) => b[0] - a[0]);
      // Prefer the assigned wall; if it has no room, fall back to the other
      // walls in ascending wall order (0..n-1), deterministically.
      const candidateWalls = [wallIdx, ...walls.map((_, i) => i).filter((i) => i !== wallIdx)];
      let targetIdx = -1;
      let fitting: [number, number][] = [];
      for (const idx of candidateWalls) {
        const fits = options.filter(([nom]) => nom <= wallRemainingNominal[idx]);
        if (fits.length > 0) {
          targetIdx = idx;
          fitting = fits;
          break;
        }
      }
      if (targetIdx === -1) {
        unplaced.push({ kind, typeLabel, wallLabel, entryIndex });
        return;
      }
      const [nom, real] = fitting[0];
      const entryCode = codeFor(real, height, color, typ);
      if (!entryCode) return;
      wallExtra[targetIdx].push(entryCode);
      wallExtraReal[targetIdx].push(real);
      wallRemainingNominal[targetIdx] -= nom;
    });
  }

  placeEntries(windows, "window", windowCodes);
  placeEntries(doors, "door", doorCodes);

  const lines: string[] = [];
  const itemTotals: Record<string, [string, number, number]> = {}; // code -> [desc, qty, price]
  let customTotalNominal = 0;
  const wallResults: WallResult[] = [];

  walls.forEach(([wallName, wallLenFt], i) => {
    if (wallLenFt <= 0) return;
    const thisWallCodes: GmEntry[] = [...wallExtra[i]];
    let realUsedIn = wallExtraReal[i].reduce((a, b) => a + b, 0);
    const remainingNominal = wallRemainingNominal[i];

    const [panelNominals, leftoverNominal] = fillWall(remainingNominal, availableNominal);
    for (const pn of panelNominals) {
      const realW = NOMINAL_SIZES[pn];
      const entry = codeFor(realW, height, color, "PA");
      if (!entry) continue;
      thisWallCodes.push(entry);
      realUsedIn += realW;
    }

    lines.push(`${wallName} -- ${trimFloat(wallLenFt)} ft (nominal, ${realUsedIn}" real)`);
    for (const [code, desc, price] of thisWallCodes) {
      lines.push(`  ${code}    ${desc}`);
      itemTotals[code] ??= [desc, 0, price];
      itemTotals[code][1] += 1;
    }
    if (leftoverNominal > 0) {
      lines.push(
        `  CUSTOM PANEL NEEDED -- ${leftoverNominal} nominal ft short (no standard size covers this exactly)`
      );
      customTotalNominal += leftoverNominal;
    }
    lines.push("");

    wallResults.push({
      label: wallName,
      nominalFt: wallLenFt,
      realUsedInches: realUsedIn,
      items: thisWallCodes,
      leftoverNominal,
    });
  });

  if (unplaced.length > 0) {
    for (const u of unplaced) {
      lines.push(`NOTE: ${capitalize(u.kind)} '${u.typeLabel}' on ${u.wallLabel} didn't fit -- not enough room.`);
    }
    lines.push("");
  }

  for (const mi of manualItems) {
    itemTotals[mi.code] ??= [mi.desc, 0, mi.price];
    itemTotals[mi.code][1] += mi.qty;
  }

  const discountPct = Number.isFinite(discountPctInput) ? discountPctInput : 0;

  lines.push("=".repeat(46));
  lines.push("PARTS LIST");
  lines.push("=".repeat(46));

  let subtotal = 0;
  const items: PartsLineItem[] = [];
  for (const code of Object.keys(itemTotals).sort()) {
    const [desc, qty, price] = itemTotals[code];
    const total = qty * price;
    subtotal += total;
    items.push({ code, qty, desc, price, total });
    lines.push(`${code}    ${desc}`);
    lines.push(`  Qty: ${qty}   Price: $${fmtMoney(price)}   Total: $${fmtMoney(total)}`);
  }
  if (customTotalNominal > 0) {
    lines.push(
      `CUSTOM PANEL(S)    Total ${customTotalNominal} nominal ft of custom panel -- quote separately`
    );
  }

  lines.push("=".repeat(46));
  lines.push(`Subtotal: $${fmtMoney(subtotal)}`);
  let discountAmount = 0;
  let grandTotal = subtotal;
  if (discountPct > 0) {
    discountAmount = (subtotal * discountPct) / 100;
    lines.push(`Discount (${discountPct.toFixed(0)}%): -$${fmtMoney(discountAmount)}`);
    grandTotal = subtotal - discountAmount;
  }
  lines.push(`GRAND TOTAL: $${fmtMoney(grandTotal)}`);

  return {
    ok: true,
    walls: wallResults,
    unplaced,
    items,
    customTotalNominal,
    subtotal,
    discountPct,
    discountAmount,
    grandTotal,
    lines,
  };
}

// ---------------------------------------------------------------------
// small formatting helpers matching Python's f-string behavior
// ---------------------------------------------------------------------

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function trimFloat(n: number): string {
  // Mirrors Python's `{value:g}` formatting for wall lengths (drops
  // trailing .0 but keeps meaningful decimals).
  return Number.isInteger(n) ? String(n) : String(n);
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
