import { closestRegionGuess, suggestRegionFromZip } from "@/lib/delivery-zones";

export interface ZipRegionResult {
  /** Empty string means "no region could be determined yet". */
  region: string;
  /** Warning/explainer text to show under the zip field ("" when silent). */
  hint: string;
  /** True when the zip field is empty -> caller should reset region + cost. */
  empty: boolean;
}

/**
 * Shared zip -> delivery-region resolution used by Canvas, Schach and Modular.
 * Exact prefix match wins; otherwise fall back to the nearest known zip prefix
 * and flag it as an unconfirmed guess.
 */
export function resolveZipRegion(zip: string): ZipRegionResult {
  const digits = String(zip ?? "").replace(/\D/g, "");
  if (!digits) return { region: "", hint: "", empty: true };

  const exact = suggestRegionFromZip(zip);
  if (exact) return { region: exact, hint: "", empty: false };

  if (digits.length < 5) return { region: "", hint: "", empty: false };

  const guess = closestRegionGuess(zip);
  if (guess) {
    return {
      region: guess.region,
      hint: `No exact match for this zip — closest known area is ${guess.region} (near ${guess.prefix}xx). Unconfirmed guess, please verify or pick a different region.`,
      empty: false,
    };
  }
  return {
    region: "",
    hint: "No matching or nearby region found — pick one manually above.",
    empty: false,
  };
}