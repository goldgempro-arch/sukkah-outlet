/**
 * Core parts-calculation engine for the SY canvas sukkah line.
 * Ported from engine.py with exact behavioral fidelity.
 */

import { getPrice } from "./prices";

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

export const MAX_SINGLE_BAR = 10;
export const COMMON_LENGTHS = [10, 8, 6, 4];
export const ALL_STOCKED_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10];

export const CONFIRMED_ODD_SPLITS: Record<number, [number, number]> = {
  11: [6, 5],
  13: [8, 5],
  15: [10, 5],
  17: [9, 8],
  19: [10, 9],
};

export const BOX_PACKS: Record<number, number[]> = {
  3: [1, 2, 4],
  4: [1, 2, 4, 5, 6],
  5: [1, 2, 4, 5, 6],
  6: [1, 2, 4, 5, 6],
  7: [1, 2, 4],
  8: [1, 2, 4, 5, 6],
  9: [1, 2, 4],
  10: [1, 2, 4, 5, 6],
};

export const STRAP_KIT_LABELS: Record<number, string> = {
  20: "B1",
  28: "B2",
  36: "B3",
  44: "B4",
  52: "B5",
};

export function strapKitFor(needFt: number): number {
  let kit = Math.max(20, needFt);
  while (kit % 8 !== 4) {
    kit += 1;
  }
  return kit;
}

export function strapLabel(kitFt: number): string {
  if (kitFt in STRAP_KIT_LABELS) {
    return STRAP_KIT_LABELS[kitFt];
  }
  const idx = Math.floor((kitFt - 20) / 8) + 1;
  return `B${idx}`;
}

// ---------------------------------------------------------------------------
// PART CODES
// ---------------------------------------------------------------------------

export function barBoxCode(length: number, packSize: number): string {
  const lenStr = length < 10 ? `0${length}` : `${length}`;
  return `SB${lenStr}-${packSize}`;
}

export function panelCode(
  length: number,
  isDoor: boolean,
  productLine: string = "SY"
): string {
  if (productLine === "DELUXE") {
    const kind = isDoor ? "DBB" : "WBB";
    return `DL${length}${kind}`;
  }
  const kind = isDoor ? "DBL" : "WBL";
  return `SY${length}${kind}`;
}

export function strapCode(kitFt: number, productLine: string = "SY"): string {
  const suffix = productLine === "DELUXE" ? "B3" : "B4";
  return `${strapLabel(kitFt)}-${suffix}`;
}

export function cornerKitCode(
  extensions: number,
  productLine: string = "SY"
): string {
  const codes: Record<string, Record<number, string>> = {
    SY: { 0: "SY1", 2: "SY2", 4: "SY3" },
    DELUXE: { 0: "DL1", 2: "DL2", 4: "DL3", 6: "DL4" },
  };
  const table = codes[productLine];
  return table[extensions] ?? `${productLine}?`;
}

export const LARGEST_KIT: Record<
  string,
  { code: string; extensions: number; adjustor: number }
> = {
  SY: { code: "SY3", extensions: 4, adjustor: 1 },
  DELUXE: { code: "DL4", extensions: 6, adjustor: 2 },
};

export function cornerKitWithOverflow(
  extensions: number,
  adjustor: number,
  productLine: string = "SY"
): [string, number, number, number, number] {
  const exactCode = cornerKitCode(extensions, productLine);
  if (!exactCode.endsWith("?")) {
    return [exactCode, extensions, adjustor, 0, 0];
  }

  const largest = LARGEST_KIT[productLine];
  const extraExt = Math.max(0, extensions - largest.extensions);
  const extraAdj = Math.max(0, adjustor - largest.adjustor);
  return [largest.code, largest.extensions, largest.adjustor, extraExt, extraAdj];
}

export function extensionPieceCode(productLine: string = "SY"): string {
  return productLine === "SY" ? "SYEP" : "DLEP";
}

export function adjustableBarCode(_productLine: string = "SY"): string {
  return "ADJBARL";
}

export function extAdjBundleCode(productLine: string = "SY"): string {
  return productLine === "SY" ? "SYX" : "DLX";
}

// ---------------------------------------------------------------------------
// NOTCHED BAMBOO / SCHACH SUPPORT
// ---------------------------------------------------------------------------

export const POLE_MAX = 12;
export const MAT_MAX = 10;

type BambooEntry = [string, string, number];

function bambooKey(a: number, b: number): string {
  return `${a},${b}`;
}

export const CONFIRMED_BAMBOO: Record<string, BambooEntry> = {
  [bambooKey(4, 4)]: ["BPNS0404", "bundle", 1],
  [bambooKey(4, 6)]: ["BPNS0406", "bundle", 1],
  [bambooKey(4, 8)]: ["BPNS0608", "bundle", 1],
  [bambooKey(6, 6)]: ["BPN06", "loose poles", 7],
  [bambooKey(6, 8)]: ["BPNS0608", "bundle", 1],
  [bambooKey(8, 8)]: ["BPNS0808", "bundle", 1],
  [bambooKey(8, 10)]: ["BPNS0810", "bundle", 1],
  [bambooKey(8, 12)]: ["BPNS0812", "bundle", 1],
  [bambooKey(8, 16)]: ["BPNS0816", "bundle", 1],
  [bambooKey(10, 10)]: ["BPN10", "loose poles", 8],
  [bambooKey(10, 12)]: ["BPNS1012", "bundle", 1],
  [bambooKey(10, 16)]: ["BPNS1016", "bundle", 1],
  [bambooKey(10, 20)]: ["BPNS1020", "bundle", 1],
  [bambooKey(12, 16)]: ["BPNS1216", "bundle", 1],
  [bambooKey(12, 12)]: ["BPNS1216", "bundle", 1],
  [bambooKey(12, 14)]: ["BPNS1216", "bundle", 1],
  [bambooKey(12, 20)]: ["BPNS1220", "bundle", 1],
  [bambooKey(12, 24)]: ["BPNS1224", "bundle", 1],
};

export const MAX_SHORT_SIDE_FOR_FLOWER = 12;

function count10ftAlignedJoints(frame: number[]): number {
  let count = 0;
  let pos = 0;
  for (let i = 0; i < frame.length - 1; i++) {
    pos += frame[i];
    if (pos % 10 === 0) {
      count += 1;
    }
  }
  return count;
}

export interface FlowerPostInfo {
  needed: boolean;
  numPosts: number;
  postCode: string | null;
  extraAdjNeeded: number;
}

export function flowerPostInfo(
  length: number,
  width: number,
  productLine: string
): FlowerPostInfo {
  const shortSide = Math.min(length, width);
  const longSide = Math.max(length, width);
  const maxLong = productLine === "DELUXE" ? 24 : 20;

  if (!(shortSide > MAX_SHORT_SIDE_FOR_FLOWER && longSide > maxLong)) {
    return { needed: false, numPosts: 0, postCode: null, extraAdjNeeded: 0 };
  }

  const [longFrame] = splitWallFrame(longSide);
  const [shortFrame] = splitWallFrame(shortSide);
  const jLong = count10ftAlignedJoints(longFrame);
  const jShort = count10ftAlignedJoints(shortFrame);
  if (jLong <= 0) {
    return { needed: false, numPosts: 0, postCode: null, extraAdjNeeded: 0 };
  }
  const jShortEff = Math.max(1, jShort);

  const numPosts = jLong * jShortEff;
  const postCode = productLine === "DELUXE" ? "DLFP" : "SYFP";
  const totalAdjForFlower = jShortEff * (jLong + 1) + jLong * (jShortEff + 1);

  const rawJLong = longFrame.length - 1;
  const rawJShort = shortFrame.length - 1;
  const normalAdjustor = Math.max(rawJLong, rawJShort);
  const extraAdjNeeded = Math.max(0, totalAdjForFlower - normalAdjustor);

  return { needed: true, numPosts, postCode, extraAdjNeeded };
}

export type BambooInfo = [string | null, string | null, number | null, boolean];

export function bambooInfo(dimA: number, dimB: number): BambooInfo {
  const short = Math.min(dimA, dimB);
  const long = Math.max(dimA, dimB);

  const key = bambooKey(short, long);
  if (key in CONFIRMED_BAMBOO) {
    const [code, kind, qty] = CONFIRMED_BAMBOO[key];
    return [code, kind, qty, true];
  }

  if (short > POLE_MAX) {
    return [null, null, null, false];
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const code = `BPNS${pad(short)}${pad(long)}`;
  return [code, "bundle (estimated, not yet confirmed)", 1, false];
}

// ---------------------------------------------------------------------------
// WALL SPLITTING
// ---------------------------------------------------------------------------

export function splitWall(length: number): [number, number] {
  if (length <= MAX_SINGLE_BAR) {
    if (!ALL_STOCKED_LENGTHS.includes(length)) {
      throw new Error(
        `${length}' is not a stocked bar length (need a whole foot, 4-10).`
      );
    }
    return [1, length];
  }

  const maxNToTry = 20;
  for (let n = 2; n <= maxNToTry; n++) {
    if (length % n !== 0) continue;
    const piece = Math.floor(length / n);
    if (piece > MAX_SINGLE_BAR) continue;
    if (COMMON_LENGTHS.includes(piece)) {
      return [n, piece];
    }
  }

  if (length in CONFIRMED_ODD_SPLITS) {
    return [2, Math.floor(length / 2)];
  }

  if (length > MAX_SINGLE_BAR) {
    const repeats = Math.floor(length / 10);
    const remainder = length - repeats * 10;
    if (remainder === 0) {
      return [repeats, 10];
    }
    if (ALL_STOCKED_LENGTHS.includes(remainder)) {
      const totalPieces = repeats + 1;
      return [totalPieces, Math.floor(length / totalPieces)];
    }
  }

  for (let n = 2; n <= maxNToTry; n++) {
    if (length % n !== 0) continue;
    const piece = Math.floor(length / n);
    if (ALL_STOCKED_LENGTHS.includes(piece)) {
      return [n, piece];
    }
  }

  throw new Error(
    `${length}' has no clean equal split into stocked bar lengths -- ` +
      "this is a non-standard size; pull parts manually."
  );
}

export function splitWallFrame(length: number): [number[], boolean] {
  if (length <= MAX_SINGLE_BAR) {
    return [[length], true];
  }

  const maxNToTry = 20;
  for (let n = 2; n <= maxNToTry; n++) {
    if (length % n !== 0) continue;
    const piece = Math.floor(length / n);
    if (piece <= MAX_SINGLE_BAR && COMMON_LENGTHS.includes(piece)) {
      return [new Array(n).fill(piece), true];
    }
  }

  let bestPair: [number, number] | null = null;
  let bestDiff: number | null = null;
  for (const a of COMMON_LENGTHS) {
    const b = length - a;
    if (b <= 0 || b > MAX_SINGLE_BAR || !COMMON_LENGTHS.includes(b) || b === a) {
      continue;
    }
    const diff = Math.abs(a - b);
    if (bestDiff === null || diff < bestDiff) {
      bestDiff = diff;
      bestPair = [a, b].sort((x, y) => y - x) as [number, number];
    }
  }
  if (bestPair) {
    return [bestPair, true];
  }

  if (length in CONFIRMED_ODD_SPLITS) {
    const [a, b] = CONFIRMED_ODD_SPLITS[length];
    return [[a, b], true];
  }

  if (length > MAX_SINGLE_BAR) {
    const repeats = Math.floor(length / 10);
    const remainder = length - repeats * 10;
    if (remainder === 0) {
      return [new Array(repeats).fill(10), true];
    }
    if (ALL_STOCKED_LENGTHS.includes(remainder)) {
      return [[...new Array(repeats).fill(10), remainder], true];
    }
  }

  for (let n = 2; n <= maxNToTry; n++) {
    if (length % n !== 0) continue;
    const piece = Math.floor(length / n);
    if (ALL_STOCKED_LENGTHS.includes(piece)) {
      return [new Array(n).fill(piece), false];
    }
  }

  throw new Error(
    `${length}' has no clean split into stocked bar lengths -- ` +
      "this is a non-standard size; pull parts manually."
  );
}

export function splitWallFrameForExtension(
  oldLength: number,
  newLength: number
): [number[], boolean] {
  if (newLength <= MAX_SINGLE_BAR) {
    return splitWallFrame(newLength);
  }

  if (newLength <= oldLength) {
    return splitWallFrame(newLength);
  }

  if (oldLength <= 0) {
    return splitWallFrame(newLength);
  }

  const [oldPieces] = splitWallFrame(oldLength);
  const growth = newLength - oldLength;

  if (
    oldPieces.length === 1 &&
    growth <= MAX_SINGLE_BAR &&
    ALL_STOCKED_LENGTHS.includes(growth)
  ) {
    return [[...oldPieces, growth], true];
  }

  return splitWallFrame(newLength);
}

// Generator helper replicating itertools.combinations_with_replacement
export function* combinationsWithReplacement<T>(
  pool: T[],
  r: number
): Generator<T[]> {
  const n = pool.length;
  if (r === 0) {
    yield [];
    return;
  }
  if (n === 0) return;
  const indices = new Array(r).fill(0);
  yield indices.map((i) => pool[i]);
  while (true) {
    let i = r - 1;
    while (i >= 0 && indices[i] === n - 1) {
      i -= 1;
    }
    if (i < 0) return;
    const newVal = indices[i] + 1;
    for (let j = i; j < r; j++) {
      indices[j] = newVal;
    }
    yield indices.map((k) => pool[k]);
  }
}

type Pool = Record<number, number>;

function bestComboAtPieceCount(
  newLength: number,
  pieceCount: number,
  availablePool: Pool
): [number[] | null, number] {
  let best: number[] | null = null;
  let bestScore = -1;
  const sortedPool = [...ALL_STOCKED_LENGTHS].sort((a, b) => b - a);
  for (const combo of combinationsWithReplacement(sortedPool, pieceCount)) {
    const sum = combo.reduce((a, b) => a + b, 0);
    if (sum !== newLength) continue;
    const tempPool: Pool = { ...availablePool };
    let score = 0;
    const descCombo = [...combo].sort((a, b) => b - a);
    for (const length of descCombo) {
      if ((tempPool[length] ?? 0) > 0) {
        tempPool[length] -= 1;
        score += length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = [...combo].sort((a, b) => b - a);
    }
  }
  return [best, Math.max(bestScore, 0)];
}

function generateWallCandidates(
  newLength: number,
  availablePool: Pool
): number[][] {
  if (newLength <= MAX_SINGLE_BAR) {
    return [[newLength]];
  }

  const candidates = new Map<string, number[]>();
  const addCandidate = (arr: number[]) => {
    candidates.set(JSON.stringify(arr), arr);
  };

  const [standardPieces] = splitWallFrame(newLength);
  const standardCount = standardPieces.length;
  const standardTuple = [...standardPieces].sort((a, b) => b - a);
  addCandidate(standardTuple);

  const minPossibleCount = Math.ceil(newLength / MAX_SINGLE_BAR);
  const maxCountToTry = Math.max(standardCount, minPossibleCount) + 1;
  for (let pieceCount = minPossibleCount; pieceCount <= maxCountToTry; pieceCount++) {
    const [best, score] = bestComboAtPieceCount(newLength, pieceCount, availablePool);
    if (best && score > 0) {
      addCandidate(best);
    }
  }

  if (newLength === 24) {
    const availableLengths = Object.keys(availablePool)
      .map(Number)
      .sort((a, b) => b - a);
    for (let i = 0; i < availableLengths.length; i++) {
      const L1 = availableLengths[i];
      if ((availablePool[L1] ?? 0) <= 0 || L1 >= newLength) continue;
      for (let j = i + 1; j < availableLengths.length; j++) {
        const L2 = availableLengths[j];
        if ((availablePool[L2] ?? 0) <= 0 || L1 === L2) continue;
        const remainder = newLength - L1 - L2;
        if (remainder <= 0) continue;
        if (remainder <= MAX_SINGLE_BAR && ALL_STOCKED_LENGTHS.includes(remainder)) {
          addCandidate([L1, L2, remainder].sort((a, b) => b - a));
        }
      }
    }
  }

  return Array.from(candidates.values());
}

function evaluatePairingCost(
  doorFrame: number[],
  otherFrame: number[],
  old: SukkahConfig,
  productLine: string
): number {
  const newBars = barsByLengthFromFrames(doorFrame, otherFrame, productLine);
  let totalCost = 0.0;
  for (const lengthStr of Object.keys(newBars)) {
    const length = Number(lengthStr);
    const newQty = newBars[length];
    const oldQty = old.barsByLength[length] ?? 0;
    const need = Math.max(0, newQty - oldQty);
    if (need) {
      const boxes = packBoxes(length, need);
      for (const szStr of Object.keys(boxes)) {
        const sz = Number(szStr);
        const n = boxes[sz];
        const price = getPrice(barBoxCode(length, sz));
        if (price) {
          totalCost += price * n;
        }
      }
    }
  }

  const oldPanels = panelsFromFrames(old.doorDimFrame, old.otherDimFrame);
  const newPanels = panelsFromFrames(doorFrame, otherFrame);
  for (const key of Object.keys(newPanels)) {
    const newQty = newPanels[key];
    const [plenStr, isDoorStr] = key.split("|");
    const plen = Number(plenStr);
    const isDoor = isDoorStr === "1";
    const oldQty = oldPanels[key] ?? 0;
    const need = Math.max(0, newQty - oldQty);
    if (need) {
      const price = getPrice(panelCode(plen, isDoor, productLine));
      if (price) {
        totalCost += price * need;
      }
    }
  }

  const newExtensions = 2 * (doorFrame.length - 1) + 2 * (otherFrame.length - 1);
  const newAdjustor = Math.max(doorFrame.length - 1, otherFrame.length - 1);
  const extNeeded = Math.max(0, newExtensions - old.extensions);
  const adjNeeded = Math.max(0, newAdjustor - old.adjustor);

  if (adjNeeded) {
    const boxesNeeded = adjNeeded;
    const extCovered = boxesNeeded * 2;
    const remainingExt = Math.max(0, extNeeded - extCovered);
    totalCost += boxesNeeded * (getPrice(extAdjBundleCode(productLine)) ?? 0);
    totalCost += remainingExt * (getPrice(extensionPieceCode(productLine)) ?? 0);
  } else if (extNeeded) {
    totalCost += extNeeded * (getPrice(extensionPieceCode(productLine)) ?? 0);
  }

  return totalCost;
}

export function findBestFramePair(
  old: SukkahConfig,
  newDoorLen: number,
  newOtherLen: number,
  initialPool: Pool,
  productLine: string
): [number[], number[]] | null {
  const doorCandidates = generateWallCandidates(newDoorLen, initialPool);
  const otherCandidates = generateWallCandidates(newOtherLen, initialPool);

  let bestPair: [number[], number[]] | null = null;
  let bestCost = Infinity;
  for (const doorFrame of doorCandidates) {
    for (const otherFrame of otherCandidates) {
      const cost = evaluatePairingCost(doorFrame, otherFrame, old, productLine);
      if (cost < bestCost) {
        bestCost = cost;
        bestPair = [doorFrame, otherFrame];
      }
    }
  }

  return bestPair;
}

export function splitWallFrameGlobalReuse(
  newLength: number,
  availablePool: Pool
): number[] {
  if (newLength <= MAX_SINGLE_BAR) {
    const [pieces] = splitWallFrame(newLength);
    return pieces;
  }

  const availableLengths = Object.keys(availablePool)
    .map(Number)
    .sort((a, b) => b - a);

  if (newLength === 24) {
    for (let i = 0; i < availableLengths.length; i++) {
      const L1 = availableLengths[i];
      if ((availablePool[L1] ?? 0) <= 0 || L1 >= newLength) continue;
      for (let j = i + 1; j < availableLengths.length; j++) {
        const L2 = availableLengths[j];
        if ((availablePool[L2] ?? 0) <= 0 || L1 === L2) continue;
        const remainder = newLength - L1 - L2;
        if (remainder <= 0) continue;
        if (remainder <= MAX_SINGLE_BAR && ALL_STOCKED_LENGTHS.includes(remainder)) {
          availablePool[L1] -= 1;
          availablePool[L2] -= 1;
          return [L1, L2, remainder].sort((a, b) => b - a);
        }
      }
    }
  }

  const [standardPieces] = splitWallFrame(newLength);
  const neededCounts: Record<number, number> = {};
  for (const p of standardPieces) {
    neededCounts[p] = (neededCounts[p] ?? 0) + 1;
  }
  if (
    Object.keys(neededCounts).every(
      (lenStr) => (availablePool[Number(lenStr)] ?? 0) >= neededCounts[Number(lenStr)]
    )
  ) {
    for (const lenStr of Object.keys(neededCounts)) {
      const length = Number(lenStr);
      availablePool[length] -= neededCounts[length];
    }
    return standardPieces;
  }

  for (const L of availableLengths) {
    if ((availablePool[L] ?? 0) <= 0 || L >= newLength) continue;
    const maxRepeats = Math.min(Math.floor(newLength / L), availablePool[L]);
    for (let repeats = maxRepeats; repeats >= 1; repeats--) {
      const remainder = newLength - repeats * L;
      if (remainder === 0) {
        availablePool[L] -= repeats;
        return new Array(repeats).fill(L);
      }
      if (remainder <= MAX_SINGLE_BAR && ALL_STOCKED_LENGTHS.includes(remainder)) {
        availablePool[L] -= repeats;
        return [...new Array(repeats).fill(L), remainder].sort((a, b) => b - a);
      }
    }
  }

  for (const L of availableLengths) {
    if ((availablePool[L] ?? 0) <= 0 || L >= newLength) continue;
    const remainder = newLength - L;
    if (remainder <= MAX_SINGLE_BAR) {
      if (ALL_STOCKED_LENGTHS.includes(remainder)) {
        availablePool[L] -= 1;
        return [L, remainder];
      }
    } else {
      const [remPieces] = splitWallFrame(remainder);
      availablePool[L] -= 1;
      return [L, ...remPieces];
    }
  }

  const [pieces] = splitWallFrame(newLength);
  return pieces;
}

export function splitWallFrameModerateReuse(
  newLength: number,
  availablePool: Pool
): number[] {
  if (newLength <= MAX_SINGLE_BAR) {
    const [pieces] = splitWallFrame(newLength);
    return pieces;
  }

  const availableLengths = Object.keys(availablePool)
    .map(Number)
    .sort((a, b) => b - a);

  if (newLength === 24) {
    for (let i = 0; i < availableLengths.length; i++) {
      const L1 = availableLengths[i];
      if ((availablePool[L1] ?? 0) <= 0 || L1 >= newLength) continue;
      for (let j = i + 1; j < availableLengths.length; j++) {
        const L2 = availableLengths[j];
        if ((availablePool[L2] ?? 0) <= 0 || L1 === L2) continue;
        const remainder = newLength - L1 - L2;
        if (remainder <= 0) continue;
        if (remainder <= MAX_SINGLE_BAR && ALL_STOCKED_LENGTHS.includes(remainder)) {
          availablePool[L1] -= 1;
          availablePool[L2] -= 1;
          return [L1, L2, remainder].sort((a, b) => b - a);
        }
      }
    }
  }

  const [standardPieces] = splitWallFrame(newLength);
  const neededCounts: Record<number, number> = {};
  for (const p of standardPieces) {
    neededCounts[p] = (neededCounts[p] ?? 0) + 1;
  }
  if (
    Object.keys(neededCounts).every(
      (lenStr) => (availablePool[Number(lenStr)] ?? 0) >= neededCounts[Number(lenStr)]
    )
  ) {
    for (const lenStr of Object.keys(neededCounts)) {
      const length = Number(lenStr);
      availablePool[length] -= neededCounts[length];
    }
    return standardPieces;
  }

  for (const L of availableLengths) {
    if ((availablePool[L] ?? 0) <= 0 || L >= newLength) continue;
    const remainder = newLength - L;
    if (remainder <= MAX_SINGLE_BAR) {
      if (ALL_STOCKED_LENGTHS.includes(remainder)) {
        availablePool[L] -= 1;
        return [L, remainder];
      }
    } else {
      const [remPieces] = splitWallFrame(remainder);
      availablePool[L] -= 1;
      return [L, ...remPieces];
    }
  }

  const [pieces] = splitWallFrame(newLength);
  return pieces;
}

// ---------------------------------------------------------------------------
// BOX PACKING
// ---------------------------------------------------------------------------

export function packBoxes(length: number, barsNeeded: number): Record<number, number> {
  const allPacks = [...(BOX_PACKS[length] ?? [4])].sort((a, b) => b - a);
  const boxOnly = allPacks.filter((p) => p >= 4);
  const bagSizes = allPacks.filter((p) => p < 4);
  void bagSizes;

  function solve(
    remaining: number,
    packs: number[],
    packIdx: number
  ): Record<number, number> | null {
    if (remaining === 0) return {};
    if (packIdx >= packs.length) return null;
    const pack = packs[packIdx];
    let bestLocal: Record<number, number> | null = null;
    const maxCount = Math.floor(remaining / pack);
    for (let count = maxCount; count >= 0; count--) {
      const rest = solve(remaining - count * pack, packs, packIdx + 1);
      if (rest === null) continue;
      const restSum = Object.values(rest).reduce((a, b) => a + b, 0);
      const totalBoxes = count + restSum;
      const candidate: Record<number, number> = { ...rest };
      if (count) {
        candidate[pack] = count;
      }
      const bestSum = bestLocal
        ? Object.values(bestLocal).reduce((a, b) => a + b, 0)
        : null;
      if (bestLocal === null || totalBoxes < (bestSum as number)) {
        bestLocal = candidate;
      }
    }
    return bestLocal;
  }

  let result = solve(barsNeeded, boxOnly, 0);
  if (result !== null) {
    return result;
  }

  result = solve(barsNeeded, allPacks, 0);
  if (result === null) {
    throw new Error(`Can't pack ${barsNeeded} bars of ${length}' with available boxes.`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// FULL CONFIGURATION FOR ONE SUKKAH
// ---------------------------------------------------------------------------

export function barsByLengthFromFrames(
  doorDimFrame: number[],
  otherDimFrame: number[],
  productLine: string
): Record<number, number> {
  const normalPieceLevels = productLine === "DELUXE" ? 3 : 2;
  const doorPieceLevels = 2;

  const barsByLength: Record<number, number> = {};

  const doorPiece = Math.max(...doorDimFrame);
  let doorWallCountedDoorPiece = false;
  for (const piece of doorDimFrame) {
    if (piece === doorPiece && !doorWallCountedDoorPiece) {
      barsByLength[piece] = (barsByLength[piece] ?? 0) + doorPieceLevels;
      doorWallCountedDoorPiece = true;
    } else {
      barsByLength[piece] = (barsByLength[piece] ?? 0) + normalPieceLevels;
    }
  }

  for (const piece of doorDimFrame) {
    barsByLength[piece] = (barsByLength[piece] ?? 0) + normalPieceLevels;
  }

  for (const piece of otherDimFrame) {
    barsByLength[piece] = (barsByLength[piece] ?? 0) + 2 * normalPieceLevels;
  }

  return barsByLength;
}

function panelKey(piece: number, isDoor: boolean): string {
  return `${piece}|${isDoor ? "1" : "0"}`;
}

export function panelsFromFrames(
  doorDimFrame: number[],
  otherDimFrame: number[]
): Record<string, number> {
  const panels: Record<string, number> = {};
  const doorPiece = Math.max(...doorDimFrame);
  let counted = false;

  for (const piece of doorDimFrame) {
    if (piece === doorPiece && !counted) {
      const key = panelKey(piece, true);
      panels[key] = (panels[key] ?? 0) + 1;
      counted = true;
    } else {
      const key = panelKey(piece, false);
      panels[key] = (panels[key] ?? 0) + 1;
    }
  }

  for (const piece of doorDimFrame) {
    const key = panelKey(piece, false);
    panels[key] = (panels[key] ?? 0) + 1;
  }

  for (const piece of otherDimFrame) {
    const key = panelKey(piece, false);
    panels[key] = (panels[key] ?? 0) + 2;
  }

  return panels;
}

export interface SummaryRow {
  label: string;
  code: string | null;
  qty: number;
  unit_price: number | null;
}

export class SukkahConfig {
  length: number;
  width: number;
  doorDim: "length" | "width";
  bambooOverride: string | null;
  productLine: string;

  splitLength!: [number, number];
  splitWidth!: [number, number];

  corners!: number;
  extensions!: number;
  adjustor!: number;

  flowerNeeded!: boolean;
  flowerCount!: number;
  flowerCode!: string | null;
  flowerExtraAdj!: number;

  doorDimFrame!: number[];
  doorDimFrameConfirmed!: boolean;
  otherDimFrame!: number[];
  otherDimFrameConfirmed!: boolean;

  barsByLength!: Record<number, number>;
  boxesByLength!: Record<number, Record<number, number>>;

  panels!: Record<string, number>;

  strapKit!: number;
  strapLabelStr!: string;
  strapConfirmed!: boolean;

  bambooCode!: string | null;
  bambooKind!: string | null;
  bambooQty!: number | null;
  bambooConfirmed!: boolean;

  totalPrice = 0;

  constructor(
    length: number,
    width: number,
    doorDim: "length" | "width",
    bambooOverride: string | null = null,
    productLine: string = "SY"
  ) {
    if (doorDim !== "length" && doorDim !== "width") {
      throw new Error("door_dim must be 'length' or 'width'");
    }
    if (productLine !== "SY" && productLine !== "DELUXE") {
      throw new Error("product_line must be 'SY' or 'DELUXE'");
    }

    this.length = length;
    this.width = width;
    this.doorDim = doorDim;
    this.bambooOverride = bambooOverride;
    this.productLine = productLine;

    this.splitLength = splitWall(length);
    this.splitWidth = splitWall(width);

    this._compute();
  }

  private _compute(): void {
    const [nL, pL] = this.splitLength;
    const [nW, pW] = this.splitWidth;

    this.corners = 4;
    this.extensions = 2 * (nL - 1) + 2 * (nW - 1);
    this.adjustor = Math.max(nL - 1, nW - 1);

    const flowerInfoResult = flowerPostInfo(this.length, this.width, this.productLine);
    this.flowerNeeded = flowerInfoResult.needed;
    this.flowerCount = flowerInfoResult.numPosts;
    this.flowerCode = flowerInfoResult.postCode;
    this.flowerExtraAdj = flowerInfoResult.extraAdjNeeded;

    const [nDoor] = this.doorDim === "length" ? this.splitLength : this.splitWidth;
    const [nOther] = this.doorDim === "length" ? this.splitWidth : this.splitLength;
    void nDoor;
    void nOther;
    const doorDimLength = this.doorDim === "length" ? this.length : this.width;
    const otherDimLength = this.doorDim === "length" ? this.width : this.length;

    const [doorDimFrame, doorDimFrameConfirmed] = splitWallFrame(doorDimLength);
    const [otherDimFrame, otherDimFrameConfirmed] = splitWallFrame(otherDimLength);
    this.doorDimFrame = doorDimFrame;
    this.doorDimFrameConfirmed = doorDimFrameConfirmed;
    this.otherDimFrame = otherDimFrame;
    this.otherDimFrameConfirmed = otherDimFrameConfirmed;

    this.barsByLength = barsByLengthFromFrames(doorDimFrame, otherDimFrame, this.productLine);

    this.boxesByLength = {};
    for (const lengthStr of Object.keys(this.barsByLength)) {
      const length = Number(lengthStr);
      this.boxesByLength[length] = packBoxes(length, this.barsByLength[length]);
    }

    const panels: Record<string, number> = {};
    panels[panelKey(pL, false)] = (panels[panelKey(pL, false)] ?? 0) + 2 * nL;
    panels[panelKey(pW, false)] = (panels[panelKey(pW, false)] ?? 0) + 2 * nW;

    let doorDimLength2: number;
    if (this.doorDim === "length") {
      panels[panelKey(pL, false)] -= 1;
      panels[panelKey(pL, true)] = (panels[panelKey(pL, true)] ?? 0) + 1;
      doorDimLength2 = this.length;
    } else {
      panels[panelKey(pW, false)] -= 1;
      panels[panelKey(pW, true)] = (panels[panelKey(pW, true)] ?? 0) + 1;
      doorDimLength2 = this.width;
    }

    this.panels = {};
    for (const k of Object.keys(panels)) {
      if (panels[k] !== 0) this.panels[k] = panels[k];
    }

    const [nDoorForStraps] = this.doorDim === "length" ? this.splitLength : this.splitWidth;
    const [nOtherForStraps] = this.doorDim === "length" ? this.splitWidth : this.splitLength;
    const bothSplit = nDoorForStraps > 1 && nOtherForStraps > 1;
    const perimeter = 2 * this.length + 2 * this.width;
    this.strapConfirmed = true;

    const CONFIRMED_BOTH_SPLIT_STRAPS: Record<string, number> = {
      "12,12": 44,
      "12,24": 52,
      "14,12": 52,
    };
    const sizeSet = [this.length, this.width].sort((a, b) => a - b);
    const sizeKey = `${sizeSet[0]},${sizeSet[1]}`;

    if (bothSplit && sizeKey in CONFIRMED_BOTH_SPLIT_STRAPS) {
      this.strapKit = CONFIRMED_BOTH_SPLIT_STRAPS[sizeKey];
    } else if (bothSplit) {
      const need = perimeter - doorDimLength2;
      this.strapKit = strapKitFor(need);
      this.strapConfirmed = false;
    } else {
      const need = perimeter - doorDimLength2;
      this.strapKit = strapKitFor(need);
    }
    this.strapLabelStr = strapLabel(this.strapKit);

    if (this.bambooOverride) {
      this.bambooCode = this.bambooOverride;
      this.bambooKind = "customer-specified override";
      this.bambooQty = 1;
      this.bambooConfirmed = true;
    } else {
      const [code, kind, qty, confirmed] = bambooInfo(this.length, this.width);
      this.bambooCode = code;
      this.bambooKind = kind;
      this.bambooQty = qty;
      this.bambooConfirmed = confirmed;
    }
  }

  summaryLines(): string[] {
    const [nL, pL] = this.splitLength;
    const [nW, pW] = this.splitWidth;
    const lines: string[] = [];
    let total = 0.0;
    lines.push(
      `[${this.productLine}]  Size: ${this.length}' x ${this.width}'  (door on the ${this.doorDim} wall)`
    );

    const wallDesc = (
      dimLength: number,
      nNominal: number,
      pNominal: number,
      framePieces: number[],
      frameConfirmed: boolean
    ): string => {
      const actual = framePieces.map((p) => `${p}'`).join("+");
      if (new Set(framePieces).size === 1) {
        return `  2 walls of ${dimLength}' -- each built from ${nNominal} x ${pNominal}' piece(s)`;
      }
      const flag = frameConfirmed ? "" : "  (ESTIMATE -- unconfirmed uneven split)";
      return (
        `  2 walls of ${dimLength}' -- frame uses ${actual} per wall (uneven)${flag}, ` +
        `panels labeled nominal ${pNominal}'`
      );
    };

    if (this.doorDim === "length") {
      lines.push(wallDesc(this.length, nL, pL, this.doorDimFrame, this.doorDimFrameConfirmed));
      lines.push(wallDesc(this.width, nW, pW, this.otherDimFrame, this.otherDimFrameConfirmed));
    } else {
      lines.push(wallDesc(this.width, nW, pW, this.doorDimFrame, this.doorDimFrameConfirmed));
      lines.push(wallDesc(this.length, nL, pL, this.otherDimFrame, this.otherDimFrameConfirmed));
    }
    lines.push("");
    const [baseCode, baseExt, baseAdj, extraExt, extraAdj] = cornerKitWithOverflow(
      this.extensions,
      this.adjustor,
      this.productLine
    );
    const detail =
      `${this.corners} corners` +
      (this.extensions ? `, ${this.extensions} extensions, ${this.adjustor} adjustable bar` : "");
    const price = getPrice(baseCode);
    const priceStr = price !== null ? `  $${fmt2(price)}` : "  (price n/a)";
    if (price !== null) {
      total += price;
    }
    lines.push(`Corner/upright kit: ${detail}  [${baseCode}]${priceStr}`);
    if (extraExt || extraAdj) {
      lines.push(
        `  (${baseCode} is our largest kit, covering ${baseExt} extensions/${baseAdj} ` +
          `adjustable bar -- adding itemized pieces for the rest, since we only have what we have)`
      );
      if (extraAdj) {
        const epCode = extensionPieceCode(this.productLine);
        const bundleCode = extAdjBundleCode(this.productLine);
        const bundlePrice = getPrice(bundleCode);
        const remainingExt = Math.max(0, extraExt - extraAdj * 2);
        if (bundlePrice !== null) {
          total += bundlePrice * extraAdj;
          lines.push(
            `  + ${extraAdj} x extension+adjustable bar upgrade box  [${bundleCode}]  ` +
              `($${fmt2(bundlePrice)} ea, $${fmt2(bundlePrice * extraAdj)} total)`
          );
        }
        if (remainingExt) {
          const epPrice = getPrice(epCode);
          if (epPrice !== null) {
            total += epPrice * remainingExt;
            lines.push(
              `  + ${remainingExt} extra extension upright(s)  [${epCode}]  ` +
                `($${fmt2(epPrice)} ea, $${fmt2(epPrice * remainingExt)} total)`
            );
          }
        }
      } else if (extraExt) {
        const epCode = extensionPieceCode(this.productLine);
        const epPrice = getPrice(epCode);
        if (epPrice !== null) {
          total += epPrice * extraExt;
          lines.push(
            `  + ${extraExt} extra extension upright(s)  [${epCode}]  ` +
              `($${fmt2(epPrice)} ea, $${fmt2(epPrice * extraExt)} total)`
          );
        }
      }
    }
    lines.push("");
    lines.push("Bars needed:");
    for (const lengthStr of Object.keys(this.barsByLength).sort((a, b) => Number(a) - Number(b))) {
      const length = Number(lengthStr);
      const count = this.barsByLength[length];
      const boxes = this.boxesByLength[length];
      const boxParts: string[] = [];
      for (const szStr of Object.keys(boxes).sort((a, b) => Number(b) - Number(a))) {
        const sz = Number(szStr);
        const n = boxes[sz];
        const bcode = barBoxCode(length, sz);
        const bprice = getPrice(bcode);
        if (bprice !== null) {
          total += bprice * n;
          boxParts.push(
            `${n}× [${sz <= 2 ? "bag" : "box"}-of-${sz} ${bcode}]  $${fmt2(bprice)} ea = $${fmt2(bprice * n)}`
          );
        } else {
          boxParts.push(`${n}× [${bcode}]  (price n/a)`);
        }
      }
      for (const bp of boxParts) {
        lines.push(`  ${length}' bars × ${count}:  ${bp}`);
      }
    }

    if (this.flowerNeeded) {
      const fprice = getPrice(this.flowerCode as string);
      let fpriceStr: string;
      if (fprice !== null) {
        total += fprice * this.flowerCount;
        fpriceStr = `  $${fmt2(fprice)} ea = $${fmt2(fprice * this.flowerCount)}`;
      } else {
        fpriceStr = "  (price n/a)";
      }
      lines.push(`  Flower posts × ${this.flowerCount}  [${this.flowerCode}]${fpriceStr}`);
      if (this.flowerExtraAdj) {
        const adjCode = adjustableBarCode(this.productLine);
        const adjPrice = getPrice(adjCode);
        let adjPriceStr: string;
        if (adjPrice !== null) {
          total += adjPrice * this.flowerExtraAdj;
          adjPriceStr = `  $${fmt2(adjPrice)} ea = $${fmt2(adjPrice * this.flowerExtraAdj)}`;
        } else {
          adjPriceStr = "  (price n/a)";
        }
        lines.push(`  + ${this.flowerExtraAdj}× adj bar for flower posts  [${adjCode}]${adjPriceStr}`);
      }
    }

    lines.push("");
    lines.push("Fabric panels:");
    const panelKeys = Object.keys(this.panels).sort((a, b) => {
      const [pa, da] = a.split("|");
      const [pb, db] = b.split("|");
      if (Number(pa) !== Number(pb)) return Number(pa) - Number(pb);
      return da.localeCompare(db);
    });
    for (const key of panelKeys) {
      const count = this.panels[key];
      const [plenStr, isDoorStr] = key.split("|");
      const plen = Number(plenStr);
      const isDoor = isDoorStr === "1";
      const kind = isDoor ? "door" : "window";
      const pcode = panelCode(plen, isDoor, this.productLine);
      const pprice = getPrice(pcode);
      let pricePart: string;
      if (pprice !== null) {
        total += pprice * count;
        pricePart = `  $${fmt2(pprice)} ea = $${fmt2(pprice * count)}`;
      } else {
        pricePart = "  (price n/a)";
      }
      lines.push(`  ${plen}' ${kind} × ${count}  [${pcode}]${pricePart}`);
    }
    lines.push("");
    const strapFlag = this.strapConfirmed ? "" : "  ⚠ ESTIMATE -- double-check";
    const scode = strapCode(this.strapKit, this.productLine);
    const sprice = getPrice(scode);
    const spriceStr = sprice !== null ? `  $${fmt2(sprice)}` : "  (price n/a)";
    if (sprice !== null) {
      total += sprice;
    }
    lines.push(
      `Mehadrin strap  [${scode}]  ${this.strapLabelStr} (${this.strapKit}')${spriceStr}${strapFlag}`
    );
    lines.push("");
    if (this.bambooCode) {
      const flag = this.bambooConfirmed ? "" : "  ⚠ ESTIMATE -- double-check";
      const bprice = getPrice(this.bambooCode);
      let bpriceStr: string;
      if (bprice !== null) {
        total += bprice * (this.bambooQty as number);
        bpriceStr = `  $${fmt2(bprice)} ea = $${fmt2(bprice * (this.bambooQty as number))}`;
      } else {
        bpriceStr = "  (price n/a)";
      }
      lines.push(`Bamboo/schach × ${this.bambooQty}  [${this.bambooCode}]${bpriceStr}${flag}`);
    } else {
      lines.push("Bamboo/schach: side > 12' -- handle manually");
    }
    lines.push("");

    lines.push(`TOTAL: $${fmt2(total)}`);
    this.totalPrice = total;
    return lines;
  }

  summaryRows(): SummaryRow[] {
    const rows: SummaryRow[] = [];
    let total = 0.0;

    const [baseCode, baseExt, baseAdj, extraExt, extraAdj] = cornerKitWithOverflow(
      this.extensions,
      this.adjustor,
      this.productLine
    );
    const detail =
      `${this.corners} corners` +
      (this.extensions ? `, ${this.extensions} extensions, ${this.adjustor} adjustable bar` : "");
    const price = getPrice(baseCode);
    if (price !== null) {
      total += price;
    }
    rows.push({ label: `Corner/upright kit (${detail})`, code: baseCode, qty: 1, unit_price: price });
    if (extraAdj) {
      const bundleCode = extAdjBundleCode(this.productLine);
      const bundlePrice = getPrice(bundleCode);
      if (bundlePrice !== null) {
        total += bundlePrice * extraAdj;
      }
      rows.push({
        label: "Extension+adjustable bar upgrade box (beyond largest kit)",
        code: bundleCode,
        qty: extraAdj,
        unit_price: bundlePrice,
      });
      const remainingExt = Math.max(0, extraExt - extraAdj * 2);
      if (remainingExt) {
        const epCode = extensionPieceCode(this.productLine);
        const epPrice = getPrice(epCode);
        if (epPrice !== null) {
          total += epPrice * remainingExt;
        }
        rows.push({
          label: "Extra extension upright(s) (beyond largest kit)",
          code: epCode,
          qty: remainingExt,
          unit_price: epPrice,
        });
      }
    } else if (extraExt) {
      const epCode = extensionPieceCode(this.productLine);
      const epPrice = getPrice(epCode);
      if (epPrice !== null) {
        total += epPrice * extraExt;
      }
      rows.push({
        label: "Extra extension upright(s) (beyond largest kit)",
        code: epCode,
        qty: extraExt,
        unit_price: epPrice,
      });
    }

    for (const lengthStr of Object.keys(this.barsByLength).sort((a, b) => Number(a) - Number(b))) {
      const length = Number(lengthStr);
      const boxes = this.boxesByLength[length];
      for (const szStr of Object.keys(boxes).sort((a, b) => Number(b) - Number(a))) {
        const sz = Number(szStr);
        const n = boxes[sz];
        const bcode = barBoxCode(length, sz);
        const bprice = getPrice(bcode);
        if (bprice !== null) {
          total += bprice * n;
        }
        rows.push({
          label: `${length}' bars (${sz <= 2 ? "bag" : "box"}-of-${sz})`,
          code: bcode,
          qty: n,
          unit_price: bprice,
        });
      }
    }

    if (this.flowerNeeded) {
      const fprice = getPrice(this.flowerCode as string);
      if (fprice !== null) {
        total += fprice * this.flowerCount;
      }
      rows.push({
        label: "Flower posts (interior center support)",
        code: this.flowerCode,
        qty: this.flowerCount,
        unit_price: fprice,
      });
      if (this.flowerExtraAdj) {
        const adjCode = adjustableBarCode(this.productLine);
        const adjPrice = getPrice(adjCode);
        if (adjPrice !== null) {
          total += adjPrice * this.flowerExtraAdj;
        }
        rows.push({
          label: "Extra adjustable bars (flower post connections)",
          code: adjCode,
          qty: this.flowerExtraAdj,
          unit_price: adjPrice,
        });
      }
    }

    const panelKeys = Object.keys(this.panels).sort((a, b) => {
      const [pa, da] = a.split("|");
      const [pb, db] = b.split("|");
      if (Number(pa) !== Number(pb)) return Number(pa) - Number(pb);
      return da.localeCompare(db);
    });
    for (const key of panelKeys) {
      const count = this.panels[key];
      const [plenStr, isDoorStr] = key.split("|");
      const plen = Number(plenStr);
      const isDoor = isDoorStr === "1";
      const kind = isDoor ? "door" : "window";
      const pcode = panelCode(plen, isDoor, this.productLine);
      const pprice = getPrice(pcode);
      if (pprice !== null) {
        total += pprice * count;
      }
      rows.push({ label: `${plen}' ${kind} panel`, code: pcode, qty: count, unit_price: pprice });
    }

    const scode = strapCode(this.strapKit, this.productLine);
    const sprice = getPrice(scode);
    if (sprice !== null) {
      total += sprice;
    }
    rows.push({
      label: `Mehadrin strap kit (${this.strapLabelStr}, ${this.strapKit}')`,
      code: scode,
      qty: 1,
      unit_price: sprice,
    });

    if (this.bambooCode) {
      const bprice = getPrice(this.bambooCode);
      if (bprice !== null) {
        total += bprice * (this.bambooQty as number);
      }
      rows.push({
        label: `Bamboo/schach (${this.bambooKind})`,
        code: this.bambooCode,
        qty: this.bambooQty as number,
        unit_price: bprice,
      });
    }

    this.totalPrice = total;
    return rows;
  }
}

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// DIFF BETWEEN TWO CONFIGS (for extension planning)
// ---------------------------------------------------------------------------

export interface DiffItem {
  label: string;
  qty: number;
  code: string | null;
  unit_price: number | null;
}

export interface DiffResult {
  buy: string[];
  keep: string[];
  extra: string[];
  buy_total: number;
  buy_items: DiffItem[];
  keep_items: DiffItem[];
  extra_items: DiffItem[];
}

function diffConfigsWithFrame(
  old: SukkahConfig,
  newCfg: SukkahConfig,
  extDoorFrame: number[],
  extOtherFrame: number[]
): DiffResult {
  const buy: string[] = [];
  const keep: string[] = [];
  const extra: string[] = [];
  const buyItems: DiffItem[] = [];
  const keepItems: DiffItem[] = [];
  const extraItems: DiffItem[] = [];
  let buyTotal = 0.0;
  const pl = newCfg.productLine;

  const addBuy = (label: string, qty: number, code: string) => {
    const price = getPrice(code);
    if (price !== null) {
      buyTotal += price * qty;
      buy.push(`${label}: ${qty}  [${code}]  ($${fmt2(price)} ea, $${fmt2(price * qty)} total)`);
      buyItems.push({ label, qty, code, unit_price: price });
    } else {
      buy.push(`${label}: ${qty}  [${code}]  (price n/a)`);
      buyItems.push({ label, qty, code, unit_price: null });
    }
  };

  const addKeep = (label: string, qty: number, code: string | null = null) => {
    keep.push(`${label}: ${qty}` + (code ? `  [${code}]` : ""));
    keepItems.push({ label, qty, code, unit_price: code ? getPrice(code) : null });
  };

  const addExtra = (label: string, qty: number, code: string | null = null, note: string = "") => {
    extra.push(`${label}: ${qty}` + (code ? `  [${code}]` : "") + note);
    extraItems.push({ label, qty, code, unit_price: code ? getPrice(code) : null });
  };

  const bucket = (label: string, oldQty: number, newQty: number, code: string | null = null) => {
    const kept = Math.min(oldQty, newQty);
    const need = Math.max(0, newQty - oldQty);
    const left = Math.max(0, oldQty - newQty);
    if (kept) {
      addKeep(label, kept, code);
    }
    if (need) {
      if (code) {
        addBuy(label, need, code);
      } else {
        buy.push(`${label}: ${need}`);
      }
    }
    if (left) {
      addExtra(label, left, code);
    }
  };

  if (old.productLine !== newCfg.productLine) {
    buy.push(
      `NOTE: current is ${old.productLine}, target is ${newCfg.productLine} -- ` +
        `these are different product lines, most parts below are not interchangeable`
    );
  }

  addKeep("Corner uprights (reused from original kit)", 4);

  const newBarsExtensionAware = barsByLengthFromFrames(extDoorFrame, extOtherFrame, pl);

  const newExtensionsActual = 2 * (extDoorFrame.length - 1) + 2 * (extOtherFrame.length - 1);
  const newAdjustorActual = Math.max(extDoorFrame.length - 1, extOtherFrame.length - 1);

  const extReused = Math.min(old.extensions, newExtensionsActual);
  const extNeeded = Math.max(0, newExtensionsActual - old.extensions);
  const extLeftover = Math.max(0, old.extensions - newExtensionsActual);

  const adjReused = Math.min(old.adjustor, newAdjustorActual);
  const adjNeeded = Math.max(0, newAdjustorActual - old.adjustor);
  const adjLeftover = Math.max(0, old.adjustor - newAdjustorActual);

  if (extReused) {
    addKeep("Extension uprights", extReused, extensionPieceCode(pl));
  }
  if (adjReused) {
    addKeep("Adjustable bar", adjReused, adjustableBarCode(pl));
  }

  if (adjNeeded) {
    const boxesNeeded = adjNeeded;
    const extCoveredByBoxes = boxesNeeded * 2;
    const remainingExt = Math.max(0, extNeeded - extCoveredByBoxes);
    addBuy(
      "Extension + adjustable bar upgrade box (2 extensions + 1 adjustable bar)",
      boxesNeeded,
      extAdjBundleCode(pl)
    );
    if (remainingExt) {
      addBuy("Extension uprights", remainingExt, extensionPieceCode(pl));
    }
  } else if (extNeeded) {
    addBuy("Extension uprights", extNeeded, extensionPieceCode(pl));
  }

  if (extLeftover) {
    addExtra("Extension uprights", extLeftover, extensionPieceCode(pl));
  }
  if (adjLeftover) {
    addExtra("Adjustable bar", adjLeftover, adjustableBarCode(pl));
  }

  const allLengths = new Set<number>([
    ...Object.keys(old.barsByLength).map(Number),
    ...Object.keys(newBarsExtensionAware).map(Number),
  ]);
  for (const length of Array.from(allLengths).sort((a, b) => a - b)) {
    const oldQty = old.barsByLength[length] ?? 0;
    const newQty = newBarsExtensionAware[length] ?? 0;
    const kept = Math.min(oldQty, newQty);
    const need = Math.max(0, newQty - oldQty);
    const left = Math.max(0, oldQty - newQty);
    if (kept) {
      addKeep(`${length}' bars`, kept);
    }
    if (need) {
      const boxes = packBoxes(length, need);
      const descParts: string[] = [];
      let lineTotal = 0.0;
      let anyPrice = false;
      const sizes = Object.keys(boxes).map(Number).sort((a, b) => b - a);
      for (const sz of sizes) {
        const n = boxes[sz];
        const bcode = barBoxCode(length, sz);
        const bprice = getPrice(bcode);
        if (bprice !== null) {
          anyPrice = true;
          lineTotal += bprice * n;
          descParts.push(`${n} x [${bcode}] ($${fmt2(bprice)} ea)`);
        } else {
          descParts.push(`${n} x [${bcode}] (price n/a)`);
        }
      }
      const desc = descParts.join(", ");
      if (anyPrice) {
        buyTotal += lineTotal;
        buy.push(`${length}' bars: ${need}  (${desc})  -- $${fmt2(lineTotal)} total`);
      } else {
        buy.push(`${length}' bars: ${need}  (${desc})`);
      }
      for (const sz of sizes) {
        const n = boxes[sz];
        const bcode = barBoxCode(length, sz);
        const bprice = getPrice(bcode);
        buyItems.push({
          label: `${length}' bars (${sz <= 2 ? "bag" : "box"}-of-${sz})`,
          qty: n,
          code: bcode,
          unit_price: bprice,
        });
      }
    }
    if (left) {
      addExtra(`${length}' bars`, left);
    }
  }

  const oldPanelsFrame = panelsFromFrames(old.doorDimFrame, old.otherDimFrame);
  const newPanelsExtensionAware = panelsFromFrames(extDoorFrame, extOtherFrame);

  const allPanelKeys = new Set<string>([
    ...Object.keys(oldPanelsFrame),
    ...Object.keys(newPanelsExtensionAware),
  ]);
  const sortedPanelKeys = Array.from(allPanelKeys).sort((a, b) => {
    const [pa, da] = a.split("|");
    const [pb, db] = b.split("|");
    if (Number(pa) !== Number(pb)) return Number(pa) - Number(pb);
    return da.localeCompare(db);
  });
  for (const key of sortedPanelKeys) {
    const [plenStr, isDoorStr] = key.split("|");
    const plen = Number(plenStr);
    const isDoor = isDoorStr === "1";
    const kind = isDoor ? "door" : "window";
    const code = panelCode(plen, isDoor, pl);
    bucket(
      `${plen}' ${kind} panel`,
      oldPanelsFrame[key] ?? 0,
      newPanelsExtensionAware[key] ?? 0,
      code
    );
  }

  if (old.strapKit === newCfg.strapKit) {
    addKeep(
      `Mehadrin strap kit (${old.strapLabelStr}, ${old.strapKit}')`,
      1,
      strapCode(old.strapKit, pl)
    );
  } else {
    addExtra(
      `Mehadrin strap kit (${old.strapLabelStr}, ${old.strapKit}')`,
      1,
      strapCode(old.strapKit, pl),
      " -- too short for new size"
    );
    const newStrapCode = strapCode(newCfg.strapKit, pl);
    addBuy(`Mehadrin strap kit (${newCfg.strapLabelStr}, ${newCfg.strapKit}')`, 1, newStrapCode);
  }

  const dimensionUnchanged = old.length === newCfg.length || old.width === newCfg.width;

  if (old.bambooCode === newCfg.bambooCode) {
    if (old.bambooCode) {
      const flag = old.bambooConfirmed ? "" : "  (ESTIMATE -- double-check)";
      keep.push(`Bamboo/schach: ${old.bambooQty} x [${old.bambooCode}] (same size still works)${flag}`);
      keepItems.push({
        label: "Bamboo/schach (same size still works)",
        qty: old.bambooQty as number,
        code: old.bambooCode,
        unit_price: getPrice(old.bambooCode),
      });
    }
  } else {
    if (old.bambooCode) {
      const oldFlag = old.bambooConfirmed ? "" : "  (ESTIMATE -- double-check)";
      const note = dimensionUnchanged
        ? " -- NOTE: adding more of this SAME bundle instead of switching may still work " +
          "and cost less; this is a judgment call, check before ordering"
        : "";
      extra.push(`Bamboo/schach: ${old.bambooQty} x [${old.bambooCode}]${oldFlag} (old size)${note}`);
      extraItems.push({
        label: "Bamboo/schach (old size)",
        qty: old.bambooQty as number,
        code: old.bambooCode,
        unit_price: getPrice(old.bambooCode),
      });
    }
    if (newCfg.bambooCode) {
      const flag = newCfg.bambooConfirmed ? "" : "  (ESTIMATE -- double-check)";
      const bprice = getPrice(newCfg.bambooCode);
      if (bprice !== null) {
        buyTotal += bprice * (newCfg.bambooQty as number);
        buy.push(
          `Bamboo/schach: ${newCfg.bambooQty} x [${newCfg.bambooCode}]${flag}  ` +
            `($${fmt2(bprice)} ea, $${fmt2(bprice * (newCfg.bambooQty as number))} total)`
        );
      } else {
        buy.push(`Bamboo/schach: ${newCfg.bambooQty} x [${newCfg.bambooCode}]${flag}  (price n/a)`);
      }
      buyItems.push({
        label: "Bamboo/schach",
        qty: newCfg.bambooQty as number,
        code: newCfg.bambooCode,
        unit_price: bprice,
      });
    } else {
      buy.push("Bamboo/schach: short side exceeds 12' -- handle manually");
    }
  }

  if (old.flowerNeeded || newCfg.flowerNeeded) {
    const oldCount = old.flowerNeeded ? old.flowerCount : 0;
    const newCount = newCfg.flowerNeeded ? newCfg.flowerCount : 0;
    const sameCode = old.flowerNeeded && newCfg.flowerNeeded && old.flowerCode === newCfg.flowerCode;
    if (sameCode) {
      bucket("Flower posts (interior center support)", oldCount, newCount, newCfg.flowerCode);
    } else {
      if (old.flowerNeeded) {
        extra.push(
          `Flower posts (interior center support): ${oldCount} x [${old.flowerCode}] (old size/product line)`
        );
        extraItems.push({
          label: "Flower posts (old size/product line)",
          qty: oldCount,
          code: old.flowerCode,
          unit_price: getPrice(old.flowerCode as string),
        });
      }
      if (newCfg.flowerNeeded) {
        addBuy("Flower posts (interior center support)", newCount, newCfg.flowerCode as string);
      }
    }

    const oldExtraAdj = old.flowerNeeded ? old.flowerExtraAdj : 0;
    const newExtraAdj = newCfg.flowerNeeded ? newCfg.flowerExtraAdj : 0;
    if (newCfg.flowerNeeded) {
      const adjCode = adjustableBarCode(newCfg.productLine);
      bucket("Extra adjustable bars (flower post connections)", oldExtraAdj, newExtraAdj, adjCode);
    } else if (oldExtraAdj) {
      const adjCode = adjustableBarCode(old.productLine);
      extra.push(
        `Extra adjustable bars (flower post connections): ${oldExtraAdj} x [${adjCode}] (old size)`
      );
      extraItems.push({
        label: "Extra adjustable bars (flower post, old size)",
        qty: oldExtraAdj,
        code: adjCode,
        unit_price: getPrice(adjCode),
      });
    }
  }

  return {
    buy,
    keep,
    extra,
    buy_total: buyTotal,
    buy_items: buyItems,
    keep_items: keepItems,
    extra_items: extraItems,
  };
}

export function diffConfigs(old: SukkahConfig, newCfg: SukkahConfig): DiffResult {
  const newDoorDimLength = newCfg.doorDim === "length" ? newCfg.length : newCfg.width;
  const newOtherDimLength = newCfg.doorDim === "length" ? newCfg.width : newCfg.length;

  const initialPool: Pool = { ...old.barsByLength };
  const pair = findBestFramePair(
    old,
    newDoorDimLength,
    newOtherDimLength,
    initialPool,
    newCfg.productLine
  );
  const [extDoorFrame, extOtherFrame] = pair as [number[], number[]];

  return diffConfigsWithFrame(old, newCfg, [...extDoorFrame], [...extOtherFrame]);
}

export function diffConfigsStandardFrame(old: SukkahConfig, newCfg: SukkahConfig): DiffResult {
  return diffConfigsWithFrame(old, newCfg, [...newCfg.doorDimFrame], [...newCfg.otherDimFrame]);
}
