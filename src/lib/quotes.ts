export interface QuoteLineItem {
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface QuoteSummary {
  subtotal: number;
  freight: number;
  accessories: number;
  discount_percent: number;
  discount_amount: number;
  notes: string;
}

export interface Quote {
  quote_id: string;
  created_at: string;
  customer_name: string;
  product_line: string;
  sukkah_code: string | null;
  size: string | null;
  color: string | null;
  mat_type: string | null;
  fedex: boolean;
  line_items: QuoteLineItem[];
  summary: QuoteSummary;
  text: string;
}

export function lineTotal(item: QuoteLineItem): number {
  return item.unit_price ? item.unit_price * item.quantity : 0;
}

export function emptySummary(): QuoteSummary {
  return {
    subtotal: 0,
    freight: 0,
    accessories: 0,
    discount_percent: 0,
    discount_amount: 0,
    notes: "",
  };
}

export function calculateTotal(summary: QuoteSummary): number {
  let subtotal = summary.subtotal;
  if (summary.discount_amount > 0) {
    subtotal -= Math.min(summary.discount_amount, subtotal);
  } else {
    const pct = Math.max(0, Math.min(100, summary.discount_percent));
    subtotal = subtotal * (1 - pct / 100);
  }
  return subtotal + summary.freight + summary.accessories;
}

const STORAGE_KEY = "sukkah-outlet-quotes";

export function listQuotes(): Quote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Quote[]) : [];
  } catch {
    return [];
  }
}

function persist(quotes: Quote[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}

export function saveQuote(quote: Quote): Quote[] {
  const quotes = listQuotes().filter((q) => q.quote_id !== quote.quote_id);
  const next = [quote, ...quotes];
  persist(next);
  return next;
}

export function deleteQuote(quoteId: string): Quote[] {
  const next = listQuotes().filter((q) => q.quote_id !== quoteId);
  persist(next);
  return next;
}

export function newQuoteId(): string {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
  return `Q${stamp}`;
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "--";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}