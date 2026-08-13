import type { ManualOrderItem } from "@/lib/order-items";

const KEY = "schach-handoff-v1";
const SIZE_KEY = "schach-target-size-v1";
const EXTENSION_DRAFT_KEY = "extension-draft-v1";

export interface ExtensionDraft {
  line: string;
  oldSide: { length: string; width: string };
  newSide: { length: string; width: string };
  currentDiscount: string;
  fullNewDiscount: string;
  buyDiscount: string;
  deliveryMode: string;
  zip: string;
  region: string;
  deliveryCost: string;
  excluded: string[];
  manual: ManualOrderItem[];
}

/** Mats picked on the Schach page, waiting to be folded into the Extension plan. */
export function pushSchachItems(items: ManualOrderItem[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(items));
}

export function takeSchachItems(): ManualOrderItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return [];
  window.sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ManualOrderItem[]) : [];
  } catch {
    return [];
  }
}

/** Target sukkah size (e.g. "12x8") sent from Extension to Schach. */
export function pushTargetSize(size: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SIZE_KEY, size);
}

export function takeTargetSize(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.sessionStorage.getItem(SIZE_KEY);
  if (v) window.sessionStorage.removeItem(SIZE_KEY);
  return v;
}

export function saveExtensionDraft(draft: ExtensionDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(EXTENSION_DRAFT_KEY, JSON.stringify(draft));
}

export function takeExtensionDraft(): ExtensionDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(EXTENSION_DRAFT_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(EXTENSION_DRAFT_KEY);
  try {
    return JSON.parse(raw) as ExtensionDraft;
  } catch {
    return null;
  }
}