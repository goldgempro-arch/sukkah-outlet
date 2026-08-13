import { CATALOG, type CatalogEntry } from "@/lib/prices";

const ALL_CODES = () => Object.keys(CATALOG()).sort();

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

/** Staff shorthand -> canonical word. Applied after plural stemming. */
const SYNONYMS: Record<string, string> = {
  BAR: "BAR",
  ROD: "BAR",
  POLE: "POLE",
  PIPE: "POLE",
  MAT: "MAT",
  SCHACH: "MAT",
  SKACH: "MAT",
  SECHACH: "MAT",
  CANVA: "CANVAS",
  WALL: "CANVAS",
  BAMBO: "BAMBOO",
  FASTENER: "FASTENER",
  CONNECTOR: "CONNECTOR",
  BRACKET: "BRACKET",
};

function stem(token: string): string {
  let t = token;
  if (t.length > 3 && t.endsWith("ES") && !/[AEIOU]ES$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("S") && !t.endsWith("SS")) t = t.slice(0, -1);
  return SYNONYMS[t] ?? t;
}

/** Normalize units and punctuation so `8'`, `8ft`, `8 FT`, `8 foot` all agree. */
function normalizeText(input: string): string {
  let s = input.toUpperCase();
  s = s.replace(/(\d)\s*(?:['’]|\bFT\b|\bFEET\b|\bFOOT\b)/g, "$1 FT ");
  s = s.replace(/(\d)\s*(?:["”]|\bINCHES\b|\bINCH\b|\bIN\b)/g, "$1 IN ");
  s = s.replace(/\b(?:FEET|FOOT)\b/g, "FT");
  s = s.replace(/\b(?:INCHES|INCH)\b/g, "IN");
  s = s.replace(/(\d)\s*[X]\s*(?=\d)/g, "$1 ");
  return s;
}

function numericVariants(token: string): string[] {
  const out = [token];
  const stripped = token.replace(/^0+/, "");
  if (stripped && stripped !== token) out.push(stripped);
  if (/^\d$/.test(token)) out.push(`0${token}`);
  return out;
}

/** Split into comparable tokens: words, numbers, and letter/digit boundaries. */
function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  const raw = normalized.split(/[^A-Z0-9.]+/).filter(Boolean);
  const out: string[] = [];
  for (const piece of raw) {
    const parts = piece.match(/\d+(?:\.\d+)?|[A-Z]+/g) ?? [piece];
    const pieces = parts.length > 1 ? [piece, ...parts] : parts;
    for (const p of pieces) {
      if (/^\d/.test(p)) out.push(...numericVariants(p));
      else out.push(stem(p));
    }
  }
  return [...new Set(out)];
}

/** Query terms as groups of equivalent variants; each group counts once. */
function queryTerms(input: string): string[][] {
  const normalized = normalizeText(input);
  const raw = normalized.split(/[^A-Z0-9.]+/).filter(Boolean);
  const groups: string[][] = [];
  for (const piece of raw) {
    const parts = piece.match(/\d+(?:\.\d+)?|[A-Z]+/g) ?? [piece];
    const variants = new Set<string>();
    for (const p of parts.length > 1 ? [piece, ...parts] : parts) {
      if (/^\d/.test(p)) numericVariants(p).forEach((v) => variants.add(v));
      else variants.add(stem(p));
    }
    if (variants.size) groups.push([...variants]);
  }
  return groups;
}

/* ------------------------------------------------------------------ *
 * Row index
 * ------------------------------------------------------------------ */

interface RowIndex {
  code: string;
  codeFlat: string;
  descNorm: string;
  priceStr: string;
  tokens: Set<string>;
  tokenList: string[];
}

let indexCache: { source: unknown; rows: RowIndex[] } | null = null;

function rowIndex(): RowIndex[] {
  const catalog = CATALOG();
  if (indexCache && indexCache.source === catalog) return indexCache.rows;
  const rows: RowIndex[] = [];
  for (const code of ALL_CODES()) {
    const entry = catalog[code];
    if (!entry || entry.price === null || entry.price === undefined) continue;
    const desc = entry.desc ?? "";
    const priceStr = entry.price.toFixed(2);
    const tokens = new Set<string>([
      ...tokenize(code),
      ...tokenize(desc),
      priceStr,
      String(entry.price),
    ]);
    rows.push({
      code,
      codeFlat: code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      descNorm: normalizeText(desc),
      priceStr,
      tokens,
      tokenList: [...tokens],
    });
  }
  indexCache = { source: catalog, rows };
  return rows;
}

function buildVocabulary(): string[] {
  const vocab = new Set<string>();
  for (const [code, entry] of Object.entries(CATALOG())) {
    for (const word of code.toUpperCase().split(/[^A-Z0-9]+/)) {
      if (word.length >= 3) vocab.add(word);
    }
    for (const word of (entry.desc ?? "").toUpperCase().split(/[^A-Z0-9]+/)) {
      if (word.length >= 3 && !/^\d+$/.test(word)) vocab.add(word);
    }
  }
  return [...vocab];
}

let vocabularyCache: string[] | null = null;
function vocabulary(): string[] {
  if (!vocabularyCache) vocabularyCache = buildVocabulary();
  return vocabularyCache;
}

/** Ratio-based similarity, close enough to difflib.SequenceMatcher for typo tolerance. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols).fill(0);
  const cur = new Array<number>(cols).fill(0);
  let distance = 0;
  for (let i = 0; i < rows; i++) prev[i] = 0;
  let previous = prev;
  let current = cur;
  for (let i = 1; i < rows; i++) {
    current[0] = 0;
    for (let j = 1; j < cols; j++) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  distance = previous[cols - 1] ?? 0;
  return (2 * distance) / (a.length + b.length);
}

function closestWord(token: string, cutoff = 0.72): string | null {
  let best: { word: string; score: number } | null = null;
  for (const word of vocabulary()) {
    const score = similarity(token, word);
    if (score >= cutoff && (best === null || score > best.score)) best = { word, score };
  }
  return best ? best.word : null;
}

/** How well one query token matches a row: 1 exact, 0.8 prefix/substring, 0.6 fuzzy, 0 none. */
function tokenScore(token: string, row: RowIndex): number {
  if (row.tokens.has(token)) return 1;
  if (token.length >= 2) {
    if (row.codeFlat.includes(token)) return 0.9;
    for (const rt of row.tokenList) {
      if (rt.startsWith(token) || (token.length >= 4 && rt.includes(token))) return 0.8;
    }
  }
  if (token.length >= 4 && !/^\d/.test(token)) {
    for (const rt of row.tokenList) {
      if (!/^\d/.test(rt) && similarity(token, rt) >= 0.82) return 0.6;
    }
  }
  return 0;
}

function match(groups: string[][], typedRaw: string): string[] {
  if (!groups.length) return [];
  const flatQuery = typedRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normQuery = normalizeText(typedRaw).replace(/\s+/g, " ").trim();
  const priceNeedle = typedRaw.replace(/[$,]/g, "").trim();
  const scored: Array<{ code: string; score: number }> = [];

  for (const row of rowIndex()) {
    let sum = 0;
    let matched = 0;
    for (const group of groups) {
      let best = 0;
      for (const tok of group) {
        const s = tokenScore(tok, row);
        if (s > best) best = s;
        if (best === 1) break;
      }
      if (best > 0) {
        matched += 1;
        sum += best;
      }
    }

    const priceHit = priceNeedle.length >= 2 && row.priceStr.includes(priceNeedle);
    if (priceHit && matched === 0) {
      scored.push({ code: row.code, score: 40 });
      continue;
    }

    const needed = groups.length <= 2 ? groups.length : groups.length - 1;
    if (matched < needed) continue;

    let score = (sum / groups.length) * 100;
    if (row.codeFlat === flatQuery) score += 1000;
    else if (flatQuery.length >= 2 && row.codeFlat.startsWith(flatQuery)) score += 400;
    if (normQuery && row.descNorm.startsWith(normQuery)) score += 120;
    else if (normQuery.length >= 3 && row.descNorm.includes(normQuery)) score += 60;
    if (matched === groups.length) score += 50;
    if (priceHit) score += 20;
    score -= Math.min(row.code.length, 20) * 0.1;

    scored.push({ code: row.code, score });
  }

  scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return scored.map((s) => s.code);
}

export interface SearchResult {
  codes: string[];
  suggestion: string | null;
}

/** Staff type sizes like "8x10"; stored codes have no "x", so drop it for matching. */
function stripSizeX(input: string): string {
  return input.replace(/(\d+)\s*[xX]\s*(\d+)/g, "$1$2");
}

export function searchCatalog(query: string): SearchResult {
  const typedRaw = stripSizeX(query.trim());
  if (!typedRaw) return { codes: [], suggestion: null };
  const groups = queryTerms(typedRaw);

  const ordered = match(groups, typedRaw);
  if (ordered.length) return { codes: ordered, suggestion: null };

  const tokens = tokenize(typedRaw);
  const corrected: string[] = [];
  let changed = false;
  for (const tok of tokens) {
    if (/^\d+$/.test(tok) || vocabulary().includes(tok)) {
      corrected.push(tok);
      continue;
    }
    const close = closestWord(tok);
    if (close) {
      corrected.push(close);
      changed = true;
    } else {
      corrected.push(tok);
    }
  }

  if (changed) {
    const fixed = match(
      corrected.map((w) => [w]),
      corrected.join(" "),
    );
    if (fixed.length) {
      const suggestion = corrected
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(" ");
      return { codes: fixed, suggestion };
    }
  }
  return { codes: [], suggestion: null };
}

export function entryFor(code: string): CatalogEntry | undefined {
  return CATALOG()[code];
}